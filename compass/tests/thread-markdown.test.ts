import assert from "node:assert/strict";
import test from "node:test";
import type { UiThreadItem } from "../src/shared/types.ts";
import { resolveThreadActivity } from "../src/renderer/src/components/threadActivity.ts";
import {
  resolveActiveMarkdownTarget,
  resolveMarkdownRenderState,
} from "../src/renderer/src/components/threadMarkdown.ts";

function assistant(
  id: string,
  blocks: Extract<UiThreadItem, { kind: "assistant" }>["blocks"],
  streaming = true,
): Extract<UiThreadItem, { kind: "assistant" }> {
  return { kind: "assistant", id, blocks, streaming, ts: 1 };
}

function runningTool(id = "tool-1"): Extract<UiThreadItem, { kind: "tool" }> {
  return {
    kind: "tool",
    id,
    callId: id,
    name: "read",
    output: "",
    isError: false,
    running: true,
    ts: 2,
  };
}

test("selects the latest ordinary text block for streaming word animation", () => {
  const items: UiThreadItem[] = [assistant("a1", [
    { type: "text", text: "Earlier block" },
    { type: "text", text: "Current block" },
  ])];

  assert.deepEqual(resolveActiveMarkdownTarget(items), {
    itemId: "a1",
    blockIndex: 1,
  });
  assert.deepEqual(resolveMarkdownRenderState("streaming", true), {
    mode: "streaming",
    isAnimating: true,
  });
  assert.deepEqual(resolveMarkdownRenderState("static", false), {
    mode: "static",
    isAnimating: false,
  });
});

test("live Thinking stays static and retains the solving activity target", () => {
  const items: UiThreadItem[] = [assistant("a1", [
    { type: "text", text: "Earlier answer" },
    { type: "thinking", text: "Still reasoning" },
  ])];

  assert.equal(resolveActiveMarkdownTarget(items), undefined);
  assert.deepEqual(resolveThreadActivity(items), {
    target: "assistant-thinking",
    state: "solving",
    itemId: "a1",
    blockIndex: 1,
  });
});

test("a running tool suppresses answer animation without changing its Orb", () => {
  const items: UiThreadItem[] = [
    assistant("a1", [{ type: "text", text: "Answer continues" }]),
    runningTool(),
  ];

  assert.equal(resolveActiveMarkdownTarget(items), undefined);
  assert.equal(resolveThreadActivity(items)?.target, "tool");
  assert.equal(resolveThreadActivity(items)?.state, "searching");
});

test("assistant-end and historical remounts stay static", () => {
  const completed = assistant("a1", [{ type: "text", text: "Complete" }], false);
  assert.equal(resolveActiveMarkdownTarget([completed]), undefined);
  assert.deepEqual(resolveMarkdownRenderState("static", false), {
    mode: "static",
    isAnimating: false,
  });
});

test("reduced motion disables animation without disabling streaming syntax repair", () => {
  const items: UiThreadItem[] = [assistant("a1", [{ type: "text", text: "Complete text" }])];
  assert.deepEqual(resolveActiveMarkdownTarget(items), { itemId: "a1", blockIndex: 0 });
  assert.deepEqual(resolveMarkdownRenderState("streaming", false), {
    mode: "streaming",
    isAnimating: false,
  });
});

test("selects at most one target and never falls back from the newest stream", () => {
  const older = assistant("older", [{ type: "text", text: "Old live text" }]);
  const newest = assistant("newest", []);
  assert.equal(resolveActiveMarkdownTarget([older, newest]), undefined);

  newest.blocks = [{ type: "text", text: "Newest live text" }];
  assert.deepEqual(resolveActiveMarkdownTarget([older, newest]), {
    itemId: "newest",
    blockIndex: 0,
  });
});

test("Skill markup is always static", () => {
  const items: UiThreadItem[] = [assistant("a1", [{
    type: "text",
    text: '<skill name="fit">Inspect settings</skill>',
  }])];
  assert.equal(resolveActiveMarkdownTarget(items), undefined);
});
