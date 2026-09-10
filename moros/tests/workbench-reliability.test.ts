import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rename, rmdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { WorkbenchArtifacts } from "../src/main/workbench/artifacts.ts";
import { WorkbenchService, type WorkbenchServiceOptions } from "../src/main/workbench/service.ts";
import { WorkbenchStateRepository } from "../src/main/workbench/state.ts";
import { workbenchScopeKey, type WorkbenchFeedback } from "../src/shared/workbench.ts";
import { decodeWorkbenchRequest } from "../src/shared/workbench-contract.ts";

async function fixture(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "moros-workbench-reliability-"));
  t.after(async () => { assert.ok(relative(tmpdir(), resolve(dir)).startsWith("moros-workbench-reliability-")); await rm(dir, { recursive: true, force: true }); });
  const workspaceDir = join(dir, "workspace");
  await mkdir(workspaceDir);
  const scope = { workspaceDir, sessionId: "one" };
  const directory = join(dir, "state");
  const statePath = join(directory, `${createHash("sha256").update(workbenchScopeKey(scope)).digest("hex")}.json`);
  return { dir, scope, directory, statePath };
}
const comment: WorkbenchFeedback = { id: "one", kind: "file", comment: "Keep this feedback", selected: true, createdAt: 1, source: { path: "result.html", line: 1 } };

test("failed persistence never commits feedback removal, revisions or in-place mutations", async (t) => {
  const { scope, directory, statePath } = await fixture(t);
  const repository = new WorkbenchStateRepository(directory);
  const before = await repository.update(scope, (state) => ({ ...state, feedback: [comment] }));
  await rename(statePath, `${statePath}.backup`);
  await mkdir(statePath);
  await assert.rejects(repository.update(scope, (state) => { state.feedback.length = 0; return state; }));
  assert.deepEqual(await repository.get(scope), before);
  assert.equal((await readdir(directory)).some((path) => path.endsWith(".tmp")), false);
  await assert.rejects(new WorkbenchStateRepository(directory).get(scope), /WB_STATE_READ_FAILED/);
  await rmdir(statePath);
  await rename(`${statePath}.backup`, statePath);
  await repository.update(scope, (state) => ({ ...state, width: 700 }));
  const restored = await new WorkbenchStateRepository(directory).get(scope);
  assert.deepEqual(restored.feedback, [comment]);
  assert.equal(restored.revision, before.revision + 1);
});

test("failed open rolls back only the new terminal; failed close keeps the existing process", async (t) => {
  const { scope, directory, statePath } = await fixture(t);
  const running = new Set<string>();
  let events = 0;
  const options = { directory, currentScope: () => scope, emit() { events++; },
    terminals: { create(_scope: unknown, id: string) { running.add(id); }, isRunning(_scope: unknown, id: string) { return running.has(id); }, close(_scope: unknown, id: string) { running.delete(id); }, closeAll() {} },
    browsers: { hideAll() {}, closeAll() {} },
  } as unknown as WorkbenchServiceOptions;
  const service = new WorkbenchService(options);
  t.after(() => service.shutdown());
  const state = (await service.execute({ scope, operation: "open", resource: { kind: "terminal" } })).state;
  const id = state.activeTabId!;
  await rename(statePath, `${statePath}.backup`); await mkdir(statePath);
  const priorEvents = events;
  await assert.rejects(service.execute({ scope, operation: "open", resource: { kind: "terminal" } }));
  assert.deepEqual([...running], [id]);
  const reply = await service.execute({ scope, operation: "close", tabId: id });
  assert.ok(reply.confirmation);
  await assert.rejects(service.execute({ scope, operation: "close", tabId: id, confirmation: reply.confirmation.token }));
  assert.deepEqual([...running], [id]);
  assert.deepEqual((await service.execute({ scope, operation: "state" })).state, state);
  assert.equal(events, priorEvents);
});

