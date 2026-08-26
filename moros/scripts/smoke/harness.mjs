import { spawnSync } from "node:child_process";

export const SMOKE_CLOSE_TIMEOUT_MS = 8_000;
export const SMOKE_FORCE_KILL_TIMEOUT_MS = 5_000;

export class SmokePhaseTimeoutError extends Error {
  constructor(phase, timeoutMs) {
    super(`Smoke phase "${phase}" timed out after ${timeoutMs}ms.`);
    this.name = "SmokePhaseTimeoutError";
    this.phase = phase;
    this.timeoutMs = timeoutMs;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function defaultLog(message) {
  console.log(message);
}

function defaultErrorLog(message) {
  console.error(message);
}

function settledWithin(operation, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);
    Promise.resolve()
      .then(operation)
      .then(
        (value) => finish({ status: "fulfilled", value }),
        (error) => finish({ status: "rejected", error }),
      );
  });
}

export async function runSmokePhase(
  phase,
  operation,
  {
    timeoutMs = 30_000,
    log = defaultLog,
    errorLog = defaultErrorLog,
    now = Date.now,
  } = {},
) {
  const startedAt = now();
  const timeoutLabel = timeoutMs === null ? "native" : `${timeoutMs}`;
  log(`[smoke] START phase=${phase} timeoutMs=${timeoutLabel}`);

  try {
    let value;
    if (timeoutMs === null) {
      value = await operation();
    } else {
      const outcome = await settledWithin(operation, timeoutMs);
      if (outcome.status === "timeout") throw new SmokePhaseTimeoutError(phase, timeoutMs);
      if (outcome.status === "rejected") throw outcome.error;
      value = outcome.value;
    }
    log(`[smoke] OK phase=${phase} elapsedMs=${Math.max(0, now() - startedAt)}`);
    return value;
  } catch (error) {
    const status = error instanceof SmokePhaseTimeoutError ? "TIMEOUT" : "FAIL";
    errorLog(
      `[smoke] ${status} phase=${phase} elapsedMs=${Math.max(0, now() - startedAt)} error=${errorMessage(error)}`,
    );
    throw error;
  }
}

export async function runWithCleanup(
  operation,
  cleanup,
  { onCleanupError = (error) => defaultErrorLog(`[smoke] CLEANUP_FAIL error=${errorMessage(error)}`) } = {},
) {
  let completed = false;
  let result;
  let primaryError;

  try {
    result = await operation();
    completed = true;
  } catch (error) {
    primaryError = error;
  }

  try {
    await cleanup();
  } catch (cleanupError) {
    if (completed) throw cleanupError;
    try {
      onCleanupError(cleanupError);
    } catch {
      // Reporting cleanup failure must not replace the scenario's original error.
    }
  }

  if (!completed) throw primaryError;
  return result;
}

function processExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForProcessExit(child, timeoutMs) {
  if (processExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off?.("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(processExited(child)), timeoutMs);
    child.once("exit", onExit);
  });
}

function defaultTaskkill(pid) {
  return spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    timeout: SMOKE_FORCE_KILL_TIMEOUT_MS,
    windowsHide: true,
  });
}

export function collectPosixDescendantPids(rootPid, processTable) {
  const childrenByParent = new Map();
  for (const line of processTable.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    if (pid <= 0 || parentPid <= 0 || pid === rootPid) continue;
    const children = childrenByParent.get(parentPid) ?? [];
    children.push(pid);
    childrenByParent.set(parentPid, children);
  }

  const descendants = [];
  const visited = new Set([rootPid]);
  const visit = (parentPid) => {
    for (const childPid of childrenByParent.get(parentPid) ?? []) {
      if (visited.has(childPid)) continue;
      visited.add(childPid);
      visit(childPid);
      descendants.push(childPid);
    }
  };
  visit(rootPid);
  return descendants;
}

