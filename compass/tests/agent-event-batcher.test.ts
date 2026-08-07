import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import type { AgentUiEvent, InitPayload } from "../src/shared/types.ts";
import {
  createAgentEventBatcher,
  type FrameScheduler,
} from "../src/renderer/src/agent-event-batcher.ts";

class ManualFrameScheduler implements FrameScheduler {
  private callback: (() => void) | undefined;
  private handle = 0;

  request(callback: () => void): number {
    this.callback = callback;
    this.handle += 1;
    return this.handle;
  }

  cancel(handle: number): void {
    if (handle === this.handle) this.callback = undefined;
  }

  flushFrame(): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.();
  }
}

function delta(
  value: string,
  contentIndex = 0,
  blockType: "text" | "thinking" = "text",
  id = "assistant-1",
): AgentUiEvent {
  return { kind: "assistant-delta", id, blockType, contentIndex, delta: value };
}

test("merges adjacent compatible deltas once per animation frame in source order", () => {
  const scheduler = new ManualFrameScheduler();
  const dispatched: AgentUiEvent[] = [];
  const batcher = createAgentEventBatcher((event) => dispatched.push(event), scheduler);

  batcher.push(delta("A"));
  batcher.push(delta("B"));
  batcher.push(delta("C"));
  assert.equal(dispatched.length, 0);
  scheduler.flushFrame();

  assert.deepEqual(dispatched, [delta("ABC")]);
  assert.deepEqual(batcher.getMetrics(), {
    dispatchedEvents: 1,
    droppedDeltaEvents: 0,
    inputDeltaEvents: 3,
    inputEvents: 3,
    mergedDeltaEvents: 2,
    visibleBatches: 1,
  });
});

test("does not merge different content indexes or thinking and text", () => {
  const scheduler = new ManualFrameScheduler();
  const dispatched: AgentUiEvent[] = [];
  const batcher = createAgentEventBatcher((event) => dispatched.push(event), scheduler);

  batcher.push(delta("text-0", 0, "text"));
  batcher.push(delta("text-1", 1, "text"));
  batcher.push(delta("thinking", 1, "thinking"));
  scheduler.flushFrame();

  assert.deepEqual(dispatched, [
    delta("text-0", 0, "text"),
    delta("text-1", 1, "text"),
    delta("thinking", 1, "thinking"),
  ]);
});

test("assistant-end flushes pending text first and then applies authoritative blocks", () => {
  const scheduler = new ManualFrameScheduler();
  let visibleText = "";
  const batcher = createAgentEventBatcher((event) => {
    if (event.kind === "assistant-delta") visibleText += event.delta;
    if (event.kind === "assistant-end") {
      visibleText = event.blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");
    }
  }, scheduler);

  batcher.push(delta("partial "));
  batcher.push(delta("answer"));
  batcher.push({
    kind: "assistant-end",
    id: "assistant-1",
    blocks: [{ type: "text", text: "authoritative answer" }],
    stopReason: "stop",
  });

  assert.equal(visibleText, "authoritative answer");
  scheduler.flushFrame();
  assert.equal(visibleText, "authoritative answer");
});

test("state refresh, session switch, cancel, and disposal drop stale queued deltas", () => {
  const scheduler = new ManualFrameScheduler();
  const dispatched: AgentUiEvent[] = [];
  const batcher = createAgentEventBatcher((event) => dispatched.push(event), scheduler);

  batcher.push(delta("old session"));
  batcher.push({ kind: "state-refresh", payload: {} as InitPayload });
  scheduler.flushFrame();
  assert.deepEqual(dispatched.map((event) => event.kind), ["state-refresh"]);

  batcher.push(delta("cancelled"));
  batcher.clear();
  scheduler.flushFrame();
  assert.equal(dispatched.length, 1);

  batcher.push(delta("unmounted"));
  batcher.dispose();
  scheduler.flushFrame();
  assert.equal(dispatched.length, 1);
  assert.equal(batcher.getMetrics().droppedDeltaEvents, 3);
});

test("5000-delta burst collapses to one text commit and stabilizes at assistant-end", () => {
  const scheduler = new ManualFrameScheduler();
  const piece = "word ";
  const finalText = piece.repeat(5000);
  let storeCommits = 0;
  let visibleTextUpdates = 0;
  let visibleText = "";

  const batcher = createAgentEventBatcher((event) => {
    storeCommits += 1;
    const previousText = visibleText;
    if (event.kind === "assistant-delta") visibleText += event.delta;
    if (event.kind === "assistant-end") {
      visibleText = event.blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n\n");
    }
    if (visibleText !== previousText) visibleTextUpdates += 1;
  }, scheduler);

  batcher.push({ kind: "assistant-start", id: "assistant-1", ts: 1 });
  for (let index = 0; index < 5000; index += 1) batcher.push(delta(piece));
  const endStarted = performance.now();
  batcher.push({
    kind: "assistant-end",
    id: "assistant-1",
    blocks: [{ type: "text", text: finalText }],
    stopReason: "stop",
  });
  const assistantEndStableMs = performance.now() - endStarted;

  assert.equal(visibleText, finalText);
  assert.equal(storeCommits, 3);
  assert.equal(visibleTextUpdates, 1);
  assert.equal(batcher.getMetrics().visibleBatches, 1);
  assert.equal(batcher.getMetrics().mergedDeltaEvents, 4999);
  console.log("STREAM_BURST", JSON.stringify({
    inputEvents: 5002,
    inputDeltaEvents: 5000,
    storeCommits,
    visibleTextUpdates,
    assistantEndStableMs: Number(assistantEndStableMs.toFixed(3)),
  }));
});
