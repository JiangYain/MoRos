import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ClientDatabase } from "../src/main/client-database.ts";

test("client database persists profiles and session assignments relationally", () => {
  const database = new ClientDatabase(":memory:");
  try {
    assert.equal(database.getSchemaVersion(), 3);
    assert.deepEqual(database.getRegistry(), { clients: [], assignments: {}, profiles: {} });

    const withProfile = database.saveProfile({
      name: " 王小明 ",
      gender: "male",
      age: 42,
      contact: " 13800000000 ",
      notes: " 首次验配 ",
      hearingAidBrands: ["phonak", "widex", "phonak"],
    });
    assert.deepEqual(withProfile.clients, ["王小明"]);
    assert.equal(withProfile.profiles["王小明"].contact, "13800000000");
    assert.equal(withProfile.profiles["王小明"].notes, "首次验配");
    assert.deepEqual(withProfile.profiles["王小明"].hearingAidBrands, ["phonak", "widex"]);

    const assigned = database.assignSession("session-1", "王小明");
    assert.equal(assigned.assignments["session-1"], "王小明");
    assert.deepEqual(database.unassignSession("session-1").assignments, {});
  } finally {
    database.close();
  }
});

test("updateProfile renames a client while keeping brands and session assignments attached", () => {
  const database = new ClientDatabase(":memory:");
  try {
    database.saveProfile({
      name: "王小明",
      gender: "male",
      age: 42,
      contact: "13800000000",
      notes: "首次验配",
      hearingAidBrands: ["phonak"],
    });
    database.assignSession("session-1", "王小明");

    const renamed = database.updateProfile("王小明", {
      name: "王大明",
      gender: "male",
      age: 43,
      contact: "13800000000",
      notes: "改名后",
      hearingAidBrands: ["widex"],
    });
    assert.deepEqual(renamed.clients, ["王大明"]);
    assert.equal(renamed.profiles["王小明"], undefined);
    assert.equal(renamed.profiles["王大明"].age, 43);
    assert.deepEqual(renamed.profiles["王大明"].hearingAidBrands, ["widex"]);
    // The session assignment follows the renamed row.
    assert.equal(renamed.assignments["session-1"], "王大明");
  } finally {
    database.close();
  }
});

test("updateProfile rejects renaming onto another existing client", () => {
  const database = new ClientDatabase(":memory:");
  try {
    database.saveProfile({
      name: "Alice", gender: null, age: null, contact: "", notes: "", hearingAidBrands: [],
    });
    database.saveProfile({
      name: "Bob", gender: null, age: null, contact: "", notes: "", hearingAidBrands: [],
    });
    assert.throws(() => database.updateProfile("Alice", {
      name: "Bob", gender: null, age: null, contact: "", notes: "", hearingAidBrands: [],
    }), /已存在同名客户/);
    // The failed transaction leaves both clients untouched.
    assert.deepEqual(database.getRegistry().clients, ["Alice", "Bob"]);
  } finally {
    database.close();
  }
});

test("deleteProfile removes the client, cascades brands, and releases sessions", () => {
  const database = new ClientDatabase(":memory:");
  try {
    database.saveProfile({
      name: "Alice", gender: "female", age: 68, contact: "", notes: "", hearingAidBrands: ["phonak"],
    });
    database.assignSession("session-1", "Alice");
    database.assignSession("session-2", "Alice");

    const registry = database.deleteProfile("Alice");
    assert.deepEqual(registry, { clients: [], assignments: {}, profiles: {} });

    // Recreating the same name starts from a clean slate.
    const recreated = database.saveProfile({
      name: "Alice", gender: null, age: null, contact: "", notes: "", hearingAidBrands: [],
    });
    assert.deepEqual(recreated.profiles.alice.hearingAidBrands, []);
    assert.deepEqual(recreated.assignments, {});
  } finally {
    database.close();
  }
});

test("legacy localStorage import is idempotent and preserves retired brand IDs", () => {
  const database = new ClientDatabase(":memory:");
  const legacy = JSON.stringify({
    clients: ["Alice"],
    assignments: { "session-legacy": "Alice" },
    profiles: {
      Alice: {
        name: "Alice",
        gender: "female",
        age: 68,
        contact: "legacy@example.test",
        notes: "legacy",
        hearingAidBrands: ["unitron", "oticon", "other", "phonak"],
        createdAt: 10,
        updatedAt: 20,
      },
    },
  });

  try {
    const imported = database.importLegacyRegistry(legacy);
    assert.deepEqual(
      new Set(imported.profiles.alice.hearingAidBrands),
      new Set(["unitron", "oticon", "other", "phonak"]),
    );
    assert.equal(imported.assignments["session-legacy"], "Alice");

    database.saveProfile({
      name: "Alice",
      gender: "female",
      age: 69,
      contact: "current@example.test",
      notes: "current",
      hearingAidBrands: ["phonak"],
    });
    const reimported = database.importLegacyRegistry(legacy);
    assert.equal(reimported.clients.filter((name) => name === "Alice").length, 1);
    assert.equal(reimported.profiles.alice.contact, "current@example.test");
    assert.deepEqual(reimported.profiles.alice.hearingAidBrands, ["phonak"]);
  } finally {
    database.close();
  }
});

