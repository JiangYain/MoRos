import assert from "node:assert/strict";
import test from "node:test";
import {
  DependencyManager,
  type DependencyInstallRuntime,
} from "../src/main/dependency-manager.ts";
import type { DependencyInstallProgress } from "../src/shared/types.ts";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitUntil(predicate: () => boolean, description: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

function createManager(options: {
  prepareInstaller: DependencyInstallRuntime["prepareInstaller"];
  installGit?: DependencyInstallRuntime["installGit"];
  openPath?: (path: string) => Promise<string>;
  openExternal?: (url: string) => Promise<void>;
  onProgress: (progress: DependencyInstallProgress) => void;
}): DependencyManager {
  return new DependencyManager({
    rootDir: "C:\\dependency-manager-test",
    openPath: options.openPath ?? (async () => ""),
    openExternal: options.openExternal ?? (async () => undefined),
    onProgress: options.onProgress,
    installRuntime: {
      platform: "win32",
      prepareInstaller: options.prepareInstaller,
      installGit: options.installGit ?? (async () => "installed"),
    },
  });
}

test("winget is irreversible before spawn and cannot report a false cancellation", async () => {
  const progress: DependencyInstallProgress[] = [];
  const installStarted = deferred<void>();
  const installResult = deferred<"installed" | "unavailable">();
  let installSignal: AbortSignal | undefined;
  const manager = createManager({
    onProgress: (update) => progress.push(update),
    prepareInstaller: async () => {
      throw new Error("winget dependency entered the artifact installer pipeline");
    },
    installGit: async (signal) => {
      installSignal = signal;
      installStarted.resolve();
      return installResult.promise;
    },
  });

  assert.deepEqual(manager.startInstall("git", "session-winget"), { ok: true });
  await installStarted.promise;
  assert.deepEqual(progress.map((update) => update.phase), ["queued", "installing"]);

  const cancellation = manager.cancelInstall("git");
  assert.equal(cancellation.ok, false);
  assert.match(cancellation.error ?? "", /no longer be cancelled/);
  assert.equal(installSignal?.aborted, false);

  installResult.resolve("installed");
  await waitUntil(
    () => progress.some((update) => update.phase === "completed"),
    "winget completion",
  );
  assert.deepEqual(progress.map((update) => update.phase), [
    "queued",
    "installing",
    "completed",
  ]);
});

test("shutdown leaves an irreversible winget process alone and suppresses stale completion", async () => {
  const progress: DependencyInstallProgress[] = [];
  const installStarted = deferred<void>();
  const installResult = deferred<"installed" | "unavailable">();
  let installSignal: AbortSignal | undefined;
  const manager = createManager({
    onProgress: (update) => progress.push(update),
    prepareInstaller: async () => {
      throw new Error("winget dependency entered the artifact installer pipeline");
    },
    installGit: async (signal) => {
      installSignal = signal;
      installStarted.resolve();
      return installResult.promise;
    },
  });

  assert.deepEqual(manager.startInstall("git"), { ok: true });
  await installStarted.promise;
  manager.shutdown();
  assert.equal(installSignal?.aborted, false);

  installResult.resolve("installed");
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(progress.map((update) => update.phase), ["queued", "installing"]);
  assert.equal(progress.some((update) => update.phase === "completed"), false);
  assert.match(manager.startInstall("git").error ?? "", /shutting down/);
});
