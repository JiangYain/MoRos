import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ClientDatabase } from "../src/main/client-database.ts";
import {
  normalizeAudiogramCurve,
  normalizeClientAudiogramDraft,
  type AudiogramPoint,
  type ClientAudiogramDraft,
} from "../src/shared/client-audiograms.ts";

function point(db: number, marker: AudiogramPoint["marker"] = "unmasked"): AudiogramPoint {
  return { db, marker };
}

function audiogramDraft(overrides: Partial<ClientAudiogramDraft> = {}): ClientAudiogramDraft {
  return {
    id: null,
    date: "2026-08-12",
    useAudiogramRight: true,
    useAudiogramLeft: true,
    transducerRight: "Insert earphone",
    transducerLeft: "Insert earphone",
    right: {
      ac: [10, 15, 20, 30, 40, 55, 70],
      bc: [5, 10, 15, 25, 35, 50, null],
      ucl: [90, 90, 95, 100, 105, 105, 110],
    },
    left: {
      ac: [null, null, null, null, null, null, null],
      bc: [null, null, null, null, null, null, null],
      ucl: [null, null, null, null, null, null, null],
    },
    ...overrides,
  };
}

test("a fresh database is created at schema v3 with audiogram support", () => {
  const database = new ClientDatabase(":memory:");
  try {
    assert.equal(database.getSchemaVersion(), 3);
    assert.deepEqual(database.listAudiograms("无此客户"), []);
  } finally {
    database.close();
  }
});

