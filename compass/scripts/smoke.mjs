/**
 * Built Electron smoke test for the current Compass navigation and composer.
 * Usage: node scripts/smoke.mjs [outDir]
 */
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const defaultOutDir = process.env.CI ? "smoke-out" : join(tmpdir(), "compass-smoke");
const outDir = resolve(process.argv[2] ?? defaultOutDir);
mkdirSync(outDir, { recursive: true });

const app = await electron.launch({
  args: ["out/main/index.js"],
  cwd: resolve(import.meta.dirname, ".."),
  env: { ...process.env, COMPASS_WEB_PORT: "0" },
});

try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1320, height: 880 });
  const shot = async (name) => {
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`shot: ${name}`);
  };

  const invalidSessionResults = await page.evaluate(async () => {
    const invalidPath = "__compass_invalid_session__.jsonl";
    return Promise.all([
      window.compass.renameSession(invalidPath, "invalid"),
      window.compass.archiveSession(invalidPath),
      window.compass.deleteSession(invalidPath),
    ]);
  });
  if (invalidSessionResults.some((result) => result.ok)) {
    throw new Error("Session mutation accepted an unlisted path");
  }

  await page.waitForTimeout(4200);
  await shot("01-hero");

  await page.locator(".user-profile").click();
  await shot("02-profile-menu");

  await page.locator(".profile-menu button").filter({ hasText: "技能库" }).click();
  await page.getByRole("heading", { name: "Skills" }).waitFor();
  await shot("03-skills-settings");
  await page.getByRole("button", { name: "Back" }).click();

  await page.locator(".user-profile").click();
  await page.locator(".profile-menu button").filter({ hasText: "设置" }).click();
  await page.getByRole("heading", { name: "General" }).waitFor();
  await shot("04-general-settings");
  await page.getByRole("button", { name: "Back" }).click();

  const textarea = page.locator(".composer textarea");
  await textarea.click();
  await textarea.fill("/");
  await page.locator(".slash-popover").waitFor();
  await shot("05-slash-menu");
  await textarea.fill("");

  const modelButton = page.locator(".model-pill");
  await modelButton.click();
  await page.locator(".model-popover").waitFor();
  const initPayload = await page.evaluate(() => window.compass.init());
  const supportedLevels = new Set(initPayload.stats.model?.thinkingLevels ?? []);
  const supportsThinking = [...supportedLevels].some((level) => level !== "off");
  const effortButton = page.locator(".model-menu-main button").filter({ hasText: "Effort" });
  const effortDisabled = await effortButton.isDisabled();
  if (effortDisabled === supportsThinking) {
    throw new Error(`Effort control capability mismatch: supportsThinking=${supportsThinking}, disabled=${effortDisabled}`);
  }
  if (!effortDisabled) {
    await effortButton.hover();
    const renderedLevels = await page
      .locator(".model-submenu [data-thinking-level]")
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.thinkingLevel));
    if (renderedLevels.length === 0 || renderedLevels.some((level) => !level || !supportedLevels.has(level))) {
      throw new Error(`Model menu rendered unsupported thinking levels: ${renderedLevels.join(", ")}`);
    }
  }
  await shot("06-model-picker");
  await page.getByRole("button", { name: "Add Model" }).click();
  await page.getByRole("heading", { name: "Models" }).waitFor();
  const activeModelSwitch = page.locator(".settings-model-row.active [role=switch]");
  const activeModel = initPayload.stats.model;
  const activeModelIsAvailable = Boolean(
    activeModel && initPayload.models.some((model) => model.provider === activeModel.provider && model.id === activeModel.id),
  );
  if (activeModelIsAvailable) {
    if ((await activeModelSwitch.count()) !== 1 || (await activeModelSwitch.getAttribute("aria-checked")) !== "true") {
      throw new Error("Models settings did not expose the active enabled model");
    }
  } else {
    if ((await activeModelSwitch.count()) !== 0) {
      throw new Error("Models settings marked an unavailable model as active");
    }
    if (initPayload.models.length === 0) {
      await page.getByText("No available models", { exact: true }).waitFor();
    }
  }
  const enabledSwitchCount = await page.locator('.settings-model-row [role=switch][aria-checked="true"]').count();
  if (activeModelIsAvailable && enabledSwitchCount === 1 && !(await activeModelSwitch.isDisabled())) {
    throw new Error("The only active model can be disabled without a replacement");
  }
  await shot("07-models-settings");
  await page.getByRole("button", { name: "Back" }).click();

  await page.locator(".context-trigger").click();
  await page.getByRole("region", { name: "Context usage" }).waitFor();
  await page.getByText("Estimated breakdown", { exact: true }).waitFor();
  if ((await page.locator(".workspace-context-surface .workspace-tab").count()) !== 1) {
    throw new Error("Context Usage is not integrated into the workspace surface");
  }
  await shot("08-context-usage");
  await page.getByRole("button", { name: "Close context usage" }).click();

  await page.locator('.composer-icon-btn[aria-label="更多操作"]').click();
  await page.locator(".action-popover").waitFor();
  await shot("09-action-menu");
  await page.keyboard.press("Escape");

  await page.locator(".permission-pill").click();
  if ((await page.locator(".permission-option").count()) !== 3) {
    throw new Error("Permission menu must contain exactly three modes");
  }
  await shot("10-permission-menu");
  await page.keyboard.press("Escape");

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlN4VIAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator(".composer-image-input").setInputFiles({
    name: "smoke.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await page.locator(".composer-attachment").waitFor();
  await shot("11-image-attachment");
  await page.locator('.composer-attachment button[aria-label^="Remove image"]').click();

  await page.locator(".sidebar-nav-item").filter({ hasText: "搜索" }).click();
  const sidebarSearch = page.locator(".sidebar-search input");
  await sidebarSearch.fill("phonak");
  await shot("12-sidebar-search");

  await sidebarSearch.fill("");
  const firstSession = page.locator(".thread-file-item").first();
  if (await firstSession.count()) {
    await firstSession.click({ button: "right" });
    const sessionActions = await page
      .locator(".context-menu button")
      .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
    const expectedActions = ["重命名", "归档", "删除", "复制 Session ID"];
    if (JSON.stringify(sessionActions) !== JSON.stringify(expectedActions)) {
      throw new Error(`Session actions do not match: ${sessionActions.join(", ")}`);
    }
    await shot("13-session-menu");
    await page.keyboard.press("Escape");
  }

  await page.setViewportSize({ width: 600, height: 880 });
  await page.locator(".sidebar-toggle").click();
  await page.locator(".sidebar.mobile-open").waitFor();
  await shot("14-mobile-sidebar");

  console.log(`done, outDir=${outDir}`);
} finally {
  await app.close();
}
