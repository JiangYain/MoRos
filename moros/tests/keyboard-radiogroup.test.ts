import assert from "node:assert/strict";
import test from "node:test";
import {
  isRadioNavigationKey,
  nextRadioIndex,
} from "../src/renderer/src/components/radio-keyboard.ts";

test("isRadioNavigationKey only accepts the radiogroup navigation keys", () => {
  assert.equal(isRadioNavigationKey("ArrowUp"), true);
  assert.equal(isRadioNavigationKey("ArrowDown"), true);
  assert.equal(isRadioNavigationKey("ArrowLeft"), true);
  assert.equal(isRadioNavigationKey("ArrowRight"), true);
  assert.equal(isRadioNavigationKey("Home"), true);
  assert.equal(isRadioNavigationKey("End"), true);
  // Enter/Space and unknown keys must fall through to default handling.
  assert.equal(isRadioNavigationKey("Enter"), false);
  assert.equal(isRadioNavigationKey(" "), false);
  assert.equal(isRadioNavigationKey("Tab"), false);
});

test("arrow down/right move forward and wrap to the first item", () => {
  assert.equal(nextRadioIndex(0, 3, "ArrowDown"), 1);
  assert.equal(nextRadioIndex(1, 3, "ArrowDown"), 2);
  assert.equal(nextRadioIndex(2, 3, "ArrowDown"), 0);
  assert.equal(nextRadioIndex(2, 3, "ArrowRight"), 0);
});

test("arrow up/left move backward and wrap to the last item", () => {
  assert.equal(nextRadioIndex(1, 3, "ArrowUp"), 0);
  assert.equal(nextRadioIndex(0, 3, "ArrowUp"), 2);
  assert.equal(nextRadioIndex(0, 3, "ArrowLeft"), 2);
});

test("Home and End jump to the edges without wrapping", () => {
  assert.equal(nextRadioIndex(2, 5, "Home"), 0);
  assert.equal(nextRadioIndex(0, 5, "End"), 4);
});

test("out-of-range current index normalizes to 0 before navigating", () => {
  assert.equal(nextRadioIndex(-1, 3, "ArrowDown"), 1);
  assert.equal(nextRadioIndex(99, 3, "ArrowUp"), 2);
  assert.equal(nextRadioIndex(-1, 3, "Home"), 0);
});

test("empty radiogroup always reports -1 so focus is not trapped", () => {
  assert.equal(nextRadioIndex(0, 0, "ArrowDown"), -1);
  assert.equal(nextRadioIndex(0, 0, "Home"), -1);
});