test("an external file picker grant cannot fetch sibling assets through the artifact server", async (t) => {
  const { dir, scope, directory } = await fixture(t);
  const outside = join(dir, "outside"); await mkdir(outside);
  const selected = join(outside, "selected.html");
  await writeFile(selected, "<h1>Selected</h1>"); await writeFile(join(outside, "neighbour.html"), "private neighbour");
  await writeFile(join(scope.workspaceDir, "index.html"), "<h1>Workspace</h1>");
  await writeFile(join(scope.workspaceDir, "style.css"), "h1{color:red}");
  await mkdir(join(scope.workspaceDir, ".hidden"));
  await writeFile(join(scope.workspaceDir, ".hidden", "payload.js"), "globalThis.hidden = true");
  let origin = "";
  const artifacts = new WorkbenchArtifacts(() => origin);
  const server = createServer((request, response) => { void artifacts.handle(request, response).then((handled) => { if (!handled) { response.writeHead(404); response.end(); } }); });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
  t.after(() => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()); }));
  const service = new WorkbenchService({ directory, currentScope: () => scope, emit() {}, artifacts, pickFile: async () => selected,
    browsers: { closeAll() {} }, terminals: { closeAll() {} },
  } as unknown as WorkbenchServiceOptions);
  t.after(() => service.shutdown());
  const state = (await service.execute({ scope, operation: "pick-file" })).state;
  const { file } = await service.execute({ scope, operation: "file", tabId: state.activeTabId!, action: "read" });
  assert.equal(file.previewAssetsRestricted, true);
  assert.equal((await fetch(file.previewUrl!)).status, 200);
  assert.equal((await fetch(new URL("neighbour.html", file.previewUrl))).status, 404);
  await assert.rejects(service.execute({ scope, operation: "open", resource: { kind: "file", path: join(outside, "neighbour.html") } }), /WB_OUTSIDE_WORKSPACE/);
  const workspaceUrl = artifacts.url(scope, join(scope.workspaceDir, "index.html"), scope.workspaceDir);
  assert.equal((await fetch(new URL("style.css", workspaceUrl))).status, 200);
  assert.equal((await fetch(new URL(".hidden/payload.js", workspaceUrl))).status, 404);
  assert.equal((await fetch(new URL("..%5c..%5coutside%5cneighbour.html", workspaceUrl))).status, 404);
});

test("action-specific contracts reject incomplete payloads and empty file resources", () => {
  const scope = { workspaceDir: "/workspace", sessionId: "one" }, tabId = "tab";
  for (const request of [
    { operation: "terminal", action: "input" }, { operation: "terminal", action: "resize", cols: 80 },
    { operation: "browser", action: "navigate" }, { operation: "browser", action: "bounds" }, { operation: "browser", action: "annotate" },
    { operation: "review", action: "stage" }, { operation: "review", action: "revert" },
    { operation: "feedback", action: "add" }, { operation: "feedback", action: "remove" },
    { operation: "feedback", action: "update", ids: ["one"] }, { operation: "open", resource: { kind: "file", path: "" } },
  ]) assert.throws(() => decodeWorkbenchRequest({ scope, tabId, ...request }), JSON.stringify(request));
  assert.deepEqual(decodeWorkbenchRequest({ scope, operation: "open", resource: { kind: "files" } }), { scope, operation: "open", resource: { kind: "files" } });
});

test("legacy Files home migrates while preserving its tab identity and active state", async (t) => {
  const { scope, directory, statePath } = await fixture(t);
  await mkdir(directory);
  await writeFile(statePath, JSON.stringify({ scope, tabs: [{ id: "home", key: "files", title: "Files", resource: { kind: "file", path: "" } }], activeTabId: "home", open: true }));
  const state = await new WorkbenchStateRepository(directory).get(scope);
  assert.equal(state.activeTabId, "home"); assert.equal(state.open, true);
  assert.deepEqual(state.tabs[0].resource, { kind: "files" });
});
