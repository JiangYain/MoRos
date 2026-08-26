import assert from "node:assert/strict";
import test from "node:test";
import { parseThemePreference, resolveTheme } from "../src/renderer/src/theme.ts";

test("theme preference parsing falls back to system", () => {
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("sepia"), "system");
  assert.equal(parseThemePreference(null), "system");
});

test("system theme follows the operating system preference", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
});
