import assert from "node:assert/strict";
import test from "node:test";
import type { AgentStats, AgentUiEvent, InitPayload } from "../src/shared/types.ts";
import { AgentEventProjector } from "../src/main/agent/event-projector.ts";
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

function retryScenario(blocks: { type: "text"; text: string }[] = []) {
  let state = initialState();
  let id = 0;
  const projector = new AgentEventProjector({
    emit: (event) => { state = applyEvent(state, event); },
    nextId: (prefix) => `${prefix}-${++id}`,
    language: () => "zh-CN",
    stats: () => ({ ...stats, isStreaming: true }),
    onSettled: () => {},
  });
  const fail = () => {
    projector.handle({
      type: "message_start",
      message: { role: "assistant", content: [], timestamp: 1 },
    } as never);
    projector.handle({
      type: "message_end",
      message: {
        role: "assistant", content: blocks, timestamp: 1,
        stopReason: "error", errorMessage: "terminated",
      },
    } as never);
  };
  fail();
  return { state: () => state, projector, fail };
}

test("automatic retry replaces the transient error with its retry notice", () => {
  const scenario = retryScenario([{ type: "text", text: "Partial answer" }]);
  scenario.projector.handle({
    type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 1000, errorMessage: "terminated",
  });
  const [answer, notice] = scenario.state().thread;
  assert.ok(answer.kind === "assistant");
  assert.equal(answer.errorMessage, undefined);
  assert.deepEqual(answer.blocks, [{ type: "text", text: "Partial answer" }]);
  assert.ok(notice.kind === "notice");
  assert.equal(notice.text, "请求失败，正在自动重试（第 1/3 次）…");
});

test("automatic retry leaves no empty error bubble and preserves the final failure", () => {
  const scenario = retryScenario();
  scenario.projector.handle({
    type: "auto_retry_start", attempt: 1, maxAttempts: 1, delayMs: 1000, errorMessage: "terminated",
  });
  assert.deepEqual(scenario.state().thread.map((item) => item.kind), ["notice"]);
  scenario.fail();
  scenario.projector.handle({ type: "auto_retry_end", success: false, attempt: 1, finalError: "terminated" });
  const final = scenario.state().thread.at(-1);
  assert.ok(final?.kind === "assistant");
  assert.equal(final.errorMessage, "terminated");
});

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
