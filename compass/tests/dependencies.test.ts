import assert from "node:assert/strict";
import test from "node:test";
import { isDependencyId, type DependencySnapshot } from "../src/shared/types.ts";
import {
  matchInstalledProgram,
  parseWindowsInventory,
} from "../src/main/dependency-manager.ts";
import {
  dependencyPromptKey,
  sessionDependencyInstall,
  sessionNeedsPhonakTarget,
} from "../src/renderer/src/dependency-recommendation.ts";

test("dependency ids are a closed allow-list", () => {
  assert.equal(isDependencyId("phonak-target"), true);
  assert.equal(isDependencyId("../../arbitrary-installer"), false);
  assert.equal(isDependencyId("https://example.test/setup.exe"), false);
});

test("Windows inventory parsing accepts PowerShell singleton output", () => {
  const inventory = parseWindowsInventory(JSON.stringify({
    programs: {
      DisplayName: "Phonak Target 11.1",
      DisplayVersion: "11.1.0.3472",
      InstallLocation: "C:\\Program Files (x86)\\Phonak\\Target",
    },
    noahDevice: {
      FriendlyName: "Noahlink Wireless",
      Status: "OK",
      InstanceId: "USB\\VID_16F0&PID_0003",
    },
  }));

  assert.equal(inventory.programs.length, 1);
  assert.equal(inventory.noahDevice?.friendlyName, "Noahlink Wireless");
  assert.equal(matchInstalledProgram(inventory.programs, "phonak-target")?.displayVersion, "11.1.0.3472");
  assert.equal(matchInstalledProgram(inventory.programs, "signia-connexx"), undefined);
});

const missingTargetDependencies: DependencySnapshot = {
  checkedAt: 1,
  items: [{
    id: "phonak-target",
    category: "fitting-software",
    name: "Phonak Target",
    vendor: "Phonak",
    availability: "missing",
    installKind: "archive",
    required: false,
    sourceUrl: "https://example.test/target.zip",
    documentationUrl: "https://example.test/target",
  }],
  installs: [],
};

test("Phonak recommendation is scoped to the assigned client's brands", () => {
  const registry = {
    clients: ["Alice", "Bob"],
    assignments: { "session-1": "Alice", "session-2": "Bob" },
    profiles: {
      alice: {
        name: "Alice",
        displayName: "Alice",
        gender: null,
        age: null,
        contact: "",
        notes: "",
        hearingAidBrands: ["phonak" as const],
        createdAt: 1,
        updatedAt: 1,
      },
      bob: {
        name: "Bob",
        displayName: "Bob",
        gender: null,
        age: null,
        contact: "",
        notes: "",
        hearingAidBrands: ["widex" as const],
        createdAt: 1,
        updatedAt: 1,
      },
    },
  };

  assert.equal(sessionNeedsPhonakTarget("session-1", registry, missingTargetDependencies), true);
  assert.equal(sessionNeedsPhonakTarget("session-2", registry, missingTargetDependencies), false);
  assert.equal(
    sessionNeedsPhonakTarget("session-1", registry, missingTargetDependencies, {
      [dependencyPromptKey("session-1", "phonak-target")]: true,
    }),
    false,
  );
  assert.equal(
    sessionNeedsPhonakTarget("session-1", registry, {
      ...missingTargetDependencies,
      items: [{ ...missingTargetDependencies.items[0], availability: "installed" }],
    }),
    false,
  );
});

test("install progress only appears in the session that requested it", () => {
  const dependencies: DependencySnapshot = {
    ...missingTargetDependencies,
    installs: [{
      dependencyId: "phonak-target",
      phase: "downloading",
      progress: 0.4,
      sessionId: "session-1",
      updatedAt: 2,
    }],
  };
  assert.equal(sessionDependencyInstall("session-1", dependencies, "phonak-target")?.progress, 0.4);
  assert.equal(sessionDependencyInstall("session-2", dependencies, "phonak-target"), undefined);
});
