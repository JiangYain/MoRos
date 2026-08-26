import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupersededNavigation,
  observeInitialNavigation,
  shouldShowStartupErrorDialog,
} from "../src/main/startup-navigation.ts";

test("superseded Electron navigations are not startup failures", async () => {
  const failures: unknown[] = [];
  await observeInitialNavigation(
    Promise.reject(Object.assign(new Error("ERR_ABORTED (-3) loading a page"), { code: "ERR_ABORTED" })),
    (error) => failures.push(error),
  );
  assert.deepEqual(failures, []);
  assert.equal(isSupersededNavigation(new Error("net::ERR_ABORTED")), true);
});

test("real initial navigation failures remain observable", async () => {
  const failure = Object.assign(new Error("ERR_CONNECTION_REFUSED"), { code: "ERR_FAILED" });
  const failures: unknown[] = [];
  await observeInitialNavigation(Promise.reject(failure), (error) => failures.push(error));
  assert.deepEqual(failures, [failure]);
});

test("headless startup never opens a blocking native error dialog", () => {
  assert.equal(shouldShowStartupErrorDialog({ CI: "true" }), false);
  assert.equal(shouldShowStartupErrorDialog({ MOROS_HEADLESS: "1" }), false);
  assert.equal(shouldShowStartupErrorDialog({}), true);
});
