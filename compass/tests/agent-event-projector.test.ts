import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUiEvent } from "../src/shared/types.ts";
import { AgentEventProjector } from "../src/main/agent/event-projector.ts";

const emptyStats = {
  sessionId: "session-1",
  modelAuthConfigured: true,
  thinkingLevel: "off" as const,
  isStreaming: false,
  contextPercent: null,
  contextTokens: null,
  contextWindow: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
};

test("event projector preserves settled event ordering", () => {
  const order: string[] = [];
  const projector = new AgentEventProjector({
    emit: (event) => order.push(event.kind),
    nextId: (prefix) => `${prefix}-1`,
    language: () => "en",
    stats: () => emptyStats,
    onSettled: () => order.push("title-requested"),
  });

  projector.handle({ type: "agent_settled" } as never);
  assert.deepEqual(order, ["agent-end", "stats", "sessions-changed", "title-requested"]);
});

test("event projector correlates optimistic user IDs and one assistant stream", () => {
  const events: AgentUiEvent[] = [];
  const projector = new AgentEventProjector({
    emit: (event) => events.push(event),
    nextId: (prefix) => `${prefix}-generated`,
    language: () => "en",
    stats: () => emptyStats,
    onSettled: () => {},
  });
  projector.trackUserMessage("client-user-1");
  projector.handle({
    type: "message_end",
    message: { role: "user", content: "hello", timestamp: 10 },
  } as never);
  projector.handle({
    type: "message_start",
    message: { role: "assistant", content: [], timestamp: 20 },
  } as never);
  projector.handle({
    type: "message_update",
    assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi" },
  } as never);
  projector.handle({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      timestamp: 20,
      stopReason: "stop",
    },
  } as never);

  const user = events.find((event) => event.kind === "user-message");
  const start = events.find((event) => event.kind === "assistant-start");
  const delta = events.find((event) => event.kind === "assistant-delta");
  const end = events.find((event) => event.kind === "assistant-end");
  assert.equal(user?.id, "client-user-1");
  assert.equal(start?.id, "a-generated");
  assert.equal(delta?.id, start?.id);
  assert.equal(end?.id, start?.id);
  assert.deepEqual(events.map((event) => event.kind), [
    "user-message",
    "sessions-changed",
    "assistant-start",
    "assistant-delta",
    "assistant-end",
    "stats",
  ]);
});

test("event projector reports rejected settled effects", async () => {
  const errors: unknown[] = [];
  const projector = new AgentEventProjector({
    emit: () => undefined,
    nextId: () => "unused",
    language: () => "en",
    stats: () => emptyStats,
    onSettled: async () => {
      throw new Error("title failed");
    },
    onSettledError: (error) => errors.push(error),
  });

  projector.handle({ type: "agent_settled", messages: [] } as never);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /title failed/);
});
