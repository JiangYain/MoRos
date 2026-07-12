import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionTitleTranscript, normalizeGeneratedSessionTitle } from "../src/main/session-title.ts";

test("buildSessionTitleTranscript keeps only conversational text", () => {
  const transcript = buildSessionTitleTranscript([
    { kind: "user", id: "u1", text: "帮我分析听力图", ts: 1 },
    { kind: "tool", id: "t1", callId: "c1", name: "read", output: "noise", isError: false, running: false, ts: 2 },
    {
      kind: "assistant",
      id: "a1",
      blocks: [
        { type: "thinking", text: "internal" },
        { type: "text", text: "先确认左右耳数据。" },
      ],
      streaming: false,
      ts: 3,
    },
  ]);

  assert.equal(transcript, "User: 帮我分析听力图\n\nAssistant: 先确认左右耳数据。");
});

test("normalizeGeneratedSessionTitle removes model formatting", () => {
  assert.equal(normalizeGeneratedSessionTitle("## 标题：儿童听力图分析。\n补充解释"), "儿童听力图分析");
  assert.equal(normalizeGeneratedSessionTitle("```\n\"Phonak Target setup\"\n```"), "Phonak Target setup");
});

test("normalizeGeneratedSessionTitle rejects empty output and limits length", () => {
  assert.equal(normalizeGeneratedSessionTitle("  \n"), null);
  assert.equal(Array.from(normalizeGeneratedSessionTitle("很".repeat(60)) ?? "").length, 42);
});
