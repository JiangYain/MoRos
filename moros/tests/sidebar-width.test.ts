import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSidebarWidth,
  parseSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "../src/renderer/src/components/sidebar-width.ts";

test("clamps sidebar width to the supported desktop range", () => {
  assert.equal(clampSidebarWidth(180), SIDEBAR_MIN_WIDTH);
  assert.equal(clampSidebarWidth(318.4), 318);
  assert.equal(clampSidebarWidth(900), SIDEBAR_MAX_WIDTH);
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_DEFAULT_WIDTH);
});

test("parses persisted sidebar widths safely", () => {
  assert.equal(parseSidebarWidth(null), SIDEBAR_DEFAULT_WIDTH);
  assert.equal(parseSidebarWidth(" 306 "), 306);
  assert.equal(parseSidebarWidth("invalid"), SIDEBAR_DEFAULT_WIDTH);
});
