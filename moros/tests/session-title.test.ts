import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionTitleTranscript, normalizeGeneratedSessionTitle } from "../src/main/session-title.ts";

test("buildSessionTitleTranscript keeps only conversational text", () => {
  const transcript = buildSessionTitleTranscript([
    { kind: "user", id: "u1", text: "帮我分析这个模块", ts: 1 },
    { kind: "tool", id: "t1", callId: "c1", name: "read", output: "noise", isError: false, running: false, ts: 2 },
    {
      kind: "assistant",
      id: "a1",
      blocks: [
        { type: "thinking", text: "internal" },
        { type: "text", text: "先确认入口和依赖。" },
      ],
      streaming: false,
      ts: 3,
    },
  ]);

  assert.equal(transcript, "User: 帮我分析这个模块\n\nAssistant: 先确认入口和依赖。");
});

test("buildSessionTitleTranscript prefers feedback comments over annotation images", () => {
  const transcript = buildSessionTitleTranscript([{
    kind: "user",
    id: "u-feedback",
    text: "",
    feedback: [{ id: "f1", kind: "browser", comment: "Move this control", selected: true, createdAt: 1, source: { url: "https://example.test" } }],
    images: [{ data: "AA==", mimeType: "image/png", name: "annotation.png" }],
    ts: 1,
  }]);
  assert.equal(transcript, "User: Move this control");
});

test("normalizeGeneratedSessionTitle removes model formatting", () => {
  assert.equal(normalizeGeneratedSessionTitle("## 标题：模块架构分析。\n补充解释"), "模块架构分析");
  assert.equal(normalizeGeneratedSessionTitle("```\n\"Repository setup\"\n```"), "Repository setup");
});

test("normalizeGeneratedSessionTitle rejects empty output and limits length", () => {
  assert.equal(normalizeGeneratedSessionTitle("  \n"), null);
  assert.equal(Array.from(normalizeGeneratedSessionTitle("很".repeat(60)) ?? "").length, 42);
});
