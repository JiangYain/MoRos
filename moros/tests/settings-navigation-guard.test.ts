import assert from "node:assert/strict";
import test from "node:test";
import { decideSettingsNavigation } from "../src/renderer/src/store/settings-navigation.ts";

test("navigation proceeds when no guard blocks it", () => {
  assert.equal(
    decideSettingsNavigation({ currentSection: "general", targetSection: "models", guardBlocked: false }),
    "navigate",
  );
  assert.equal(
    decideSettingsNavigation({ currentSection: "general", targetSection: null, guardBlocked: false }),
    "navigate",
  );
  assert.equal(
    decideSettingsNavigation({ currentSection: null, targetSection: "general", guardBlocked: false }),
    "navigate",
  );
});

test("a blocking guard intercepts every leaving navigation", () => {
  assert.equal(
    decideSettingsNavigation({ currentSection: "general", targetSection: "skills", guardBlocked: true }),
    "block",
  );
  assert.equal(
    decideSettingsNavigation({ currentSection: "general", targetSection: null, guardBlocked: true }),
    "block",
  );
});

test("same-target requests never trigger the guard", () => {
  assert.equal(
    decideSettingsNavigation({ currentSection: "general", targetSection: "general", guardBlocked: true }),
    "ignore",
  );
  assert.equal(
    decideSettingsNavigation({ currentSection: null, targetSection: null, guardBlocked: true }),
    "ignore",
  );
});
