import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ClientDatabase } from "../src/main/client-database.ts";

test("client database persists profiles and session assignments relationally", () => {
  const database = new ClientDatabase(":memory:");
  try {
    assert.equal(database.getSchemaVersion(), 1);
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
      gender: "unspecified",
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
