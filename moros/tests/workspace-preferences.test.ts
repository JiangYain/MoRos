import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePinnedWorkspaces,
  parseWorkspaceAppearances,
  readWorkspacePreferences,
} from "../src/renderer/src/components/sidebar/workspace-preferences.ts";

test("workspace preference parsers reject malformed persisted shapes", () => {
  assert.deepEqual(parsePinnedWorkspaces('{"one":true,"two":false,"bad":"yes"}'), { one: true });
  assert.deepEqual(parsePinnedWorkspaces('["one", 2, ""]'), { one: true });
  assert.deepEqual(parseWorkspaceAppearances(JSON.stringify({
    valid: { iconId: "folder", colorId: "blue" },
    badIcon: { iconId: "missing", colorId: "blue" },
    badColor: { iconId: "folder", colorId: "missing" },
  })), {
    valid: { iconId: "folder", colorId: "blue" },
  });
});

test("workspace preferences fall back atomically when storage throws", () => {
  const result = readWorkspacePreferences({
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {},
  });
  assert.deepEqual(result, { appearances: {}, pinned: {} });
});
