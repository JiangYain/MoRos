import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import {
  SessionLibrary,
  type SessionStorage,
} from "../src/main/agent/session-library.ts";

const sessionDir = resolve("archive-box-tests");
const sessionPath = join(sessionDir, "one.jsonl");
const archiveDir = join(sessionDir, "archive");
const olderArchivedPath = join(archiveDir, "two.jsonl");
const newerArchivedPath = join(archiveDir, "three.jsonl");

function fakeStorage(
  operations: string[],
  overrides: Partial<SessionStorage> = {},
): SessionStorage {
  return {
    list: async () => [{
      path: sessionPath,
      id: "one",
      firstMessage: "Question",
      created: new Date(10),
      modified: new Date(20),
      messageCount: 2,
    }],
    listArchived: async (_workspaceDir, requestedArchiveDir) => {
      operations.push(`list-archived:${requestedArchiveDir}`);
      return [
        {
          path: olderArchivedPath,
          id: "two",
          name: "Older archived",
          firstMessage: "First question",
          created: new Date(100),
          modified: new Date(200),
          messageCount: 4,
          archivedAt: new Date(500),
        },
        {
          path: newerArchivedPath,
          id: "three",
          name: "Newer archived",
          firstMessage: "Second question",
          created: new Date(300),
          modified: new Date(400),
          messageCount: 2,
          archivedAt: new Date(900),
        },
      ];
    },
    open: () => ({
      appendSessionInfo: () => {},
      getSessionName: () => undefined,
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
    exists: async (path) => {
      operations.push(`exists:${path}`);
      return false;
    },
    ...overrides,
  };
}

function libraryWith(operations: string[], overrides: Partial<SessionStorage> = {}): SessionLibrary {
  return new SessionLibrary({
    state: () => ({ workspaceDir: "C:\\workspace", language: "en", thread: [] }),
    withActiveSessionDetached: async (_path, mutation) => mutation(),
    emitSessionsChanged: () => operations.push("emit"),
    generateTitle: async () => null,
    storage: fakeStorage(operations, overrides),
  });
}

test("archive box lists archived sessions sorted by archive time", async () => {
  const operations: string[] = [];
  const library = libraryWith(operations);

  const archived = await library.listArchived();

  assert.deepEqual(archived, [
    {
      path: newerArchivedPath,
      id: "three",
      name: "Newer archived",
      firstMessage: "Second question",
      archivedAt: 900,
    },
    {
      path: olderArchivedPath,
      id: "two",
      name: "Older archived",
      firstMessage: "First question",
      archivedAt: 500,
    },
  ]);
  assert.deepEqual(operations, [`list-archived:${archiveDir}`]);
});

test("archive box lists nothing without a session directory anchor", async () => {
  const operations: string[] = [];
  const library = libraryWith(operations, { list: async () => [] });

  assert.deepEqual(await library.listArchived(), []);
  assert.deepEqual(operations, []);
});

test("restore moves an archived session back into the session directory", async () => {
  const operations: string[] = [];
  const library = libraryWith(operations);

  const result = await library.restore(olderArchivedPath);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(operations, [
    `list-archived:${archiveDir}`,
    `exists:${join(sessionDir, "two.jsonl")}`,
    `move:${olderArchivedPath}->${join(sessionDir, "two.jsonl")}`,
    "emit",
  ]);
});

test("restore rejects paths that are not listed in the archive directory", async () => {
  const operations: string[] = [];
  const library = libraryWith(operations);

  const result = await library.restore(join(sessionDir, "one.jsonl"));

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /archive directory/i);
  assert.equal(operations.some((operation) => operation.startsWith("move:")), false);
  assert.equal(operations.includes("emit"), false);
});

test("restore rejects listed entries that resolve outside the archive directory", async () => {
  const operations: string[] = [];
  const escapedPath = join(sessionDir, "escaped.jsonl");
  const library = libraryWith(operations, {
    listArchived: async () => [{
      path: escapedPath,
      id: "escaped",
      firstMessage: "Question",
      created: new Date(100),
      modified: new Date(200),
      messageCount: 1,
      archivedAt: new Date(300),
    }],
  });

  const result = await library.restore(escapedPath);

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /archive directory/i);
  assert.equal(operations.some((operation) => operation.startsWith("move:")), false);
});

test("restore refuses to overwrite an existing session file with the same name", async () => {
  const operations: string[] = [];
  const library = libraryWith(operations, {
    exists: async (path) => {
      operations.push(`exists:${path}`);
      return true;
    },
  });

  const result = await library.restore(olderArchivedPath);

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /same name/i);
  assert.equal(operations.some((operation) => operation.startsWith("move:")), false);
  assert.equal(operations.includes("emit"), false);
});
