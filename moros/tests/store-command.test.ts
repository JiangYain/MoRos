import assert from "node:assert/strict";
import test from "node:test";
import {
  createStoreCommandRunner,
  ignoreCommandFailure,
  requireCommandSuccess,
} from "../src/renderer/src/store/command.ts";

test("a failed store command updates the error channel and remains rejected", async () => {
  const reported: string[] = [];
  const runCommand = createStoreCommandRunner({
    reportError: (message) => reported.push(message),
    sanitizeError: () => "safe failure",
  });

  await assert.rejects(
    runCommand(async () => {
      throw new Error("C:\\private\\session.jsonl");
    }),
    /safe failure/,
  );
  assert.deepEqual(reported, ["safe failure"]);
});

test("nested store commands report a failure exactly once", async () => {
  const reported: string[] = [];
  const runCommand = createStoreCommandRunner({
    reportError: (message) => reported.push(message),
    sanitizeError: (error) => error instanceof Error ? error.message : String(error),
  });

  await assert.rejects(
    runCommand(() => runCommand(async () => {
      throw new Error("backend unavailable");
    })),
    /backend unavailable/,
  );
  assert.deepEqual(reported, ["backend unavailable"]);
});

test("an unsuccessful result is promoted to a rejected command", async () => {
  const runCommand = createStoreCommandRunner({
    reportError: () => undefined,
    sanitizeError: (error) => error instanceof Error ? error.message : String(error),
  });

  await assert.rejects(
    runCommand(async () => requireCommandSuccess({ ok: false, error: "not saved" }, "fallback")),
    /not saved/,
  );
});

test("intentional best-effort commands consume their rejection", async () => {
  ignoreCommandFailure(Promise.reject(new Error("already reported")));
  await new Promise<void>((resolve) => setImmediate(resolve));
});
