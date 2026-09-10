import assert from "node:assert/strict";
import test from "node:test";
import { removeQueuedSessionMessage } from "../src/main/agent/queued-messages.ts";

interface FakePendingMessage {
  role: string;
  content: Array<Record<string, unknown>>;
}

function userMessage(text: string, withImage = false): FakePendingMessage {
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...(withImage ? [{ type: "image", data: "AA==", mimeType: "image/png" }] : []),
    ],
  };
}

function customMessage(): FakePendingMessage {
  return { role: "custom", content: [{ type: "text", text: "extension payload" }] };
}

interface FakeSession {
  _steeringMessages: string[];
  _followUpMessages: string[];
  agent: {
    steeringQueue: { messages: FakePendingMessage[] };
    followUpQueue: { messages: FakePendingMessage[] };
  };
  queueUpdates: number;
  _emitQueueUpdate(): void;
}

function fakeSession(): FakeSession {
  return {
    _steeringMessages: ["fix the bug", "add tests"],
    _followUpMessages: ["ship it"],
    agent: {
      steeringQueue: {
        messages: [
          userMessage("fix the bug", true),
          customMessage(),
          userMessage("add tests"),
        ],
      },
      followUpQueue: { messages: [userMessage("ship it")] },
    },
    queueUpdates: 0,
    _emitQueueUpdate() {
      this.queueUpdates += 1;
    },
  };
}

test("removes a steering message from both queues and broadcasts one update", () => {
  const session = fakeSession();

  const result = removeQueuedSessionMessage(session, "steering", 1, "add tests");

  assert.equal(result.ok, true);
  assert.deepEqual(session._steeringMessages, ["fix the bug"]);
  // The custom extension entry and the image-bearing first message survive.
  assert.deepEqual(
    session.agent.steeringQueue.messages.map((message) => message.role),
    ["user", "custom"],
  );
  assert.equal(session.agent.steeringQueue.messages[0].content.length, 2);
  assert.equal(session.queueUpdates, 1);
  assert.deepEqual(session._followUpMessages, ["ship it"]);
});

test("removes a follow-up message independently of the steering queue", () => {
  const session = fakeSession();

  const result = removeQueuedSessionMessage(session, "followUp", 0, "ship it");

  assert.equal(result.ok, true);
  assert.deepEqual(session._followUpMessages, []);
  assert.deepEqual(session.agent.followUpQueue.messages, []);
  assert.deepEqual(session._steeringMessages, ["fix the bug", "add tests"]);
  assert.equal(session.queueUpdates, 1);
});

test("rejects a stale index/text pair without mutating anything", () => {
  const session = fakeSession();

  for (const [index, text] of [
    [0, "add tests"],
    [1, "fix the bug"],
    [2, "fix the bug"],
    [-1, "fix the bug"],
    [0.5, "fix the bug"],
  ] as const) {
    const result = removeQueuedSessionMessage(session, "steering", index, text);
    assert.deepEqual(result, { ok: false, reason: "not-found" });
  }
  assert.deepEqual(session._steeringMessages, ["fix the bug", "add tests"]);
  assert.equal(session.agent.steeringQueue.messages.length, 3);
  assert.equal(session.queueUpdates, 0);
});

test("rejects a message the agent loop already drained from the pending queue", () => {
  const session = fakeSession();
  // Simulate the drain that happens just before the queued message starts:
  // the display entry still exists but the pending user entry is gone.
  session.agent.steeringQueue.messages = [customMessage(), userMessage("add tests")];

  const result = removeQueuedSessionMessage(session, "steering", 1, "add tests");

  assert.deepEqual(result, { ok: false, reason: "not-found" });
  assert.deepEqual(session._steeringMessages, ["fix the bug", "add tests"]);
  assert.equal(session.agent.steeringQueue.messages.length, 2);
  assert.equal(session.queueUpdates, 0);
});

test("reports unavailable when the session internals change shape", () => {
  const missingAgent = { ...fakeSession(), agent: undefined };
  assert.deepEqual(
    removeQueuedSessionMessage(missingAgent, "steering", 0, "fix the bug"),
    { ok: false, reason: "unavailable" },
  );

  const missingEmit = { ...fakeSession(), _emitQueueUpdate: undefined };
  assert.deepEqual(
    removeQueuedSessionMessage(missingEmit, "steering", 0, "fix the bug"),
    { ok: false, reason: "unavailable" },
  );

  const missingQueue = fakeSession() as unknown as Record<string, unknown>;
  (missingQueue.agent as Record<string, unknown>).steeringQueue = { messages: "nope" };
  assert.deepEqual(
    removeQueuedSessionMessage(missingQueue, "steering", 0, "fix the bug"),
    { ok: false, reason: "unavailable" },
  );

  assert.deepEqual(
    removeQueuedSessionMessage(undefined, "steering", 0, "fix the bug"),
    { ok: false, reason: "unavailable" },
  );
});

test("still succeeds when the queue-update broadcast throws", () => {
  const session = fakeSession();
  session._emitQueueUpdate = () => {
    throw new Error("listener exploded");
  };

  const result = removeQueuedSessionMessage(session, "steering", 0, "fix the bug");

  assert.equal(result.ok, true);
  assert.deepEqual(session._steeringMessages, ["add tests"]);
});
