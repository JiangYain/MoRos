import assert from "node:assert/strict";
import test from "node:test";
import {
  isSettingsDropdownNavigationKey,
  nextSettingsDropdownIndex,
} from "../src/renderer/src/components/settings-dropdown.ts";

test("settings dropdowns accept only vertical list navigation keys", () => {
  assert.equal(isSettingsDropdownNavigationKey("ArrowDown"), true);
  assert.equal(isSettingsDropdownNavigationKey("ArrowUp"), true);
  assert.equal(isSettingsDropdownNavigationKey("Home"), true);
  assert.equal(isSettingsDropdownNavigationKey("End"), true);
  assert.equal(isSettingsDropdownNavigationKey("ArrowLeft"), false);
  assert.equal(isSettingsDropdownNavigationKey("ArrowRight"), false);
  assert.equal(isSettingsDropdownNavigationKey("Escape"), false);
  assert.equal(isSettingsDropdownNavigationKey("Tab"), false);
});

test("ArrowDown and ArrowUp wrap through dropdown options", () => {
  assert.equal(nextSettingsDropdownIndex(0, 3, "ArrowDown"), 1);
  assert.equal(nextSettingsDropdownIndex(2, 3, "ArrowDown"), 0);
  assert.equal(nextSettingsDropdownIndex(2, 3, "ArrowUp"), 1);
  assert.equal(nextSettingsDropdownIndex(0, 3, "ArrowUp"), 2);
});

test("dropdown navigation enters from the nearest edge", () => {
  assert.equal(nextSettingsDropdownIndex(-1, 4, "ArrowDown"), 0);
  assert.equal(nextSettingsDropdownIndex(-1, 4, "ArrowUp"), 3);
  assert.equal(nextSettingsDropdownIndex(99, 4, "ArrowDown"), 0);
});

test("Home and End move to dropdown boundaries", () => {
  assert.equal(nextSettingsDropdownIndex(2, 5, "Home"), 0);
  assert.equal(nextSettingsDropdownIndex(2, 5, "End"), 4);
});

test("empty dropdowns do not trap focus", () => {
  assert.equal(nextSettingsDropdownIndex(0, 0, "ArrowDown"), -1);
  assert.equal(nextSettingsDropdownIndex(0, 0, "Home"), -1);
});