function defaultListPosixDescendants(rootPid) {
  const result = spawnSync("ps", ["-A", "-o", "pid=,ppid="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: SMOKE_FORCE_KILL_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ps exited with status ${result.status}.`);
  return collectPosixDescendantPids(rootPid, result.stdout ?? "");
}

function defaultKillPid(pid) {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function defaultIsPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

async function waitForPidsExit(pids, timeoutMs, isPidAlive) {
  const deadline = Date.now() + timeoutMs;
  while (pids.some((pid) => isPidAlive(pid))) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return true;
}

async function forceKillProcess(
  child,
  {
    platform,
    forceKillTimeoutMs,
    isPidAlive,
    killPid,
    listPosixDescendants,
    taskkill,
    log,
  },
) {
  if (processExited(child)) return;
  const pid = child.pid;
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("Electron process has no valid pid for forced cleanup.");
  }

  log(`[smoke] FORCE_KILL pid=${pid} platform=${platform}`);
  if (platform === "win32") {
    const result = taskkill(pid);
    if (result.error && !processExited(child)) throw result.error;
    if (result.status !== 0 && !processExited(child)) {
      throw new Error(`taskkill exited with status ${result.status}.`);
    }
  } else {
    const cleanupErrors = [];
    let descendants = [];
    try {
      descendants = listPosixDescendants(pid);
    } catch (error) {
      cleanupErrors.push(error);
    }
    for (const descendantPid of descendants) {
      try {
        killPid(descendantPid);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    let signaled = false;
    try {
      signaled = child.kill("SIGKILL");
    } catch (error) {
      if (!processExited(child)) cleanupErrors.push(error);
    }
    if (!signaled && !processExited(child)) {
      try {
        killPid(pid);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    const [rootExited, descendantsExited] = await Promise.all([
      waitForProcessExit(child, forceKillTimeoutMs),
      waitForPidsExit(descendants, forceKillTimeoutMs, isPidAlive),
    ]);
    if (!rootExited || !descendantsExited) {
      cleanupErrors.push(new Error(`Electron process tree ${pid} remained alive after forced cleanup.`));
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, `Electron process tree ${pid} cleanup was incomplete.`);
    }
    return;
  }

  if (!await waitForProcessExit(child, forceKillTimeoutMs)) {
    throw new Error(`Electron process tree ${pid} remained alive after forced cleanup.`);
  }
}

export async function closeElectronApplication(
  app,
  {
    child = app.process(),
    closeTimeoutMs = SMOKE_CLOSE_TIMEOUT_MS,
    forceKillTimeoutMs = SMOKE_FORCE_KILL_TIMEOUT_MS,
    isPidAlive = defaultIsPidAlive,
    killPid = defaultKillPid,
    listPosixDescendants = defaultListPosixDescendants,
    platform = process.platform,
    taskkill = defaultTaskkill,
    log = defaultLog,
    errorLog = defaultErrorLog,
  } = {},
) {
  log(`[smoke] START phase=cleanup.close timeoutMs=${closeTimeoutMs}`);
  const outcome = await settledWithin(() => app.close(), closeTimeoutMs);
  if (outcome.status === "fulfilled") {
    log("[smoke] OK phase=cleanup.close");
    return;
  }

  const gracefulError = outcome.status === "timeout"
    ? new Error(`Electron app.close() did not finish within ${closeTimeoutMs}ms.`)
    : outcome.error;
  errorLog(`[smoke] FORCE_CLOSE reason=${errorMessage(gracefulError)}`);
  // Chromium descendants inherit these pipes. Close our read ends before a
  // forced tree kill so an orphan cannot keep the Node smoke process alive.
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref?.();

  try {
    await forceKillProcess(child, {
      platform,
      forceKillTimeoutMs,
      isPidAlive,
      killPid,
      listPosixDescendants,
      taskkill,
      log,
    });
  } catch (forceKillError) {
    throw new AggregateError(
      [gracefulError, forceKillError],
      "Electron graceful close and forced cleanup both failed.",
      { cause: gracefulError },
    );
  }

  throw gracefulError;
}
