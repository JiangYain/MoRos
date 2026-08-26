import assert from "node:assert/strict";
import test from "node:test";
import type { UiSessionInfo } from "../src/shared/types.ts";
import { markRunningSessions, mergeActiveSession } from "../src/main/session-list.ts";

const session = (overrides: Partial<UiSessionInfo> = {}): UiSessionInfo => ({
  path: "C:\\sessions\\one.jsonl",
  id: "one",
  firstMessage: "first",
  createdAt: 10,
  modifiedAt: 20,
  messageCount: 2,
  ...overrides,
});

test("adds an in-memory active session before its file is listed", () => {
  const active = session({ id: "fresh", path: "C:\\sessions\\fresh.jsonl", modifiedAt: 30 });
  const result = mergeActiveSession([session()], active);

  assert.deepEqual(result.map((item) => item.id), ["fresh", "one"]);
});

test("merges active metadata into an already persisted session", () => {
  const active = session({ firstMessage: "", modifiedAt: 40, messageCount: 5 });
  const result = mergeActiveSession([session({ name: "Named" })], active);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Named");
  assert.equal(result[0].firstMessage, "first");
  assert.equal(result[0].modifiedAt, 40);
  assert.equal(result[0].messageCount, 5);
});

test("marks every live foreground or background session as running", () => {
  const sessions = [
    session({ id: "foreground" }),
    session({ id: "background", path: "C:\\sessions\\background.jsonl" }),
    session({ id: "idle", path: "C:\\sessions\\idle.jsonl", isRunning: true }),
  ];

  const result = markRunningSessions(sessions, new Set(["foreground", "background"]));

  assert.deepEqual(
    result.map(({ id, isRunning }) => ({ id, isRunning })),
    [
      { id: "foreground", isRunning: true },
      { id: "background", isRunning: true },
      { id: "idle", isRunning: false },
    ],
  );
});
