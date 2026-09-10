import assert from "node:assert/strict";
import test from "node:test";
import type { AgentStats } from "../src/shared/types.ts";
import { appendOptimisticUser } from "../src/renderer/src/optimistic-session.ts";
import { formatWorkbenchFeedback, type WorkbenchFeedback } from "../src/shared/workbench.ts";

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

test("feedback-only messages use the user comment for the session preview", () => {
  const feedback: WorkbenchFeedback = {
    id: "feedback-one",
    kind: "review",
    comment: "Fix the selected diff",
    selected: true,
    createdAt: 100,
    source: { path: "sample.ts", line: 8 },
  };
  const result = appendOptimisticUser({
    id: "client-feedback",
    sessions: [],
    stats,
    text: formatWorkbenchFeedback([feedback]),
    thread: [],
    ts: 100,
  });

  assert.equal(result.thread[0].kind, "user");
  if (result.thread[0].kind !== "user") assert.fail("Expected user message");
  assert.equal(result.thread[0].text, "");
  assert.equal(result.thread[0].feedback?.[0].comment, feedback.comment);
  assert.equal(result.sessions[0].firstMessage, feedback.comment);
});
