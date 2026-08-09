import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";
import { DEPENDENCY_IDS, isDependencyId, type DependencySnapshot } from "../src/shared/types.ts";
import {
  matchInstalledProgram,
  parseWindowsInventory,
  resolveDependencyExecutableSelection,
  resolvePhonakTargetInstallation,
  shouldRefreshDependencyInventory,
} from "../src/main/dependency-manager.ts";
import { DEPENDENCY_CATALOG } from "../src/main/dependencies/catalog.ts";
import { selectInstallerCandidate } from "../src/main/dependencies/installer.ts";
import { runProcess } from "../src/main/dependencies/process.ts";
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

test("the dependency catalog covers the closed allow-list with secure download metadata", () => {
  assert.deepEqual(DEPENDENCY_CATALOG.map((item) => item.id), [...DEPENDENCY_IDS]);
  const externalIds: string[] = [];
  for (const item of DEPENDENCY_CATALOG) {
    assert.match(item.sourceUrl, /^https:\/\//);
    if (item.installKind === "winget" || item.installKind === "external") {
      assert.equal(item.artifact, undefined);
      if (item.installKind === "external") {
        externalIds.push(item.id);
        assert.equal(item.sourceUrl, item.documentationUrl);
      }
      continue;
    }
    assert.ok(item.artifact);
    assert.match(item.artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(item.artifact.byteLength > 0);
    assert.ok(item.artifact.maxDownloadBytes >= item.artifact.byteLength);
    if (item.installKind === "archive") {
      assert.ok(item.artifact.archive);
      assert.ok(item.artifact.archive.maxEntries > 0);
      assert.ok(item.artifact.archive.maxExtractedBytes > item.artifact.byteLength);
    }
  }
  assert.deepEqual(externalIds, ["phonak-target", "signia-connexx", "widex-compass-gps"]);
});

test("archive installer selection prefers setup payloads and rejects paths outside extraction", () => {
  const extractionRoot = resolve("dependency-installer-test");
  const setup = join(extractionRoot, "payload", "setup.exe");
  const selected = selectInstallerCandidate(extractionRoot, [
    join(extractionRoot, "payload", "update-only.exe"),
    join(extractionRoot, "payload", "connexx-installer.exe"),
    setup,
  ], ["connexx"]);

  assert.equal(selected, setup);
  assert.throws(
    () => selectInstallerCandidate(
      extractionRoot,
      [resolve(extractionRoot, "..", "outside-setup.exe")],
      [],
    ),
    /outside the extracted download directory/,
  );
  assert.throws(
    () => selectInstallerCandidate(extractionRoot, [], []),
    /No Windows installer/,
  );
});

test("dependency processes preserve the cancellation contract before spawning", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runProcess(process.execPath, ["--version"], { signal: controller.signal }),
    (error: unknown) => error instanceof Error
      && error.name === "AbortError"
      && error.message === "Installation cancelled.",
  );
});

test("session changes can reuse a stale dependency inventory without weakening explicit refresh", () => {
  const cachedAt = 1;
  const now = 60_001;

  assert.equal(shouldRefreshDependencyInventory(true, cachedAt, now), true);
  assert.equal(
    shouldRefreshDependencyInventory(true, cachedAt, now, { allowStale: true }),
    false,
  );
  assert.equal(
    shouldRefreshDependencyInventory(true, cachedAt, now, { force: true, allowStale: true }),
    true,
  );
  assert.equal(
    shouldRefreshDependencyInventory(false, cachedAt, now, { allowStale: true }),
    true,
  );
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
    targetExecutables: {
      Path: "C:\\Program Files (x86)\\Phonak\\Phonak Target\\Target.exe",
      FileVersion: "28.1.1.3472",
    },
  }));

  assert.equal(inventory.programs.length, 1);
  assert.deepEqual(inventory.targetExecutables, [{
    path: "C:\\Program Files (x86)\\Phonak\\Phonak Target\\Target.exe",
    fileVersion: "28.1.1.3472",
  }]);
  assert.equal(inventory.noahDevice?.friendlyName, "Noahlink Wireless");
  assert.equal(matchInstalledProgram(inventory.programs, "phonak-target")?.displayVersion, "11.1.0.3472");
  assert.equal(matchInstalledProgram(inventory.programs, "signia-connexx"), undefined);
});

test("Target executable selection is deterministic and honors a manual version", () => {
  const target11 = "C:\\Program Files (x86)\\Phonak\\Target 11\\Target.exe";
  const target12 = "C:\\Program Files (x86)\\Phonak\\Target 12\\Target.exe";
  const candidates = [
    { path: target11, version: "11.2" },
    { path: target12, version: "12.0" },
    { path: target12.toUpperCase(), version: "12.0" },
  ];

  const automatic = resolveDependencyExecutableSelection(candidates);
  assert.equal(automatic.multipleDetected, true);
  assert.equal(automatic.candidates.length, 2);
  assert.equal(automatic.selectedPath, target12);
  assert.equal(automatic.source, "automatic");

  const manual = resolveDependencyExecutableSelection(candidates, target11);
  assert.equal(manual.selectedPath, target11);
  assert.equal(manual.source, "user");
});

test("a missing manual Target path is not silently replaced by another version", () => {
  const selection = resolveDependencyExecutableSelection(
    [{ path: "C:\\Phonak\\Target 12\\Target.exe", version: "12.0" }],
    "C:\\Phonak\\Removed Target\\Target.exe",
  );
  assert.equal(selection.configuredPath, "C:\\Phonak\\Removed Target\\Target.exe");
  assert.equal(selection.selectedPath, undefined);
  assert.equal(selection.source, undefined);
  assert.equal(resolvePhonakTargetInstallation(selection, [{
    displayName: "Phonak Target 12.0",
    displayVersion: "12.0",
    installLocation: "C:\\Phonak\\Target 12",
  }]), undefined);
});

test("automatic Target selection still reports a discovered executable", () => {
  const target = "C:\\Phonak\\Target 12\\Target.exe";
  const installation = resolvePhonakTargetInstallation(
    resolveDependencyExecutableSelection([{ path: target, fileVersion: "12.0.1" }]),
    [],
  );
  assert.deepEqual(installation, {
    installedVersion: "12.0.1",
    installedPath: "C:\\Phonak\\Target 12",
  });
});

test("Target installation matching always uses Windows path semantics", () => {
  const target = "C:\\Phonak\\Target 12\\Target.exe";
  const selection = resolveDependencyExecutableSelection([{ path: target }]);
  assert.deepEqual(resolvePhonakTargetInstallation(selection, [{
    displayName: "Phonak Target 12.0",
    displayVersion: "12.0.9",
    installLocation: "c:/phonak/target 12/",
  }]), {
    installedVersion: "12.0.9",
    installedPath: "C:\\Phonak\\Target 12",
  });
});

const missingTargetDependencies: DependencySnapshot = {
  checkedAt: 1,
  items: [{
    id: "phonak-target",
    category: "fitting-software",
    name: "Phonak Target",
    vendor: "Phonak",
    availability: "missing",
    installKind: "external",
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
