import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSii,
  cloneEmptyThresholds,
  createAudiogramRecord,
  INITIAL_RECORDS,
  updateThreshold,
} from "../src/renderer/src/components/hearing-health/model.ts";

test("calculateSii ignores missing thresholds", () => {
  assert.equal(calculateSii([20, null, 40]), 70);
  assert.equal(calculateSii([null, null]), 0);
});

test("updateThreshold sets and toggles the active curve point without mutating the record", () => {
  const record = INITIAL_RECORDS[0];
  const updated = updateThreshold(record, "right", "AC", 0, 35);
  assert.equal(updated.right.ac[0], 35);
  assert.equal(record.right.ac[0], 15);
  assert.equal(updateThreshold(updated, "right", "AC", 0, 35).right.ac[0], null);
});

test("new and cleared records own their threshold arrays", () => {
  const first = createAudiogramRecord(new Date("2026-08-09T12:00:00.000Z"));
  const second = createAudiogramRecord(new Date("2026-08-10T12:00:00.000Z"));
  first.right.ac[0] = 99;
  assert.notEqual(second.right.ac[0], 99);

  const emptyA = cloneEmptyThresholds();
  const emptyB = cloneEmptyThresholds();
  emptyA.ac[0] = 5;
  assert.equal(emptyB.ac[0], null);
});
