import assert from "node:assert/strict";
import test from "node:test";
import {
  DependencyManager,
  type DependencyInstallRuntime,
} from "../src/main/dependency-manager.ts";
import { dependencyAbortError } from "../src/main/dependencies/process.ts";
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
    getExecutablePath: () => undefined,
    setExecutablePath: () => undefined,
    installRuntime: {
      platform: "win32",
      prepareInstaller: options.prepareInstaller,
      installGit: options.installGit ?? (async () => "installed"),
    },
  });
}

test("mid-flight cancellation remains cancelable and ends without launching", async () => {
  const progress: DependencyInstallProgress[] = [];
  const preparationStarted = deferred<void>();
  let launched = false;
  const manager = createManager({
    onProgress: (update) => progress.push(update),
    openPath: async () => {
      launched = true;
      return "";
    },
    prepareInstaller: async (_item, _root, signal, onProgress) => {
      onProgress({ phase: "downloading", progress: 0.25, downloadedBytes: 25, totalBytes: 100 });
      preparationStarted.resolve();
      return new Promise<string>((_resolve, reject) => {
        const abort = (): void => reject(dependencyAbortError());
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      });
    },
  });

  assert.deepEqual(manager.startInstall("noahlink-wireless-driver", "session-1"), { ok: true });
  await preparationStarted.promise;
  assert.deepEqual(manager.cancelInstall("noahlink-wireless-driver"), { ok: true });
  assert.match(manager.cancelInstall("noahlink-wireless-driver").error ?? "", /already in progress/);
  await waitUntil(() => progress.some((update) => update.phase === "cancelled"), "cancelled progress");

  assert.equal(launched, false);
  assert.deepEqual(progress.map((update) => update.phase), [
    "queued",
    "downloading",
    "cancelled",
  ]);
});

test("launch is an explicit irreversible phase and preserves phase order", async () => {
  const progress: DependencyInstallProgress[] = [];
  const launchStarted = deferred<void>();
  const launchResult = deferred<string>();
  const manager = createManager({
    onProgress: (update) => progress.push(update),
    prepareInstaller: async (_item, _root, _signal, onProgress) => {
      onProgress({ phase: "downloading", progress: 1, downloadedBytes: 10, totalBytes: 10 });
      return "C:\\verified\\setup.exe";
    },
    openPath: async () => {
      launchStarted.resolve();
      return launchResult.promise;
    },
  });

  assert.deepEqual(manager.startInstall("noahlink-wireless-driver", "session-2"), { ok: true });
  await launchStarted.promise;
  const cancellation = manager.cancelInstall("noahlink-wireless-driver");
  assert.equal(cancellation.ok, false);
  assert.match(cancellation.error ?? "", /already been launched/);
  launchResult.resolve("");
  await waitUntil(
    () => progress.some((update) => update.phase === "awaiting-user"),
    "awaiting-user progress",
  );

  assert.deepEqual(progress.map((update) => update.phase), [
    "queued",
    "downloading",
    "launching",
    "awaiting-user",
  ]);
});

test("external dependencies never enter the managed installer pipeline", async () => {
  const progress: DependencyInstallProgress[] = [];
  const pageOpened = deferred<void>();
  const pageResult = deferred<void>();
  let prepareCalls = 0;
  const manager = createManager({
    onProgress: (update) => progress.push(update),
    prepareInstaller: async () => {
      prepareCalls += 1;
      throw new Error("external dependency entered the managed installer pipeline");
    },
    openExternal: async () => {
      pageOpened.resolve();
      await pageResult.promise;
    },
  });

  assert.deepEqual(manager.startInstall("phonak-target", "session-external"), { ok: true });
  await pageOpened.promise;
  assert.equal(prepareCalls, 0);
  const cancellation = manager.cancelInstall("phonak-target");
  assert.equal(cancellation.ok, false);
  assert.match(cancellation.error ?? "", /already been launched/);
  pageResult.resolve();
  await waitUntil(
    () => progress.some((update) => update.phase === "awaiting-user"),
    "external awaiting-user progress",
  );
  assert.deepEqual(progress.map((update) => update.phase), [
    "queued",
    "launching",
    "awaiting-user",
  ]);
});

test("shutdown invalidates an external launch generation and suppresses stale progress", async () => {
  const progress: DependencyInstallProgress[] = [];
  const launchStarted = deferred<void>();
  const launchResult = deferred<void>();
  let prepareCalls = 0;
  const manager = createManager({
    onProgress: (update) => progress.push(update),
    prepareInstaller: async () => {
      prepareCalls += 1;
      throw new Error("external dependency entered the managed installer pipeline");
    },
    openExternal: async () => {
      launchStarted.resolve();
      await launchResult.promise;
    },
  });

  assert.deepEqual(manager.startInstall("phonak-target"), { ok: true });
  await launchStarted.promise;
  assert.equal(prepareCalls, 0);
  manager.shutdown();
  launchResult.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(progress.map((update) => update.phase), ["queued", "launching"]);
  assert.equal(progress.some((update) => update.phase === "awaiting-user"), false);
  assert.match(manager.startInstall("phonak-target").error ?? "", /shutting down/);
});

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
