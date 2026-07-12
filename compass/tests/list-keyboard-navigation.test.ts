import assert from "node:assert/strict";
import test from "node:test";
import { moveListSelection } from "../src/renderer/src/components/list-keyboard-navigation.ts";

test("moves list selection in both directions and wraps at the edges", () => {
  assert.equal(moveListSelection(0, 3, 1), 1);
  assert.equal(moveListSelection(2, 3, 1), 0);
  assert.equal(moveListSelection(0, 3, -1), 2);
  assert.equal(moveListSelection(1, 3, -1), 0);
});

test("starts at the nearest edge and handles an empty list", () => {
  assert.equal(moveListSelection(-1, 3, 1), 0);
  assert.equal(moveListSelection(-1, 3, -1), 2);
  assert.equal(moveListSelection(4, 3, 1), 0);
  assert.equal(moveListSelection(0, 0, 1), -1);
});
