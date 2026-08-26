import assert from "node:assert/strict";
import test from "node:test";
import {
  elideWorkspacePath,
  isWorkspacePathLong,
} from "../src/renderer/src/components/workspace-path.ts";

test("short paths are returned unchanged", () => {
  assert.equal(elideWorkspacePath("C:\\projects\\FAI", 40), "C:\\projects\\FAI");
  assert.equal(elideWorkspacePath("", 40), "");
});

test("long paths keep the start and end with an ellipsis in the middle", () => {
  const path = "C:\\Users\\chord\\Desktop\\FAI-settings-review\\moros\\src\\main";
  const elided = elideWorkspacePath(path, 24);
  assert.ok(elided.length <= 24);
  assert.ok(elided.startsWith("C:\\"));
  assert.ok(elided.endsWith("\\main"));
  assert.ok(elided.includes("…"));
});

test("elision is symmetric in head/tail lengths for odd and even budgets", () => {
  const path = "0123456789ABCDEFGHIJ";
  const elided = elideWorkspacePath(path, 10);
  assert.equal(elided.length, 10);
  assert.ok(elided.startsWith("0123"));
  assert.ok(elided.endsWith("HIJ"));
});

test("isWorkspacePathLong flags only paths that exceed the budget", () => {
  assert.equal(isWorkspacePathLong("short", 10), false);
  assert.equal(isWorkspacePathLong("exactly10!", 10), false);
  assert.equal(isWorkspacePathLong("longer-than-ten", 10), true);
});

test("a maxChars budget below 5 returns the path verbatim instead of a broken elision", () => {
  const path = "C:\\very\\long\\path";
  assert.equal(elideWorkspacePath(path, 3), path);
});
