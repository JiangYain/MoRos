import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  closeElectronApplication,
  collectPosixDescendantPids,
  runSmokePhase,
  runWithCleanup,
  SMOKE_CLOSE_TIMEOUT_MS,
  SmokePhaseTimeoutError,
} from "../scripts/smoke/harness.mjs";

class FakeElectronProcess extends EventEmitter {
  readonly pid = 4242;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly signals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    this.signalCode = signal;
    this.emit("exit", null, signal);
    return true;
  }

  exit(code = 0): void {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}

const quietLogs = {
  log: () => undefined,
  errorLog: () => undefined,
};

test("Electron graceful-close deadline stays fixed at eight seconds", () => {
  assert.equal(SMOKE_CLOSE_TIMEOUT_MS, 8_000);
});

test("smoke phases log their label and enforce a deterministic timeout", async () => {
  const messages: string[] = [];
  const value = await runSmokePhase("fast-phase", async () => 42, {
    timeoutMs: 100,
    log: (message: string) => messages.push(message),
    errorLog: (message: string) => messages.push(message),
  });
  assert.equal(value, 42);
  assert.match(messages[0], /START phase=fast-phase/);
  assert.match(messages[1], /OK phase=fast-phase/);

  await assert.rejects(
    runSmokePhase("blocked-phase", () => new Promise(() => undefined), {
      timeoutMs: 10,
      log: (message: string) => messages.push(message),
      errorLog: (message: string) => messages.push(message),
    }),
    (error: unknown) => error instanceof SmokePhaseTimeoutError
      && error.phase === "blocked-phase"
      && error.timeoutMs === 10,
  );
  assert(messages.some((message) => message.includes("TIMEOUT phase=blocked-phase")));
});

test("smoke cleanup preserves the original failure when cleanup also fails", async () => {
  const primary = new Error("launch failed");
  const cleanup = new Error("cleanup failed");
  const reported: unknown[] = [];
  let cleanupCalled = false;

  await assert.rejects(
    runWithCleanup(
      async () => {
        throw primary;
      },
      async () => {
        cleanupCalled = true;
        throw cleanup;
      },
      { onCleanupError: (error: unknown) => reported.push(error) },
    ),
    (error: unknown) => error === primary,
  );
  assert.equal(cleanupCalled, true);
  assert.deepEqual(reported, [cleanup]);
});

test("Electron cleanup returns after a graceful close without forcing the process", async () => {
  const child = new FakeElectronProcess();
  const app = {
    process: () => child,
    close: async () => child.exit(),
  };

  await closeElectronApplication(app, {
    child,
    closeTimeoutMs: 20,
    forceKillTimeoutMs: 20,
    platform: "linux",
    ...quietLogs,
  });
  assert.deepEqual(child.signals, []);
  assert.equal(child.exitCode, 0);
});

test("Electron cleanup force-kills a stuck POSIX process after the close deadline", async () => {
  const child = new FakeElectronProcess();
  const killedDescendants: number[] = [];
  const app = {
    process: () => child,
    close: () => new Promise<void>(() => undefined),
  };

  await assert.rejects(
    closeElectronApplication(app, {
      child,
      closeTimeoutMs: 10,
      forceKillTimeoutMs: 20,
      isPidAlive: () => false,
      killPid: (pid: number) => killedDescendants.push(pid),
      listPosixDescendants: () => [5002, 5001],
      platform: "linux",
      ...quietLogs,
    }),
    /app\.close\(\) did not finish within 10ms/,
  );
  assert.deepEqual(killedDescendants, [5002, 5001]);
  assert.deepEqual(child.signals, ["SIGKILL"]);
});

test("POSIX process-table parsing returns the complete tree deepest first", () => {
  assert.deepEqual(
    collectPosixDescendantPids(42, "43 42\n44 43\n45 42\n99 1\n"),
    [44, 43, 45],
  );
});

test("POSIX cleanup still kills the Electron root when tree discovery fails", async () => {
  const child = new FakeElectronProcess();
  const app = {
    process: () => child,
    close: () => new Promise<void>(() => undefined),
  };

  await assert.rejects(closeElectronApplication(app, {
    child,
    closeTimeoutMs: 10,
    forceKillTimeoutMs: 20,
    listPosixDescendants: () => {
      throw new Error("ps unavailable");
    },
    platform: "linux",
    ...quietLogs,
  }));
  assert.deepEqual(child.signals, ["SIGKILL"]);
});

test("Electron cleanup uses taskkill for a stuck Windows process tree", async () => {
  const child = new FakeElectronProcess();
  const taskkillPids: number[] = [];
  const app = {
    process: () => child,
    close: () => new Promise<void>(() => undefined),
  };

  await assert.rejects(
    closeElectronApplication(app, {
      child,
      closeTimeoutMs: 10,
      forceKillTimeoutMs: 20,
      platform: "win32",
      taskkill: (pid: number) => {
        taskkillPids.push(pid);
        child.exit();
        return { status: 0 };
      },
      ...quietLogs,
    }),
    /app\.close\(\) did not finish within 10ms/,
  );
  assert.deepEqual(taskkillPids, [child.pid]);
  assert.deepEqual(child.signals, []);
});
