import assert from "node:assert/strict";
import test from "node:test";
import {
  audiogramDraftFromRecord,
  audiogramRecordFromClient,
  calculateSii,
  clearCurve,
  cloneEmptyThresholds,
  copyCurveToOtherEar,
  createAudiogramRecord,
  isoDateToday,
  removeThresholdPoint,
  setThresholdMarker,
  updateThreshold,
  type AudiogramPoint,
} from "../src/renderer/src/components/hearing-health/model.ts";
import type { ClientAudiogramRecord } from "../src/shared/client-audiograms.ts";

/** Builds a ten-column curve from plain dB values (null keeps a slot empty). */
function curve(...values: (number | null)[]): (AudiogramPoint | null)[] {
  assert.equal(values.length, 10);
  return values.map((db) => (db === null ? null : { db, marker: "unmasked" as const }));
}

const EMPTY = curve(null, null, null, null, null, null, null, null, null, null);

test("calculateSii ignores missing thresholds", () => {
  assert.equal(calculateSii([{ db: 20, marker: "unmasked" }, null, { db: 40, marker: "masked" }]), 70);
  assert.equal(calculateSii([null, null]), 0);
});

test("updateThreshold sets and toggles the active curve point without mutating the record", () => {
  const record = {
    ...createAudiogramRecord(new Date("2026-08-09T12:00:00")),
    right: {
      ac: curve(15, 20, 25, 35, null, 45, null, 60, null, 75),
      bc: EMPTY,
      ucl: EMPTY,
    },
  };
  const updated = updateThreshold(record, "right", "AC", 0, 35);
  assert.deepEqual(updated.right.ac[0], { db: 35, marker: "unmasked" });
  assert.deepEqual(record.right.ac[0], { db: 15, marker: "unmasked" });
  // Clicking near the existing value toggles the point away.
  assert.equal(updateThreshold(updated, "right", "AC", 0, 35).right.ac[0], null);
});

test("updateThreshold keeps the marker when moving an existing point", () => {
  const base = {
    ...createAudiogramRecord(),
    right: { ac: curve(30, null, null, null, null, null, null, null, null, null), bc: EMPTY, ucl: EMPTY },
  };
  const marked = setThresholdMarker(base, "right", "AC", 0, "masked-no-response");
  const moved = updateThreshold(marked, "right", "AC", 0, 60);
  assert.deepEqual(moved.right.ac[0], { db: 60, marker: "masked-no-response" });
});

test("point removal, marker changes, curve clearing, and cross-ear copies stay immutable", () => {
  const record = {
    ...createAudiogramRecord(),
    right: {
      ac: curve(15, null, 25, null, null, null, null, null, null, null),
      bc: EMPTY,
      ucl: EMPTY,
    },
  };

  const removed = removeThresholdPoint(record, "right", "AC", 0);
  assert.equal(removed.right.ac[0], null);
  assert.deepEqual(record.right.ac[0], { db: 15, marker: "unmasked" });
  // Removing an empty slot is a no-op that returns the same record.
  assert.equal(removeThresholdPoint(record, "right", "AC", 1), record);

  const marked = setThresholdMarker(record, "right", "AC", 2, "no-response");
  assert.deepEqual(marked.right.ac[2], { db: 25, marker: "no-response" });
  assert.equal(setThresholdMarker(record, "right", "AC", 1, "masked"), record);
  assert.equal(setThresholdMarker(marked, "right", "AC", 2, "no-response"), marked);

  const cleared = clearCurve(record, "right", "AC");
  assert.deepEqual(cleared.right.ac, EMPTY);
  assert.equal(clearCurve(cleared, "right", "AC"), cleared);

  const copied = copyCurveToOtherEar(marked, "right", "AC");
  assert.deepEqual(copied.left.ac, marked.right.ac);
  // The copy owns its points.
  assert.notEqual(copied.left.ac[0], marked.right.ac[0]);
  assert.deepEqual(record.left.ac, EMPTY);
});

test("new records start empty with today's local date and unique keys", () => {
  const first = createAudiogramRecord(new Date("2026-08-09T12:00:00"));
  const second = createAudiogramRecord(new Date("2026-08-09T12:00:00"));
  assert.equal(first.id, null);
  assert.equal(first.date, "2026-08-09");
  assert.notEqual(first.key, second.key);
  assert.deepEqual(first.right.ac, EMPTY);

  first.right.ac[0] = { db: 99, marker: "unmasked" };
  assert.equal(second.right.ac[0], null);

  const emptyA = cloneEmptyThresholds();
  const emptyB = cloneEmptyThresholds();
  emptyA.ac[0] = { db: 5, marker: "unmasked" };
  assert.equal(emptyB.ac[0], null);
});

test("isoDateToday uses the local calendar day", () => {
  assert.equal(isoDateToday(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});

test("client records round-trip through the working copy and back to drafts", () => {
  const stored: ClientAudiogramRecord = {
    id: 7,
    clientName: "Alice",
    date: "2026-07-29",
    useAudiogramRight: true,
    useAudiogramLeft: false,
    transducerRight: "Headphones",
    transducerLeft: "Sound field",
    right: {
      ac: curve(15, 20, 25, 35, 40, 45, 50, 60, 70, 75),
      bc: curve(10, 15, 20, 30, null, 40, null, 55, null, null),
      ucl: EMPTY,
    },
    left: {
      ac: curve(20, 20, 30, 35, null, 50, null, 65, null, 80),
      bc: EMPTY,
      ucl: EMPTY,
    },
    createdAt: 10,
    updatedAt: 20,
  };
  const working = audiogramRecordFromClient(stored);
  assert.equal(working.key, "db-7");
  assert.equal(working.id, 7);
  assert.deepEqual(working.right.ac, stored.right.ac);
  // The working copy owns its arrays and points.
  working.right.ac[0] = { db: 0, marker: "unmasked" };
  assert.deepEqual(stored.right.ac[0], { db: 15, marker: "unmasked" });

  const draft = audiogramDraftFromRecord(working);
  assert.equal(draft.id, 7);
  assert.equal(draft.date, "2026-07-29");
  assert.equal(draft.transducerLeft, "Sound field");
  assert.deepEqual(draft.right.ac[0], { db: 0, marker: "unmasked" });
});