test("v2 → v3 migration adds audiogram_records and keeps existing rows intact", () => {
  const directory = mkdtempSync(join(tmpdir(), "compass-client-db-v2-"));
  const databasePath = join(directory, "compass.sqlite3");
  try {
    // Seed the exact v2 schema (v3 minus audiogram_records).
    const seed = new DatabaseSync(databasePath, {
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    seed.exec(`
      CREATE TABLE clients (
        id INTEGER PRIMARY KEY,
        client_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        gender TEXT CHECK (gender IS NULL OR gender IN ('female', 'male')),
        age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
        contact TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        has_profile INTEGER NOT NULL DEFAULT 0 CHECK (has_profile IN (0, 1)),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE client_hearing_aid_brands (
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        brand TEXT NOT NULL,
        PRIMARY KEY (client_id, brand)
      );
      CREATE TABLE session_client_assignments (
        session_id TEXT PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        assigned_at INTEGER NOT NULL
      );
      CREATE INDEX idx_session_client_assignments_client
        ON session_client_assignments(client_id);
      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      PRAGMA user_version = 2;
    `);
    const now = Date.now();
    seed.prepare(`
      INSERT INTO clients (id, client_key, display_name, gender, age, contact, notes, has_profile, created_at, updated_at)
      VALUES (1, 'alice', 'Alice', 'female', 68, '', '', 1, ?, ?)
    `).run(now, now);
    seed.prepare(
      "INSERT INTO client_hearing_aid_brands (client_id, brand) VALUES (1, 'phonak')",
    ).run();
    seed.prepare(
      "INSERT INTO session_client_assignments (session_id, client_id, assigned_at) VALUES ('session-1', 1, ?)",
    ).run(now);
    seed.close();

    const migrated = new ClientDatabase(databasePath);
    try {
      assert.equal(migrated.getSchemaVersion(), 3);
      const registry = migrated.getRegistry();
      assert.deepEqual(registry.clients, ["Alice"]);
      assert.deepEqual(registry.profiles.alice.hearingAidBrands, ["phonak"]);
      assert.equal(registry.assignments["session-1"], "Alice");

      // The new table is usable right after migration.
      const saved = migrated.saveAudiogram("Alice", audiogramDraft());
      assert.equal(saved.clientName, "Alice");
      assert.equal(migrated.listAudiograms("Alice").length, 1);
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("saveAudiogram inserts on null id and updates in place afterwards", () => {
  const database = new ClientDatabase(":memory:");
  try {
    const created = database.saveAudiogram("王小明", audiogramDraft());
    assert.ok(created.id > 0);
    assert.equal(created.clientName, "王小明");
    // Legacy seven-octave input spreads onto the ten-column grid.
    assert.deepEqual(created.right.ac, [
      point(10), point(15), point(20), point(30), null,
      point(40), null, point(55), null, point(70),
    ]);
    assert.equal(created.right.bc[9], null);
    assert.deepEqual(created.right.bc[7], point(50));

    const updated = database.saveAudiogram("王小明", audiogramDraft({
      id: created.id,
      date: "2026-08-10",
      transducerLeft: "Bone conductor",
      right: {
        ac: [15, 20, 25, 35, 45, 60, 75],
        bc: [null, null, null, null, null, null, null],
        ucl: [90, 95, 100, 100, 105, 110, 110],
      },
    }));
    assert.equal(updated.id, created.id);
    assert.equal(updated.date, "2026-08-10");
    assert.equal(updated.transducerLeft, "Bone conductor");
    assert.deepEqual(updated.right.ac[0], point(15));
    assert.ok(updated.updatedAt >= created.updatedAt);
    assert.equal(updated.createdAt, created.createdAt);

    // Still exactly one record: the save was an update, not a duplicate.
    assert.equal(database.listAudiograms("王小明").length, 1);
  } finally {
    database.close();
  }
});

test("listAudiograms returns newest measurement dates first", () => {
  const database = new ClientDatabase(":memory:");
  try {
    database.saveAudiogram("Alice", audiogramDraft({ date: "2025-11-15" }));
    database.saveAudiogram("Alice", audiogramDraft({ date: "2026-07-29" }));
    database.saveAudiogram("Alice", audiogramDraft({ date: "2026-01-03" }));
    assert.deepEqual(
      database.listAudiograms("Alice").map((record) => record.date),
      ["2026-07-29", "2026-01-03", "2025-11-15"],
    );
    // Records never leak across clients.
    assert.deepEqual(database.listAudiograms("Bob"), []);
  } finally {
    database.close();
  }
});

test("deleting a client cascades its audiogram records", () => {
  const database = new ClientDatabase(":memory:");
  try {
    database.saveAudiogram("Alice", audiogramDraft());
    database.saveAudiogram("Alice", audiogramDraft({ date: "2025-11-15" }));
    assert.equal(database.listAudiograms("Alice").length, 2);

    database.deleteProfile("Alice");
    assert.deepEqual(database.listAudiograms("Alice"), []);

    // A recreated client with the same name starts without records.
    database.saveProfile({
      name: "Alice", gender: null, age: null, contact: "", notes: "", hearingAidBrands: [],
    });
    assert.deepEqual(database.listAudiograms("Alice"), []);
  } finally {
    database.close();
  }
});

test("saveAudiogram validates thresholds, ids, and ownership", () => {
  const database = new ClientDatabase(":memory:");
  try {
    // Wrong curve length.
    assert.throws(() => database.saveAudiogram("Alice", audiogramDraft({
      right: { ac: [10, 20], bc: [null, null], ucl: [null, null] },
    })), /听力图记录无效/);
    // Out-of-range threshold.
    assert.throws(() => database.saveAudiogram("Alice", audiogramDraft({
      right: {
        ac: [10, 15, 20, 30, 40, 55, 500],
        bc: [null, null, null, null, null, null, null],
        ucl: [null, null, null, null, null, null, null],
      },
    })), /听力图记录无效/);
    // Unknown record id.
    assert.throws(
      () => database.saveAudiogram("Alice", audiogramDraft({ id: 4321 })),
      /找不到要更新的听力图记录/,
    );
    // A record id may not be updated through a different client.
    const saved = database.saveAudiogram("Alice", audiogramDraft());
    assert.throws(
      () => database.saveAudiogram("Bob", audiogramDraft({ id: saved.id })),
      /找不到要更新的听力图记录/,
    );
  } finally {
    database.close();
  }
});

test("normalizeClientAudiogramDraft rounds values and rejects malformed input", () => {
  const normalized = normalizeClientAudiogramDraft(audiogramDraft({
    right: {
      ac: [10.4, 15, 20, 30, 40, 55, 70],
      bc: [null, null, null, null, null, null, null],
      ucl: [null, null, null, null, null, null, null],
    },
  }));
  assert.ok(normalized);
  assert.deepEqual(normalized.right.ac[0], point(10));

  assert.equal(normalizeClientAudiogramDraft(null), undefined);
  assert.equal(
    normalizeClientAudiogramDraft(audiogramDraft({ date: "2026/08/12" })),
    undefined,
  );
  assert.equal(
    normalizeClientAudiogramDraft(audiogramDraft({ id: -1 })),
    undefined,
  );
  assert.equal(
    normalizeClientAudiogramDraft({
      ...audiogramDraft(),
      transducerRight: "Loudspeaker",
    }),
    undefined,
  );
});

test("normalizeAudiogramCurve bridges legacy numbers and marker points", () => {
  // Legacy seven-octave number arrays map onto the ten-column grid.
  assert.deepEqual(
    normalizeAudiogramCurve([10, 15, 20, 30, 40, 55, 70]),
    [point(10), point(15), point(20), point(30), null, point(40), null, point(55), null, point(70)],
  );
  // Ten-column point objects pass through; a missing marker means unmasked.
  const modern = normalizeAudiogramCurve([
    { db: 20, marker: "masked" }, { db: 25.4 }, null, null, 45, null, null, null, null, null,
  ]);
  assert.ok(modern);
  assert.deepEqual(modern[0], point(20, "masked"));
  assert.deepEqual(modern[1], point(25));
  assert.deepEqual(modern[4], point(45));
  // Unknown markers, out-of-range values, and odd lengths are rejected.
  assert.equal(
    normalizeAudiogramCurve([{ db: 20, marker: "sparkly" }, null, null, null, null, null, null, null, null, null]),
    undefined,
  );
  assert.equal(
    normalizeAudiogramCurve([{ db: 500 }, null, null, null, null, null, null, null, null, null]),
    undefined,
  );
  assert.equal(normalizeAudiogramCurve([null, null, null, null, null, null, null, null]), undefined);
});
