import assert from "node:assert/strict";
import test from "node:test";
import type { UiSessionInfo } from "../src/shared/types.ts";
import { sessionRowStatus } from "../src/renderer/src/components/sidebar/session-row-status.ts";

function session(overrides: Partial<UiSessionInfo> = {}): UiSessionInfo {
  return {
    id: "session-one",
    path: "C:\\sessions\\one.jsonl",
    firstMessage: "First message",
    createdAt: 1_000,
    modifiedAt: 1_000,
    messageCount: 1,
    ...overrides,
  };
}

test("a running session replaces its relative time with the activity indicator", () => {
  assert.deepEqual(
    sessionRowStatus(session({ isRunning: true }), "now", 61_000),
    { kind: "running" },
  );
});

test("an idle session keeps its relative time and machine-readable timestamp", () => {
  assert.deepEqual(
    sessionRowStatus(session(), "now", 1_060_000),
    {
      kind: "idle",
      relativeAge: "1m",
      dateTime: "1970-01-01T00:16:40.000Z",
    },
  );
});
