import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const compassRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const auditScript = resolve(compassRoot, "scripts", "audit-providers.mjs");

test("static provider audit loads the current Pi model runtime", () => {
  const result = spawnSync(process.execPath, [auditScript, "--static", "--json"], {
    cwd: compassRoot,
    encoding: "utf8",
    env: { ...process.env, PI_OFFLINE: "1" },
    timeout: 30_000,
  });

  assert.equal(
    result.status,
    0,
    `provider audit failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  const report = JSON.parse(result.stdout) as {
    registryLoadError?: string;
    totals: { providers: number; models: number; staticFailures: number };
  };
  assert.equal(report.registryLoadError, undefined);
  assert.ok(report.totals.providers > 0);
  assert.ok(report.totals.models > 0);
  assert.equal(report.totals.staticFailures, 0);
});