test("file-backed client database survives reopening", () => {
  const directory = mkdtempSync(join(tmpdir(), "compass-client-db-"));
  const databasePath = join(directory, "compass.sqlite3");
  try {
    const first = new ClientDatabase(databasePath);
    first.saveProfile({
      name: "持久客户",
      gender: null,
      age: null,
      contact: "",
      notes: "重启后仍应存在",
      hearingAidBrands: ["starkey"],
    });
    first.close();

    const reopened = new ClientDatabase(databasePath);
    try {
      assert.equal(reopened.getRegistry().profiles["持久客户"].notes, "重启后仍应存在");
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("v1 → v2 migration preserves clients, brands, and assignments and retires legacy genders", () => {
  const directory = mkdtempSync(join(tmpdir(), "compass-client-db-v1-"));
  const databasePath = join(directory, "compass.sqlite3");
  try {
    // Seed a v1 schema directly with all four legacy gender values.
    const seed = new DatabaseSync(databasePath, {
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
    });
    seed.exec(`
      CREATE TABLE clients (
        id INTEGER PRIMARY KEY,
        client_key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        gender TEXT NOT NULL DEFAULT 'unspecified'
          CHECK (gender IN ('female', 'male', 'non-binary', 'unspecified')),
        age INTEGER,
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
      PRAGMA user_version = 1;
    `);
    const now = Date.now();
    const insertClient = seed.prepare(`
      INSERT INTO clients (id, client_key, display_name, gender, age, contact, notes, has_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertClient.run(1, "alice", "Alice", "female", 68, "alice@example.test", "female notes", 1, now, now);
    insertClient.run(2, "bob", "Bob", "male", 42, "", "", 1, now, now);
    insertClient.run(3, "casey", "Casey", "non-binary", 30, "", "nb notes", 1, now, now);
    insertClient.run(4, "dale", "Dale", "unspecified", null, "", "", 0, now, now);
    const insertBrand = seed.prepare(
      "INSERT OR IGNORE INTO client_hearing_aid_brands (client_id, brand) VALUES (?, ?)",
    );
    insertBrand.run(1, "phonak");
    insertBrand.run(2, "widex");
    insertBrand.run(2, "oticon");
    insertBrand.run(3, "resound");
    const insertAssignment = seed.prepare(`
      INSERT INTO session_client_assignments (session_id, client_id, assigned_at)
      VALUES (?, ?, ?)
    `);
    insertAssignment.run("session-alice", 1, now);
    insertAssignment.run("session-bob", 2, now);
    insertAssignment.run("session-unassigned-dale", 4, now);
    seed.close();

    // Reopen through ClientDatabase; this triggers the v1 → v2 → v3 chain.
    const migrated = new ClientDatabase(databasePath);
    try {
      assert.equal(migrated.getSchemaVersion(), 3);
      const registry = migrated.getRegistry();

      // All four clients survive — IDs/names are preserved losslessly.
      assert.deepEqual(registry.clients, ["Alice", "Bob", "Casey", "Dale"]);

      // female and male are preserved; non-binary and unspecified become null.
      assert.equal(registry.profiles.alice.gender, "female");
      assert.equal(registry.profiles.bob.gender, "male");
      assert.equal(registry.profiles.casey.gender, null);
      // Dale never had a profile; ensureClient wrote has_profile = 0.
      assert.equal(registry.profiles.dale, undefined);

      // Brand links survive the table rebuild.
      assert.deepEqual(registry.profiles.alice.hearingAidBrands, ["phonak"]);
      assert.deepEqual(registry.profiles.bob.hearingAidBrands, ["oticon", "widex"]);
      assert.deepEqual(registry.profiles.casey.hearingAidBrands, ["resound"]);

      // Session assignments survive (foreign keys stay intact).
      assert.equal(registry.assignments["session-alice"], "Alice");
      assert.equal(registry.assignments["session-bob"], "Bob");
      assert.equal(registry.assignments["session-unassigned-dale"], "Dale");

      // Saving a fresh profile on a migrated client keeps gender in the v2 set.
      const updated = migrated.saveProfile({
        name: "Casey",
        gender: null,
        age: 31,
        contact: "",
        notes: "now migrated",
        hearingAidBrands: ["resound"],
      });
      assert.equal(updated.profiles.casey.gender, null);
    } finally {
      migrated.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
