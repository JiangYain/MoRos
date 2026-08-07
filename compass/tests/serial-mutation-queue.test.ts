import assert from "node:assert/strict";
import test from "node:test";
import { SerialMutationQueue } from "../src/main/serial-mutation-queue.ts";

test("model preference mutations cannot interleave across renderer entry points", async () => {
  const queue = new SerialMutationQueue();
  const state = {
    session: "model-a",
    defaultModel: "model-a",
    enabledModels: new Set(["model-a", "model-b"]),
  };
  let releaseDisable!: () => void;
  const disableCanFinish = new Promise<void>((resolve) => {
    releaseDisable = resolve;
  });
  const order: string[] = [];

  const disableCurrent = queue.enqueue(async () => {
    order.push("disable:start");
    await disableCanFinish;
    state.session = "model-b";
    state.defaultModel = "model-b";
    state.enabledModels.delete("model-a");
    order.push("disable:end");
  });
  const selectAnother = queue.enqueue(async () => {
    order.push("select:start");
    state.session = "model-c";
    state.defaultModel = "model-c";
    state.enabledModels.add("model-c");
    order.push("select:end");
  });

  await Promise.resolve();
  assert.deepEqual(order, ["disable:start"]);
  releaseDisable();
  await Promise.all([disableCurrent, selectAnother]);
  assert.deepEqual(order, ["disable:start", "disable:end", "select:start", "select:end"]);
  assert.equal(state.session, "model-c");
  assert.equal(state.defaultModel, "model-c");
  assert.deepEqual([...state.enabledModels].sort(), ["model-b", "model-c"]);
});

test("a rejected model preference mutation does not poison the queue", async () => {
  const queue = new SerialMutationQueue();
  await assert.rejects(queue.enqueue(async () => {
    throw new Error("save failed");
  }), /save failed/);
  assert.equal(await queue.enqueue(async () => "next update"), "next update");
});
