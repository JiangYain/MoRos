import assert from "node:assert/strict";
import test from "node:test";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { UiThreadItem } from "../src/shared/types.ts";
import {
  SessionLibrary,
  type SessionStorage,
} from "../src/main/agent/session-library.ts";
import { LifecycleCoordinator } from "../src/main/agent/lifecycle-coordinator.ts";
import { SessionOwnerMutationCoordinator } from "../src/main/agent/session-owner-mutation.ts";

const sessionDir = resolve("session-library-tests");
const sessionPath = join(sessionDir, "one.jsonl");

function thread(): UiThreadItem[] {
  return [
    { kind: "user", id: "u-1", text: "Question", ts: 10 },
    {
      kind: "assistant",
      id: "a-1",
      blocks: [{ type: "text", text: "Answer" }],
      streaming: false,
      ts: 20,
    },
  ];
}

function fakeStorage(
  operations: string[],
  overrides: Partial<SessionStorage> = {},
): SessionStorage {
  let persistedName: string | undefined;
  const listed = [{
    path: sessionPath,
    id: "one",
    cwd: "C:\\workspace",
    firstMessage: "Question",
    created: new Date(10),
    modified: new Date(20),
    messageCount: 2,
  }];
  return {
    list: async () => listed,
    listAll: async () => listed,
    listArchived: async () => [],
    open: () => ({
      appendSessionInfo: (name) => {
        persistedName = name;
        operations.push(`persist:${name}`);
      },
      getSessionName: () => persistedName,
    }),
    ensureDirectory: async (path) => {
      operations.push(`mkdir:${path}`);
    },
    move: async (source, target) => {
      operations.push(`move:${source}->${target}`);
    },
    remove: async (path) => {
      operations.push(`remove:${path}`);
    },
    exists: async () => false,
    ...overrides,
  };
}

test("session library preserves cross-workspace cwd and models legacy cwd explicitly", async () => {
  const operations: string[] = [];
  const otherPath = join(resolve("other-session-library-tests"), "two.jsonl");
  const library = new SessionLibrary({
    state: () => ({ workspaceDir: "C:\\current", language: "en", thread: [] }),
    withActiveSessionDetached: async (_path, mutation) => mutation(),
    emitSessionsChanged: () => {},
    generateTitle: async () => null,
    storage: fakeStorage(operations, {
      listAll: async () => [
        {
          path: sessionPath,
          id: "one",
          cwd: "C:\\workspace-one",
          firstMessage: "One",
          created: new Date(10),
          modified: new Date(20),
          messageCount: 1,
        },
        {
          path: otherPath,
          id: "two",
          cwd: "",
          firstMessage: "Two",
          created: new Date(30),
          modified: new Date(40),
          messageCount: 1,
        },
      ],
    }),
  });

  const sessions = await library.list();
  assert.equal(sessions.find((session) => session.id === "one")?.cwd, "C:\\workspace-one");
  assert.equal(sessions.find((session) => session.id === "two")?.cwd, null);
});

test("session library detaches the active session before an archive mutation", async () => {
  const operations: string[] = [];
  const library = new SessionLibrary({
    state: () => ({
      workspaceDir: "C:\\workspace",
      language: "en",
      active: { path: sessionPath, id: "one", setName: () => {} },
      thread: thread(),
    }),
    withActiveSessionDetached: async (_path, mutation) => {
      operations.push("detach");
      return mutation();
    },
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => null,
    storage: fakeStorage(operations),
  });

  assert.deepEqual(await library.archive(sessionPath), { ok: true, sessionId: "one" });
  assert.match(operations[0] ?? "", /^mkdir:/);
  assert.equal(operations[1], "detach");
  assert.match(operations[2] ?? "", /^move:/);
  assert.equal(operations[3], "emit");
});

test("successful delete returns its internal session ID", async () => {
  const operations: string[] = [];
  const library = new SessionLibrary({
    state: () => ({ workspaceDir: "C:\\workspace", language: "en", thread: [] }),
    withActiveSessionDetached: async (_path, mutation) => mutation(),
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => null,
    storage: fakeStorage(operations),
  });

  assert.deepEqual(await library.delete(sessionPath), { ok: true, sessionId: "one" });
  assert.deepEqual(operations, [`remove:${sessionPath}`, "emit"]);
});

test("session library rejects unlisted paths before filesystem mutation", async () => {
  const operations: string[] = [];
  const library = new SessionLibrary({
    state: () => ({ workspaceDir: "C:\\workspace", language: "en", thread: [] }),
    withActiveSessionDetached: async (_path, mutation) => mutation(),
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => null,
    storage: fakeStorage(operations),
  });

  const result = await library.delete("C:\\sessions\\unlisted.jsonl");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /does not exist|invalid/i);
  assert.deepEqual(operations, []);
});

