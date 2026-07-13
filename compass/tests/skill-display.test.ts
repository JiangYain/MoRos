import assert from "node:assert/strict";
import test from "node:test";
import { compactSkillText, parseSkillInvocation } from "../src/shared/skill-display.ts";

test("parses raw slash skill invocations", () => {
  assert.deepEqual(parseSkillInvocation("/skill:phonak-target-control 打开 Target"), {
    name: "phonak-target-control",
    argumentsText: "打开 Target",
  });
  assert.deepEqual(parseSkillInvocation("//skill:phonak-target-control 打开 Target"), {
    name: "phonak-target-control",
    argumentsText: "打开 Target",
  });
});

test("collapses expanded skill payloads to the visible invocation", () => {
  const expanded = `<skill name="phonak-target-control" location="C:\\skill\\SKILL.md">
# Internal instructions
Do not render this body as the user message.
</skill>

这个 skill 讲的什么？`;
  assert.deepEqual(compactSkillText(expanded), {
    skillName: "phonak-target-control",
    text: "这个 skill 讲的什么？",
  });
});
