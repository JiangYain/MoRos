import assert from "node:assert/strict";
import test from "node:test";
import { compactSkillText, parseSkillInvocation } from "../src/shared/skill-display.ts";

test("parses raw slash skill invocations", () => {
  assert.deepEqual(parseSkillInvocation("/skill:repo-review 检查当前改动"), {
    name: "repo-review",
    argumentsText: "检查当前改动",
  });
  assert.deepEqual(parseSkillInvocation("//skill:repo-review 检查当前改动"), {
    name: "repo-review",
    argumentsText: "检查当前改动",
  });
});

test("collapses expanded skill payloads to the visible invocation", () => {
  const expanded = `<skill name="repo-review" location="C:\\skill\\SKILL.md">
# Internal instructions
Do not render this body as the user message.
</skill>

这个 skill 讲的什么？`;
  assert.deepEqual(compactSkillText(expanded), {
    skillName: "repo-review",
    text: "这个 skill 讲的什么？",
  });
});
