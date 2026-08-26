import assert from "node:assert/strict";
import test from "node:test";
import { isDependencyId } from "../src/shared/types.ts";
import { DEPENDENCY_CATALOG } from "../src/main/dependencies/catalog.ts";

test("dependency catalog contains only generic coding runtimes", () => {
  assert.deepEqual(DEPENDENCY_CATALOG.map((item) => item.id), ["git", "bash"]);
  for (const item of DEPENDENCY_CATALOG) {
    assert.equal(item.category, "runtime");
    assert.equal(item.required, true);
    assert.equal(item.installKind, "winget");
    assert.match(item.sourceUrl, /^https:\/\//);
  }
});

test("hearing and fitting dependencies are no longer valid IDs", () => {
  assert.equal(isDependencyId("git"), true);
  assert.equal(isDependencyId("bash"), true);
  assert.equal(isDependencyId("phonak-target"), false);
  assert.equal(isDependencyId("widex-moros-gps"), false);
  assert.equal(isDependencyId("noahlink-wireless-driver"), false);
});
