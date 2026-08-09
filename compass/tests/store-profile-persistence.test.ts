import assert from "node:assert/strict";
import test from "node:test";
import {
  loadProfileAvatar,
  loadProfileIdentity,
  persistProfileAvatar,
  persistProfileIdentity,
  type StoreStorage,
} from "../src/renderer/src/store/profile-persistence.ts";

function memoryStorage(initial: Record<string, string> = {}): StoreStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

test("profile persistence normalizes identity before committing it", () => {
  const storage = memoryStorage();
  const identity = persistProfileIdentity("  Ada  Lovelace ", " @ada lovelace ", storage);

  assert.deepEqual(identity, { name: "Ada Lovelace", handle: "ada_lovelace" });
  assert.deepEqual(loadProfileIdentity(storage), identity);
});

test("profile persistence rejects invalid avatars and survives blocked storage", () => {
  const storage = memoryStorage({ "compass.profile.avatar.v1": "plain text" });
  assert.equal(loadProfileAvatar(storage), null);

  const blocked: StoreStorage = {
    getItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  assert.deepEqual(loadProfileIdentity(blocked), { name: "", handle: "" });
  assert.equal(persistProfileAvatar("data:image/png;base64,abc", blocked), false);
});
