import assert from "node:assert/strict";
import test from "node:test";
import { buildLanguageContext, MOROS_CONTEXT } from "../src/main/moros-context.ts";

test("buildLanguageContext follows the selected interface language", () => {
  assert.match(buildLanguageContext("zh-CN"), /简体中文/);
  assert.match(buildLanguageContext("zh-TW"), /繁體中文/);
  assert.match(buildLanguageContext("en"), /respond in English/);
  assert.match(buildLanguageContext("de"), /auf Deutsch/);
});

test("Moros persona is coding-oriented and repository-safe", () => {
  assert.match(MOROS_CONTEXT, /general-purpose coding agent/i);
  assert.match(MOROS_CONTEXT, /Inspect before editing/);
  assert.match(MOROS_CONTEXT, /Preserve user work/);
  assert.doesNotMatch(MOROS_CONTEXT, /hearing|audiogram|fitting|client profile/i);
});
