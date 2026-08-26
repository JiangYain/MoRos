import assert from "node:assert/strict";
import test from "node:test";
import { LifecycleCoordinator } from "../src/main/agent/lifecycle-coordinator.ts";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface OwnedSession {
  id: string;
  unsubscribe(): void;
  dispose(): void;
  publish(): void;
}

test("overlapping replacements run serially and keep the old owner until the candidate is ready", async () => {
  const operations: string[] = [];
  const firstStarted = deferred<void>();
  const firstRelease = deferred<void>();
  const secondStarted = deferred<void>();
  const secondRelease = deferred<void>();
  const coordinator = new LifecycleCoordinator<OwnedSession>((session) => {
    session.unsubscribe();
    session.dispose();
  });
  const makeSession = (id: string): OwnedSession => ({
    id,
    unsubscribe: () => operations.push(`unsubscribe:${id}`),
    dispose: () => operations.push(`dispose:${id}`),
    publish: () => {},
  });

  const first = coordinator.replace(async () => {
    operations.push("create:first");
    firstStarted.resolve();
    await firstRelease.promise;
    return makeSession("first");
  });
  await firstStarted.promise;
  let secondDidStart = false;
  const second = coordinator.replace(async () => {
    secondDidStart = true;
    operations.push("create:second");
    secondStarted.resolve();
    await secondRelease.promise;
    return makeSession("second");
  });
  await Promise.resolve();
  assert.equal(secondDidStart, false);

  firstRelease.resolve();
  await first;
  await secondStarted.promise;
  assert.deepEqual(operations, [
    "create:first",
    "create:second",
  ]);
  assert.equal(coordinator.current?.id, "first");

  secondRelease.resolve();
  await second;
  assert.equal(coordinator.current?.id, "second");
  assert.deepEqual(operations, [
    "create:first",
    "create:second",
    "unsubscribe:first",
    "dispose:first",
  ]);
  await coordinator.clear();
  assert.deepEqual(operations.slice(-2), ["unsubscribe:second", "dispose:second"]);
});

test("a failed replacement preserves the old owner and does not poison the lifecycle queue", async () => {
  const failureStarted = deferred<void>();
  const failureRelease = deferred<void>();
  const recoveryStarted = deferred<void>();
  const recoveryRelease = deferred<void>();
  const operations: string[] = [];
  const coordinator = new LifecycleCoordinator<OwnedSession>((session) => {
    operations.push(`dispose:${session.id}`);
  });
  const stable = await coordinator.replace(async () => {
    operations.push("create:stable");
    return {
      id: "stable",
      unsubscribe: () => {},
      dispose: () => {},
      publish: () => {},
    };
  });

  const failing = coordinator.replace(async () => {
    operations.push("create:broken");
    failureStarted.resolve();
    await failureRelease.promise;
    throw new Error("broken session");
  });
  await failureStarted.promise;
  assert.equal(coordinator.current, stable);
  const recovery = coordinator.replace(async () => {
    operations.push("create:recovery");
    recoveryStarted.resolve();
    await recoveryRelease.promise;
    return {
      id: "recovery",
      unsubscribe: () => {},
      dispose: () => {},
      publish: () => {},
    };
  });

  failureRelease.resolve();
  await assert.rejects(failing, /broken session/);
  await recoveryStarted.promise;
  assert.equal(coordinator.current, stable);
  recoveryRelease.resolve();
  await recovery;
  assert.deepEqual(operations, [
    "create:stable",
    "create:broken",
    "create:recovery",
    "dispose:stable",
  ]);
  assert.equal(coordinator.current?.id, "recovery");
});

test("cleanup failure after a committed switch is reported without lying about ownership", async () => {
  const cleanupFailures: unknown[] = [];
  const coordinator = new LifecycleCoordinator<OwnedSession>(
    (session) => {
      if (session.id === "old") throw new Error("dispose old failed");
    },
    (error) => cleanupFailures.push(error),
  );
  const makeSession = (id: string): OwnedSession => ({
    id,
    unsubscribe: () => {},
    dispose: () => {},
    publish: () => {},
  });

  await coordinator.replace(async () => makeSession("old"));
  const replacement = await coordinator.replace(async () => makeSession("new"));

  assert.equal(coordinator.current, replacement);
  assert.equal(cleanupFailures.length, 1);
  assert.match(String(cleanupFailures[0]), /dispose old failed/);
});

test("generation ownership ignores callbacks from a replaced session", async () => {
  const delivered: string[] = [];
  const disposed: string[] = [];
  const coordinator = new LifecycleCoordinator<OwnedSession>((session) => {
    session.unsubscribe();
    session.dispose();
  });
  const createSession = (id: string) => async (generation: number): Promise<OwnedSession> => {
    let session!: OwnedSession;
    session = {
      id,
      unsubscribe: () => disposed.push(`unsubscribe:${id}`),
      dispose: () => disposed.push(`dispose:${id}`),
      publish: () => {
        if (coordinator.owns(generation, session)) delivered.push(id);
      },
    };
    return session;
  };

  const first = await coordinator.replace(createSession("first"));
  first.publish();
  const second = await coordinator.replace(createSession("second"));
  first.publish();
  second.publish();

  assert.deepEqual(delivered, ["first", "second"]);
  assert.deepEqual(disposed, ["unsubscribe:first", "dispose:first"]);
  await coordinator.clear();
  assert.deepEqual(disposed.slice(-2), ["unsubscribe:second", "dispose:second"]);
});
