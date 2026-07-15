import assert from "node:assert/strict";
import test from "node:test";
import {
  isQuickPromptList,
  MAX_QUICK_PROMPTS,
  normalizeQuickPrompts,
} from "../src/shared/quick-prompts.ts";

test("quick prompt settings accept one to five non-empty items", () => {
  assert.equal(isQuickPromptList(["Prompt one"]), true);
  assert.equal(isQuickPromptList(Array.from({ length: MAX_QUICK_PROMPTS }, (_, index) => `Prompt ${index + 1}`)), true);
  assert.equal(isQuickPromptList([]), false);
  assert.equal(isQuickPromptList(["Prompt one", "  "]), false);
  assert.equal(isQuickPromptList(Array.from({ length: MAX_QUICK_PROMPTS + 1 }, () => "Prompt")), false);
});

test("persisted quick prompts are trimmed, cleaned, and capped at five", () => {
  assert.deepEqual(normalizeQuickPrompts([" First ", "", 42, "Second"]), ["First", "Second"]);
  assert.deepEqual(
    normalizeQuickPrompts(Array.from({ length: MAX_QUICK_PROMPTS + 2 }, (_, index) => ` ${index + 1} `)),
    ["1", "2", "3", "4", "5"],
  );
  assert.equal(normalizeQuickPrompts([" ", null]), undefined);
  assert.equal(normalizeQuickPrompts("Prompt"), undefined);
});