test("session open resolution returns the listed canonical path", async () => {
  const operations: string[] = [];
  const library = new SessionLibrary({
    state: () => ({ workspaceDir: "workspace", language: "en", thread: [] }),
    withActiveSessionDetached: async (_path, mutation) => mutation(),
    emitSessionsChanged: () => {},
    generateTitle: async () => null,
    storage: fakeStorage(operations),
  });
  const alias = [
    dirname(sessionPath),
    "nested",
    "..",
    basename(sessionPath),
  ].join(sep);

  assert.deepEqual(await library.resolveListedPath(alias), {
    ok: true,
    path: sessionPath,
    sessionDir,
    sessionId: "one",
  });
  assert.equal(await library.requireListedPath(alias), sessionPath);
});

test("session open resolution rejects traversal and unlisted paths", async () => {
  const operations: string[] = [];
  const library = new SessionLibrary({
    state: () => ({ workspaceDir: "workspace", language: "en", thread: [] }),
    withActiveSessionDetached: async (_path, mutation) => mutation(),
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => null,
    storage: fakeStorage(operations),
  });
  const traversal = [
    dirname(sessionPath),
    "..",
    "outside.jsonl",
  ].join(sep);
  const unlisted = join(dirname(sessionPath), "unlisted.jsonl");

  for (const candidate of [traversal, unlisted]) {
    const resolvedPath = await library.resolveListedPath(candidate);
    assert.equal(resolvedPath.ok, false);
    await assert.rejects(library.requireListedPath(candidate), /does not exist|invalid/i);
  }
  assert.deepEqual(operations, []);
});

test("session library coalesces concurrent automatic title requests", async () => {
  const operations: string[] = [];
  let resolveTitle!: (title: string) => void;
  const title = new Promise<string>((resolve) => {
    resolveTitle = resolve;
  });
  let titleCalls = 0;
  let activeName: string | undefined;
  const library = new SessionLibrary({
    state: () => ({
      workspaceDir: "C:\\workspace",
      language: "en",
      active: {
        path: sessionPath,
        id: "one",
        name: activeName,
        setName: (name) => {
          activeName = name;
          operations.push(`active:${name}`);
        },
      },
      thread: thread(),
    }),
    withActiveSessionDetached: async (_path, mutation) => mutation(),
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => {
      titleCalls += 1;
      return title;
    },
    storage: fakeStorage(operations),
  });

  const first = library.generateMissingTitle();
  const second = library.generateMissingTitle();
  assert.equal(titleCalls, 1);
  resolveTitle("Concise title");
  await Promise.all([first, second]);

  assert.equal(activeName, "Concise title");
  assert.deepEqual(operations, ["active:Concise title"]);
});

async function recoveryBoundary(operations: string[]) {
  interface OwnedSession {
    path: string;
  }
  const lifecycle = new LifecycleCoordinator<OwnedSession>(() => {});
  await lifecycle.replace(async () => ({ path: sessionPath }));
  const coordinator = new SessionOwnerMutationCoordinator<OwnedSession, string>({
    lifecycle,
    pathOf: (session) => session.path,
    samePath: (first, second) => resolve(first) === resolve(second),
    detach: async (owner) => {
      operations.push("detach");
      await owner.replace(async () => ({ path: join(sessionDir, "fresh.jsonl") }));
    },
    restore: async (owner, path) => {
      operations.push("restore");
      await owner.replace(async () => ({ path }));
    },
  });
  return { lifecycle, coordinator };
}

test("failed active-session archive restores the original lifecycle owner", async () => {
  const operations: string[] = [];
  const { lifecycle, coordinator } = await recoveryBoundary(operations);
  const library = new SessionLibrary({
    state: () => ({
      workspaceDir: "C:\\workspace",
      language: "en",
      active: { path: lifecycle.current?.path, id: "one", setName: () => {} },
      thread: thread(),
    }),
    withActiveSessionDetached: (path, mutation) => coordinator.run(path, mutation),
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => null,
    storage: fakeStorage(operations, {
      move: async () => {
        operations.push("move:failed");
        throw new Error("archive disk failure");
      },
    }),
  });

  const result = await library.archive(sessionPath);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /archive disk failure/);
  assert.equal(lifecycle.current?.path, sessionPath);
  assert.deepEqual(operations.slice(-3), ["detach", "move:failed", "restore"]);
  assert.equal(operations.includes("emit"), false);
});

test("failed active-session delete restores the original lifecycle owner", async () => {
  const operations: string[] = [];
  const { lifecycle, coordinator } = await recoveryBoundary(operations);
  const library = new SessionLibrary({
    state: () => ({
      workspaceDir: "C:\\workspace",
      language: "en",
      active: { path: lifecycle.current?.path, id: "one", setName: () => {} },
      thread: thread(),
    }),
    withActiveSessionDetached: (path, mutation) => coordinator.run(path, mutation),
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => null,
    storage: fakeStorage(operations, {
      remove: async () => {
        operations.push("remove:failed");
        throw new Error("delete disk failure");
      },
    }),
  });

  const result = await library.delete(sessionPath);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /delete disk failure/);
  assert.equal(lifecycle.current?.path, sessionPath);
  assert.deepEqual(operations, ["detach", "remove:failed", "restore"]);
  assert.equal(operations.includes("emit"), false);
});
