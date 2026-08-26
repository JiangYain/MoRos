import assert from "node:assert/strict";
import test from "node:test";
import type { AgentStats } from "../src/shared/types.ts";
import { appendOptimisticUser } from "../src/renderer/src/optimistic-session.ts";

const stats: AgentStats = {
  sessionId: "fresh",
  sessionPath: "C:\\sessions\\fresh.jsonl",
  modelAuthConfigured: true,
  thinkingLevel: "off",
  isStreaming: false,
  contextPercent: 0,
  contextTokens: 0,
  contextWindow: 1,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
};

test("optimistically shows a sent message and its new active session", () => {
  const result = appendOptimisticUser({
    id: "client-message",
    sessions: [],
    stats,
    text: "hello",
    thread: [],
    ts: 100,
  });

  assert.equal(result.thread.length, 1);
  assert.deepEqual(result.thread[0], {
    kind: "user",
    id: "client-message",
    text: "hello",
    images: undefined,
    ts: 100,
  });
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].id, "fresh");
  assert.equal(result.sessions[0].firstMessage, "hello");
});
