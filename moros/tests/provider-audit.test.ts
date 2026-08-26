import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const morosRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const auditScript = resolve(morosRoot, "scripts", "audit-providers.mjs");

test("static provider audit loads the current Pi model runtime", () => {
  const result = spawnSync(process.execPath, [auditScript, "--static", "--json"], {
    cwd: morosRoot,
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
    results: Array<{
      provider: string;
      auth: { missingHint: boolean; missingOAuthHint: boolean; supportsOAuth: boolean };
    }>;
  };
  assert.equal(report.registryLoadError, undefined);
  assert.ok(report.totals.providers > 0);
  assert.ok(report.totals.models > 0);
  assert.equal(report.totals.staticFailures, 0);
  for (const provider of [
    "baseten",
    "qwen-token-plan",
    "qwen-token-plan-individual",
    "qwen-token-plan-cn",
  ]) {
    const providerResult = report.results.find((entry) => entry.provider === provider);
    assert.ok(providerResult, `${provider} must be present in the Pi provider registry`);
    assert.equal(providerResult.auth.missingHint, false, `${provider} must have a Moros auth hint`);
  }
  for (const provider of ["kimi-coding", "openrouter"]) {
    const providerResult = report.results.find((entry) => entry.provider === provider);
    assert.ok(providerResult, `${provider} must be present in the Pi provider registry`);
    assert.equal(providerResult.auth.supportsOAuth, true, `${provider} must expose Pi OAuth`);
    assert.equal(
      providerResult.auth.missingOAuthHint,
      false,
      `${provider} must have a Moros OAuth hint`,
    );
  }
});
