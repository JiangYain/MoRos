/**
 * Built Electron smoke suite for the current Moros navigation and composer.
 * Usage: node scripts/smoke.mjs [outDir]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { runActivityScenario } from "./smoke/activity.mjs";
import { runApprovalScenario } from "./smoke/approval.mjs";
import { runBootstrapScenario } from "./smoke/bootstrap.mjs";
import { runComposerScenario } from "./smoke/composer.mjs";
import { runSessionScenario } from "./smoke/sessions.mjs";
import { runSettingsScenario } from "./smoke/settings.mjs";
import { runStreamingScenario } from "./smoke/streaming.mjs";
import {
  closeElectronApplication,
  runSmokePhase,
  runWithCleanup,
} from "./smoke/harness.mjs";

const LAUNCH_TIMEOUT_MS = 30_000;
const PHASE_TIMEOUT_MS = 30_000;
const SCENARIO_TIMEOUT_MS = 90_000;
const SUITE_TIMEOUT_MS = 240_000;
const SCREENSHOT_TIMEOUT_MS = 15_000;

const defaultOutDir = process.env.CI ? "smoke-out" : join(tmpdir(), "moros-smoke");
const outDir = resolve(process.argv[2] ?? defaultOutDir);
mkdirSync(outDir, { recursive: true });
const smokeUserDataDir = mkdtempSync(join(tmpdir(), "moros-smoke-profile-"));
const smokeWorkspaceDir = join(smokeUserDataDir, "workspace");
const smokeSkillDir = join(smokeWorkspaceDir, "smoke-fixture");
mkdirSync(smokeSkillDir, { recursive: true });
writeFileSync(
  join(smokeSkillDir, "SKILL.md"),
  [
    "---",
    "name: smoke-fixture",
    "description: Deterministic smoke-test skill fixture.",
    "---",
    "",
    "# Smoke fixture",
    "",
  ].join("\n"),
  "utf8",
);
writeFileSync(
  join(smokeUserDataDir, "moros-settings.json"),
  JSON.stringify({ workspaceDir: smokeWorkspaceDir }),
  "utf8",
);
let app;
let page;
let electronProcess;

await runWithCleanup(async () => {
  app = await runSmokePhase("launch", () => electron.launch({
    args: ["out/main/index.js"],
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      MOROS_HEADLESS: "1",
      MOROS_WEB_PORT: "0",
      MOROS_USER_DATA_DIR: smokeUserDataDir,
    },
    timeout: LAUNCH_TIMEOUT_MS,
  }), { timeoutMs: null });
  electronProcess = app.process();
  electronProcess.stdout?.pipe(process.stdout);
  electronProcess.stderr?.pipe(process.stderr);
  electronProcess.once("exit", (code, signal) => {
    console.log(`[smoke] ELECTRON_EXIT code=${code ?? "null"} signal=${signal ?? "null"}`);
  });

  const runPhase = (phase, operation, timeoutMs = PHASE_TIMEOUT_MS) => (
    runSmokePhase(phase, operation, { timeoutMs })
  );

  page = await runPhase(
    "first-window",
    () => app.firstWindow({ timeout: LAUNCH_TIMEOUT_MS }),
    LAUNCH_TIMEOUT_MS + 5_000,
  );
  page.on("crash", () => console.error("[smoke] PAGE_CRASH"));
  page.on("pageerror", (error) => console.error(`[smoke] PAGE_ERROR error=${error.message}`));
  app.context().setDefaultTimeout(20_000);
  app.context().setDefaultNavigationTimeout(30_000);
  await runPhase("renderer-ready", async () => {
    await page.waitForURL(
      (url) => url.protocol === "http:"
        && url.hostname === "127.0.0.1"
        && url.port.length > 0,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForLoadState("domcontentloaded");
  }, LAUNCH_TIMEOUT_MS);
  await runPhase(
    "viewport",
    () => page.setViewportSize({ width: 1320, height: 880 }),
    15_000,
  );

  const shot = async (name) => runPhase(`shot.${name}`, async () => {
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`shot: ${name}`);
  }, SCREENSHOT_TIMEOUT_MS);
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlN4VIAAAAASUVORK5CYII=",
    "base64",
  );

  try {
    await runPhase("suite", async () => {
      await runPhase(
        "scenario.bootstrap",
        () => runBootstrapScenario({ page, shot, runPhase }),
        SCENARIO_TIMEOUT_MS,
      );
      const settings = await runPhase(
        "scenario.settings",
        () => runSettingsScenario({ page, shot, onePixelPng }),
        SCENARIO_TIMEOUT_MS,
      );
      await runPhase("scenario.composer", () => runComposerScenario({
        page,
        shot,
        onePixelPng,
        smokeQuickPrompts: settings.smokeQuickPrompts,
      }), SCENARIO_TIMEOUT_MS);
      await runPhase(
        "scenario.approval",
        () => runApprovalScenario({ app, page, shot }),
        SCENARIO_TIMEOUT_MS,
      );
      const activity = await runPhase(
        "scenario.activity",
        () => runActivityScenario({ app, page, shot }),
        SCENARIO_TIMEOUT_MS,
      );
      const streaming = await runPhase("scenario.streaming", () => runStreamingScenario({
        app,
        page,
        shot,
        previousTheme: settings.previousTheme,
        ...activity,
      }), SCENARIO_TIMEOUT_MS);
      await runPhase(
        "scenario.sessions",
        () => runSessionScenario({ app, page, shot, ...streaming }),
        SCENARIO_TIMEOUT_MS,
      );
    }, SUITE_TIMEOUT_MS);
  } catch (error) {
    if (!page.isClosed()) {
      try {
        await runSmokePhase(
          "failure-screenshot",
          () => page.screenshot({ path: join(outDir, "failure.png") }),
          { timeoutMs: 5_000 },
        );
      } catch {
        // The phase log already records why the diagnostic screenshot failed.
      }
    }
    throw error;
  }

  console.log(`done, outDir=${outDir}`);
}, async () => {
  let closeError;
  if (app) {
    try {
      await closeElectronApplication(app, { child: electronProcess });
    } catch (error) {
      closeError = error;
    }
  }

  try {
    rmSync(smokeUserDataDir, { recursive: true, force: true });
  } catch (removeError) {
    if (closeError) {
      throw new AggregateError(
        [closeError, removeError],
        "Electron cleanup and smoke profile removal both failed.",
        { cause: closeError },
      );
    }
    throw removeError;
  }
  if (closeError) throw closeError;
});
