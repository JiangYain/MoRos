import assert from "node:assert/strict";
import test from "node:test";
import {
  addClient,
  addClientProfile,
  assignSessionToClient,
  normalizeClientProfileDraft,
  parseClientRegistry,
  unassignSession,
} from "../src/shared/client-registry.ts";

test("client registry safely parses and normalizes persisted data", () => {
  const registry = parseClientRegistry(JSON.stringify({
    clients: [" Alice ", "alice", 42],
    assignments: { s1: " Bob ", s2: null },
  }));
  assert.deepEqual(registry.clients, ["Alice", "Bob"]);
  assert.deepEqual(registry.assignments, { s1: "Bob" });
  assert.deepEqual(registry.profiles, {});
  assert.deepEqual(parseClientRegistry("broken"), { clients: [], assignments: {}, profiles: {} });
});

test("manual clients and assignments persist independently", () => {
  const created = addClient({ clients: [], assignments: {}, profiles: {} }, "顾客 张三");
  const assigned = assignSessionToClient(created, "session-1", "顾客 张三");
  assert.deepEqual(assigned.clients, ["顾客 张三"]);
  assert.equal(assigned.assignments["session-1"], "顾客 张三");
  assert.deepEqual(unassignSession(assigned, "session-1").assignments, {});
});

test("compact profiles normalize clinical essentials and remain assignable", () => {
  const created = addClientProfile({ clients: [], assignments: {}, profiles: {} }, {
    name: " 王小明 ",
    gender: "male",
    age: 42,
    contact: " 13800000000 ",
    notes: " 首次验配 ",
    hearingAidBrands: ["phonak", "widex", "phonak"],
  }, 1234);

  assert.deepEqual(created.clients, ["王小明"]);
  assert.deepEqual(created.profiles["王小明"], {
    displayName: "王小明",
    name: "王小明",
    gender: "male",
    age: 42,
    contact: "13800000000",
    notes: "首次验配",
    hearingAidBrands: ["phonak", "widex"],
    createdAt: 1234,
    updatedAt: 1234,
  });
  assert.equal(
    assignSessionToClient(created, "session-2", "王小明").assignments["session-2"],
    "王小明",
  );
});

test("legacy detailed profiles migrate into the compact profile shape", () => {
  const registry = parseClientRegistry(JSON.stringify({
    profiles: {
      "王小明": {
        displayName: "王小明",
        lastName: "王",
        firstName: "小明",
        gender: "male",
        dateOfBirth: "1984-03-02",
        email: "patient@example.com",
        homePhone: "021-12345678",
        hearingAidBrands: ["unitron", "oticon", "other", "phonak"],
        createdAt: 10,
        updatedAt: 20,
      },
    },
  }));

  assert.equal(registry.profiles["王小明"].name, "王小明");
  assert.equal(registry.profiles["王小明"].gender, "male");
  assert.match(registry.profiles["王小明"].contact, /021-12345678/);
  assert.match(registry.profiles["王小明"].contact, /patient@example.com/);
  assert.deepEqual(
    registry.profiles["王小明"].hearingAidBrands,
    ["unitron", "oticon", "other", "phonak"],
  );
  assert.ok((registry.profiles["王小明"].age ?? 0) > 0);
});

test("retired, missing, and invalid gender values normalize to null while female/male survive", () => {
  // normalizeClientProfileDraft covers drafts coming from the editor and IPC payloads.
  assert.equal(
    normalizeClientProfileDraft({ name: "A", gender: "female", age: null, contact: "", notes: "", hearingAidBrands: [] })?.gender,
    "female",
  );
  assert.equal(
    normalizeClientProfileDraft({ name: "B", gender: "male", age: null, contact: "", notes: "", hearingAidBrands: [] })?.gender,
    "male",
  );
  for (const retired of ["unspecified", "non-binary", "other", "unknown", "", "MALE", 1, null, undefined]) {
    assert.equal(
      normalizeClientProfileDraft({
        name: "X",
        // @ts-expect-error — exercising untyped legacy data paths.
        gender: retired,
        age: null,
        contact: "",
        notes: "",
        hearingAidBrands: [],
      })?.gender,
      null,
      `expected "${String(retired)}" to normalize to null`,
    );
  }
  assert.equal(
    normalizeClientProfileDraft({ name: "Y", age: null, contact: "", notes: "", hearingAidBrands: [] })?.gender,
    null,
    "missing gender field must normalize to null, not a hidden default",
  );

  // parseClientRegistry covers persisted legacy payloads (localStorage import).
  const registry = parseClientRegistry(JSON.stringify({
    profiles: {
      "P1": { name: "P1", gender: "female", createdAt: 1, updatedAt: 1 },
      "P2": { name: "P2", gender: "non-binary", createdAt: 1, updatedAt: 1 },
      "P3": { name: "P3", gender: "unspecified", createdAt: 1, updatedAt: 1 },
      "P4": { name: "P4", gender: null, createdAt: 1, updatedAt: 1 },
      "P5": { name: "P5", gender: "robot", createdAt: 1, updatedAt: 1 },
      "P6": { name: "P6", createdAt: 1, updatedAt: 1 },
    },
  }));
  assert.equal(registry.profiles.p1.gender, "female");
  assert.equal(registry.profiles.p2.gender, null);
  assert.equal(registry.profiles.p3.gender, null);
  assert.equal(registry.profiles.p4.gender, null);
  assert.equal(registry.profiles.p5.gender, null);
  assert.equal(registry.profiles.p6.gender, null);
});
