import assert from "node:assert/strict";
import test from "node:test";
import { decideQuickPromptWheel } from "../src/renderer/src/components/quick-prompts-wheel.ts";

const THRESHOLD = 40;

test("a single quick prompt never hijacks scroll or switches", () => {
  const decision = decideQuickPromptWheel(1, 100, THRESHOLD, false);
  assert.equal(decision.preventDefault, false);
  assert.equal(decision.switchDirection, 0);
  assert.equal(decision.lockGesture, false);
  // Accumulator is reset so a later multi-prompt state starts clean.
  assert.equal(decision.resetAccumulator, true);
});

test("an empty prompt list also does not hijack scroll", () => {
  const decision = decideQuickPromptWheel(0, 100, THRESHOLD, false);
  assert.equal(decision.preventDefault, false);
  assert.equal(decision.switchDirection, 0);
});

test("multiple prompts accumulate without switching below the threshold", () => {
  const decision = decideQuickPromptWheel(3, 10, THRESHOLD, false);
  assert.equal(decision.preventDefault, false);
  assert.equal(decision.switchDirection, 0);
  assert.equal(decision.resetAccumulator, false);
  assert.equal(decision.lockGesture, false);
});

test("multiple prompts switch forward when delta exceeds the threshold", () => {
  const decision = decideQuickPromptWheel(3, 50, THRESHOLD, false);
  assert.equal(decision.preventDefault, true);
  assert.equal(decision.switchDirection, 1);
  assert.equal(decision.resetAccumulator, true);
  assert.equal(decision.lockGesture, true);
});

test("negative delta switches backward", () => {
  const decision = decideQuickPromptWheel(3, -50, THRESHOLD, false);
  assert.equal(decision.switchDirection, -1);
  assert.equal(decision.lockGesture, true);
});

test("gesture lock ignores trailing wheel ticks without hijacking page scroll", () => {
  const locked = decideQuickPromptWheel(3, 200, THRESHOLD, true);
  assert.equal(locked.preventDefault, false);
  assert.equal(locked.switchDirection, 0);
  assert.equal(locked.lockGesture, true);
  assert.equal(locked.resetAccumulator, true);
});

test("just below the threshold does not switch yet", () => {
  const belowThreshold = decideQuickPromptWheel(2, THRESHOLD - 1, THRESHOLD, false);
  assert.equal(belowThreshold.switchDirection, 0);
  assert.equal(belowThreshold.lockGesture, false);
});

test("at the threshold the switch fires", () => {
  const atThreshold = decideQuickPromptWheel(2, THRESHOLD, THRESHOLD, false);
  assert.equal(atThreshold.switchDirection, 1);
  assert.equal(atThreshold.lockGesture, true);
});
