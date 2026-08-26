import assert from "node:assert/strict";
import test from "node:test";
import type { AgentStats, AgentUiEvent, InitPayload } from "../src/shared/types.ts";
import {
  projectAgentEvent,
  projectInitPayload,
  type AgentEventState,
} from "../src/renderer/src/store/agent-event-projection.ts";

const stats: AgentStats = {
  sessionId: "active",
  sessionPath: "C:\\sessions\\active.jsonl",
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

function initialState(): AgentEventState {
  return {
    ready: true,
    version: "test",
    dependencies: { items: [], installs: [], checkedAt: 0 },
    skills: [],
    models: [],
    providers: [],
    sessions: [],
    stats,
    thread: [],
    approvals: [],
    streaming: false,
    queue: { steering: [], followUp: [] },
    lastError: null,
    streamingBlocks: new Map(),
  };
}

function applyEvent(state: AgentEventState, event: AgentUiEvent): AgentEventState {
  const projection = projectAgentEvent(state, event);
  return projection.patch ? { ...state, ...projection.patch } : state;
}

test("assistant stream events project immutable ordered blocks", () => {
  const before = initialState();
  const started = applyEvent(before, { kind: "assistant-start", id: "assistant", ts: 1 });
  const withText = applyEvent(started, {
    kind: "assistant-delta",
    id: "assistant",
    blockType: "text",
    contentIndex: 1,
    delta: "answer",
  });
  const withThinking = applyEvent(withText, {
    kind: "assistant-delta",
    id: "assistant",
    blockType: "thinking",
    contentIndex: 0,
    delta: "reasoning",
  });

  assert.deepEqual(before.thread, []);
  assert.deepEqual(withThinking.thread[0], {
    kind: "assistant",
    id: "assistant",
    blocks: [
      { type: "thinking", text: "reasoning" },
      { type: "text", text: "answer" },
    ],
    streaming: true,
    ts: 1,
  });
});

test("a resumed live assistant accepts new deltas after its init snapshot", () => {
  const before = initialState();
  const payload = {
    version: "test",
    settings: {} as never,
    prerequisites: {} as never,
    dependencies: before.dependencies,
    skills: [],
    models: [],
    providers: [],
    sessions: [],
    stats: { ...stats, isStreaming: true },
    thread: [{
      kind: "assistant",
      id: "assistant-live",
      blocks: [{ type: "text", text: "latest partial", contentIndex: 1 }],
      streaming: true,
      ts: 20,
    }],
    approvals: [],
  } satisfies InitPayload;
  const resumed = {
    ...before,
    ...projectInitPayload(payload, before.dependencies),
  };
  const continued = applyEvent(resumed, {
    kind: "assistant-delta",
    id: "assistant-live",
    blockType: "text",
    contentIndex: 1,
    delta: " continued",
  });

  assert.deepEqual(continued.thread[0], {
    kind: "assistant",
    id: "assistant-live",
    blocks: [{ type: "text", text: "latest partial continued", contentIndex: 1 }],
    streaming: true,
    ts: 20,
  });
});

test("user events update the active session without mutating prior snapshots", () => {
  const before = initialState();
  const after = applyEvent(before, {
    kind: "user-message",
    id: "user-1",
    text: "hello",
    ts: 10,
  });

  assert.equal(before.sessions.length, 0);
  assert.equal(after.sessions[0]?.id, "active");
  assert.equal(after.sessions[0]?.firstMessage, "hello");
  assert.equal(after.thread[0]?.kind, "user");
});

test("service work is exposed as an effect instead of running inside the projection", () => {
  const state = initialState();
  const projection = projectAgentEvent(state, { kind: "sessions-changed" });

  assert.equal(projection.patch, undefined);
  assert.deepEqual(projection.effects, ["refresh-sessions"]);
  assert.deepEqual(state.sessions, []);
});
