import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApprovalExplanationContext,
  normalizeGeneratedApprovalExplanation,
  resolveApprovalExplanationLanguage,
} from "../src/main/approval-explanation.ts";
import { isCommandExplanationLanguage } from "../src/shared/types.ts";

test("command explanation language accepts auto and supported app languages", () => {
  assert.equal(isCommandExplanationLanguage("auto"), true);
  assert.equal(isCommandExplanationLanguage("zh-CN"), true);
  assert.equal(isCommandExplanationLanguage("fr"), false);
});

test("command explanations can follow or override the interface language", () => {
  assert.equal(resolveApprovalExplanationLanguage("auto", "de"), "de");
  assert.equal(resolveApprovalExplanationLanguage("zh-CN", "en"), "zh-CN");
});

test("approval explanation context prefers the concrete command", () => {
  const context = buildApprovalExplanationContext({
    id: "approval-1",
    toolName: "shell_command",
    message: "Allow Compass to run a shell command?",
    detail: "shell_command\ntruncated preview",
    args: { command: "git status --short" },
    ts: 1,
  });

  assert.match(context, /Tool: shell_command/);
  assert.match(context, /git status --short/);
  assert.doesNotMatch(context, /truncated preview/);
});

test("approval explanation normalization removes model framing", () => {
  assert.equal(
    normalizeGeneratedApprovalExplanation("```\nExplanation: Checks the repository status without changing files.\n```"),
    "Checks the repository status without changing files.",
  );
  assert.equal(
    normalizeGeneratedApprovalExplanation("## 命令说明：检查当前目录、分支及子模块状态。"),
    "检查当前目录、分支及子模块状态。",
  );
});

test("approval explanation normalization rejects empty output and caps length", () => {
  assert.equal(normalizeGeneratedApprovalExplanation("  \n"), null);
  const explanation = normalizeGeneratedApprovalExplanation("长".repeat(220));
  assert.equal(Array.from(explanation ?? "").length, 180);
  assert.ok(explanation?.endsWith("…"));
});
