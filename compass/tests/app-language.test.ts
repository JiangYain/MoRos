import assert from "node:assert/strict";
import test from "node:test";
import { APP_LANGUAGES, isAppLanguage } from "../src/shared/types.ts";

test("the application exposes exactly the four supported languages", () => {
  assert.deepEqual(APP_LANGUAGES, ["zh-CN", "zh-TW", "en", "de"]);
  for (const language of APP_LANGUAGES) assert.equal(isAppLanguage(language), true);
});

test("unknown or malformed language values are rejected", () => {
  assert.equal(isAppLanguage("fr"), false);
  assert.equal(isAppLanguage("zh"), false);
  assert.equal(isAppLanguage(null), false);
  assert.equal(isAppLanguage({ language: "en" }), false);
});
