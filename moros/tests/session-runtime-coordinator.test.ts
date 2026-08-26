import assert from "node:assert/strict";
import test from "node:test";
import { SessionOwnerMutationCoordinator } from "../src/main/agent/session-owner-mutation.ts";
import { SessionRuntimeCoordinator } from "../src/main/agent/session-runtime-coordinator.ts";

interface Runtime {
  id: string;
  path: string;
  running: boolean;
}

function runtime(id: string, running: boolean): Runtime {
  return { id, path: `C:\\sessions\\${id}.jsonl`, running };
}

test("navigating away keeps a running session alive and makes it resumable", async () => {
  const disposed: string[] = [];
  const coordinator = new SessionRuntimeCoordinator<Runtime>({
    dispose: (resource) => { disposed.push(resource.id); },
    isRunning: (resource) => resource.running,
    keyOf: (resource) => resource.path,
  });
  const first = await coordinator.navigate(async () => runtime("first", true));
  const second = await coordinator.navigate(async () => runtime("second", false));

  assert.equal(coordinator.current, second);
  assert.deepEqual(coordinator.background, [first]);
  assert.deepEqual(disposed, []);

  let recreated = false;
  const resumed = await coordinator.navigate(async () => {
    recreated = true;
    return runtime("unexpected", false);
  }, first.path);

  assert.equal(resumed, first);
  assert.equal(coordinator.current, first);
  assert.equal(recreated, false);
  assert.deepEqual(coordinator.background, []);
  assert.deepEqual(disposed, ["second"]);
});

test("a settled background session is released without disturbing the foreground", async () => {
  const disposed: string[] = [];
  const coordinator = new SessionRuntimeCoordinator<Runtime>({
    dispose: (resource) => { disposed.push(resource.id); },
    isRunning: (resource) => resource.running,
    keyOf: (resource) => resource.path,
  });
  const first = await coordinator.navigate(async () => runtime("first", true));
  const second = await coordinator.navigate(async () => runtime("second", false));

  first.running = false;
  await coordinator.settle(first);

  assert.equal(coordinator.current, second);
  assert.deepEqual(coordinator.background, []);
  assert.deepEqual(disposed, ["first"]);
});

test("non-navigation replacement keeps strong single-owner cleanup semantics", async () => {
  const disposed: string[] = [];
  const coordinator = new SessionRuntimeCoordinator<Runtime>({
    dispose: (resource) => { disposed.push(resource.id); },
    isRunning: (resource) => resource.running,
    keyOf: (resource) => resource.path,
  });
  await coordinator.navigate(async () => runtime("current", true));

  const replacement = await coordinator.replace(async () => runtime("reconfigured", false));

  assert.equal(coordinator.current, replacement);
  assert.deepEqual(coordinator.background, []);
  assert.deepEqual(disposed, ["current"]);
});

test("clear disposes both the foreground and every retained background session", async () => {
  const disposed: string[] = [];
  const coordinator = new SessionRuntimeCoordinator<Runtime>({
    dispose: (resource) => { disposed.push(resource.id); },
    isRunning: (resource) => resource.running,
    keyOf: (resource) => resource.path,
  });
  await coordinator.navigate(async () => runtime("first", true));
  await coordinator.navigate(async () => runtime("second", true));
  await coordinator.navigate(async () => runtime("third", false));

  await coordinator.clear();

  assert.equal(coordinator.current, undefined);
  assert.deepEqual(coordinator.background, []);
  assert.deepEqual(disposed.sort(), ["first", "second", "third"]);
});

test("a retained running session cannot be mutated behind its live writer", async () => {
  const coordinator = new SessionRuntimeCoordinator<Runtime>({
    dispose: () => {},
    isRunning: (resource) => resource.running,
    keyOf: (resource) => resource.path,
  });
  const background = await coordinator.navigate(async () => runtime("background", true));
  await coordinator.navigate(async () => runtime("foreground", false));
  let mutated = false;
  const mutations = new SessionOwnerMutationCoordinator<Runtime, string>({
    lifecycle: coordinator,
    pathOf: (resource) => resource.path,
    samePath: (first, second) => first === second,
    isRetained: (path) => coordinator.background.some((resource) => resource.path === path),
    retainedMutationError: () => new Error("open the running session first"),
    detach: async () => {},
    restore: async () => {},
  });

  await assert.rejects(
    mutations.run(background.path, async () => { mutated = true; }),
    /open the running session first/,
  );

  assert.equal(mutated, false);
  assert.deepEqual(coordinator.background, [background]);
});
