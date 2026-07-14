import assert from "node:assert/strict";
import test from "node:test";
import type { ClientRegistry } from "../src/shared/client-registry.ts";
import { buildClientContext, buildLanguageContext, COMPASS_CONTEXT } from "../src/main/compass-context.ts";

test("buildClientContext follows the persisted session assignment", () => {
  const registry: ClientRegistry = {
    clients: ["Chord"],
    assignments: { "session-1": "Chord" },
    profiles: {
      chord: {
        displayName: "Chord",
        name: "Chord",
        gender: "male",
        age: 30,
        contact: "chord@example.test",
        notes: "偏好安静环境",
        hearingAidBrands: ["phonak"],
        createdAt: 1,
        updatedAt: 2,
      },
    },
  };

  const context = buildClientContext(registry, "session-1");
  assert.match(context ?? "", /姓名：Chord/);
  assert.match(context ?? "", /性别：男/);
  assert.match(context ?? "", /助听器品牌：Phonak/);
  assert.match(buildClientContext(registry, "session-1", "en") ?? "", /Gender: Male/);
  assert.match(buildClientContext(registry, "session-1", "de") ?? "", /Hörgerätemarke: Phonak/);
  assert.equal(buildClientContext(registry, "unassigned-session"), undefined);
});

test("buildLanguageContext follows the selected interface language", () => {
  assert.match(buildLanguageContext("zh-CN"), /简体中文/);
  assert.match(buildLanguageContext("zh-TW"), /繁體中文/);
  assert.match(buildLanguageContext("en"), /respond in English/);
  assert.match(buildLanguageContext("de"), /auf Deutsch/);
});

test("Compass avoids canned completion openers after tool work", () => {
  assert.match(COMPASS_CONTEXT, /空泛开场/);
  assert.match(COMPASS_CONTEXT, /Done — both actions were completed\./);
});
