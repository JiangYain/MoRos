/**
 * Built Electron smoke test for the current Compass navigation and composer.
 * Usage: node scripts/smoke.mjs [outDir]
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const defaultOutDir = process.env.CI ? "smoke-out" : join(tmpdir(), "compass-smoke");
const outDir = resolve(process.argv[2] ?? defaultOutDir);
mkdirSync(outDir, { recursive: true });
const smokeUserDataDir = mkdtempSync(join(tmpdir(), "compass-smoke-profile-"));

const app = await electron.launch({
  args: ["out/main/index.js"],
  cwd: resolve(import.meta.dirname, ".."),
  env: {
    ...process.env,
    COMPASS_WEB_PORT: "0",
    COMPASS_USER_DATA_DIR: smokeUserDataDir,
  },
});

try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1320, height: 880 });
  const migratedClientName = `Migrated Smoke ${Date.now()}`;
  await page.evaluate(({ key, name }) => {
    localStorage.setItem(key, JSON.stringify({
      clients: [name],
      assignments: {},
      profiles: {
        [name]: {
          name,
          gender: "unspecified",
          age: null,
          contact: "legacy@example.test",
          notes: "legacy migration",
          hearingAidBrands: ["unitron", "oticon", "other", "phonak"],
          createdAt: 10,
          updatedAt: 20,
        },
      },
    }));
  }, { key: "compass.clients.v1", name: migratedClientName });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(async ({ key, name }) => {
    const payload = await window.compass.init();
    return localStorage.getItem(key) === null && payload.clientRegistry.clients.includes(name);
  }, { key: "compass.clients.v1", name: migratedClientName });
  const migratedBrands = await page.evaluate(async (name) => {
    const payload = await window.compass.init();
    return payload.clientRegistry.profiles[name.toLocaleLowerCase("zh-CN")]?.hearingAidBrands ?? [];
  }, migratedClientName);
  if (!migratedBrands.includes("unitron") || !migratedBrands.includes("oticon") || !migratedBrands.includes("other")) {
    throw new Error(`Legacy client migration dropped retired brands: ${migratedBrands.join(", ")}`);
  }
  await page.evaluate(() => window.compass.setLanguage("en"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(async () => (await window.compass.init()).settings.language === "en");
  const shot = async (name) => {
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`shot: ${name}`);
  };
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlN4VIAAAAASUVORK5CYII=",
    "base64",
  );

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

  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Developer: Current Context" }).click();
  const contextDialog = page.getByRole("dialog", { name: "Current conversation context" });
  await contextDialog.waitFor();
  await contextDialog.getByRole("button", { name: "Effective system prompt" }).click();
  if (!String(await contextDialog.locator("pre").textContent()).includes("Compass 工作守则")) {
    throw new Error("Developer context viewer did not expose the effective system prompt");
  }
  await contextDialog.getByRole("button", { name: "Close context viewer" }).click();
  await contextDialog.waitFor({ state: "detached" });

  const activeClientToggle = page.locator(
    '.file-tree-item[data-active-client="true"] > .folder-row .file-item-main',
  );
  const activeClientToggleCount = await activeClientToggle.count();
  if (activeClientToggleCount > 1) {
    throw new Error(`Expected at most one active client group, found ${activeClientToggleCount}`);
  }
  if (activeClientToggleCount === 1) {
    await activeClientToggle.click();
    if ((await activeClientToggle.getAttribute("aria-expanded")) !== "false") {
      throw new Error("Active client group ignored its collapsed state");
    }
    await activeClientToggle.click();
    if ((await activeClientToggle.getAttribute("aria-expanded")) !== "true") {
      throw new Error("Active client group did not expand again");
    }
  }

  await page.locator(".user-profile").click();
  await shot("02-profile-menu");

  await page.locator(".profile-menu-head-button").click();
  await page.getByRole("heading", { name: "Profile" }).waitFor();
  await page.locator(".settings-profile-metrics").waitFor();
  const previousProfileAvatar = await page.evaluate(() =>
    window.localStorage.getItem("compass.profile.avatar.v1"),
  );
  await page.locator(".settings-profile-avatar-input").setInputFiles({
    name: "profile-smoke.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await page.locator(".settings-profile-avatar img").waitFor();
  if (!String(await page.locator(".settings-profile-avatar img").getAttribute("src")).startsWith("data:image/")) {
    throw new Error("Profile avatar upload did not produce a local image");
  }
  await shot("02b-profile-settings");
  await page.locator(".settings-profile-photo-actions .remove").click();
  if (previousProfileAvatar) {
    await page.evaluate((avatar) => {
      window.localStorage.setItem("compass.profile.avatar.v1", avatar);
    }, previousProfileAvatar);
  }
  await page.getByRole("complementary").getByRole("button", { name: "Back" }).click();

  await page.locator(".user-profile").click();
  await page.locator(".profile-menu button").filter({ hasText: "Skill library" }).click();
  await page.getByRole("heading", { name: "Skills" }).waitFor();
  await shot("03-skills-settings");
  await page.getByRole("complementary").getByRole("button", { name: "Back" }).click();

  await page.locator(".user-profile").click();
  await page.locator(".profile-menu button").filter({ hasText: "Settings" }).click();
  await page.getByRole("heading", { name: "General" }).waitFor();
  await page
    .getByRole("navigation", { name: "Settings navigation" })
    .getByRole("button", { name: /Appearance/ })
    .click();
  await page.getByRole("heading", { name: "Appearance" }).waitFor();
  const previousTheme = await page.evaluate(() => {
    const value = window.localStorage.getItem("compass.theme.v1");
    return value === "light" || value === "dark" || value === "system" ? value : "system";
  });
  await page.getByRole("radio", { name: /Dark/ }).click();
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark") {
    throw new Error("Dark appearance preference did not update the document theme");
  }
  const darkColors = await page.evaluate(() => ({
    page: getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
    text: getComputedStyle(document.documentElement).getPropertyValue("--color-text-primary").trim(),
  }));
  if (darkColors.page !== "#151719" || darkColors.text !== "#f2f4f5") {
    throw new Error(`Dark theme tokens are not active: ${JSON.stringify(darkColors)}`);
  }
  await shot("04a-dark-theme");
  const themeLabel = previousTheme === "light" ? /Light/ : previousTheme === "dark" ? /Dark/ : /System/;
  await page.getByRole("radio", { name: themeLabel }).click();
  await shot("04-appearance-settings");
  await page.getByRole("complementary").getByRole("button", { name: "Back" }).click();

  const textarea = page.locator(".composer textarea");
  await textarea.click();
  await textarea.fill("请帮我执行 /");
  await page.locator(".slash-popover").waitFor();
  const slashPaletteLayout = await page.locator(".slash-popover").evaluate((popover) => {
    const item = popover.querySelector(".popover-item");
    const name = item?.querySelector(".name");
    const description = item?.querySelector(".desc");
    const popoverStyle = getComputedStyle(popover);
    const itemStyle = item ? getComputedStyle(item) : null;
    const nameStyle = name ? getComputedStyle(name) : null;
    const descriptionStyle = description ? getComputedStyle(description) : null;
    return {
      headerCount: popover.querySelectorAll(".popover-head").length,
      tagCount: popover.querySelectorAll(".tag").length,
      kbdCount: popover.querySelectorAll("kbd").length,
      hintCount: popover.querySelectorAll(".slash-popover-hint").length,
      backdropFilter: popoverStyle.backdropFilter,
      borderRadius: popoverStyle.borderRadius,
      itemDisplay: itemStyle?.display,
      itemHeight: item?.getBoundingClientRect().height,
      itemMinHeight: itemStyle?.minHeight,
      itemBorderBottom: itemStyle?.borderBottomWidth,
      nameFontSize: nameStyle?.fontSize,
      nameFontWeight: nameStyle?.fontWeight,
      nameClientWidth: name?.clientWidth,
      nameScrollWidth: name?.scrollWidth,
      descriptionFontSize: descriptionStyle?.fontSize,
      descriptionWhiteSpace: descriptionStyle?.whiteSpace,
      descriptionOverflow: descriptionStyle?.overflow,
    };
  });
  if (
    slashPaletteLayout.headerCount !== 0
    || slashPaletteLayout.tagCount !== 0
    || slashPaletteLayout.kbdCount !== 0
    || slashPaletteLayout.hintCount !== 0
    || !slashPaletteLayout.backdropFilter.includes("blur(12px)")
    || slashPaletteLayout.itemDisplay !== "flex"
    || slashPaletteLayout.itemMinHeight !== "32px"
    || slashPaletteLayout.itemHeight > 34
    || slashPaletteLayout.itemBorderBottom !== "0px"
    || slashPaletteLayout.nameFontSize !== "12px"
    || slashPaletteLayout.nameFontWeight !== "500"
    || slashPaletteLayout.nameScrollWidth > slashPaletteLayout.nameClientWidth + 1
    || slashPaletteLayout.descriptionFontSize !== "11px"
    || slashPaletteLayout.descriptionWhiteSpace !== "nowrap"
    || slashPaletteLayout.descriptionOverflow !== "hidden"
  ) {
    throw new Error(`Slash command palette layout regressed: ${JSON.stringify(slashPaletteLayout)}`);
  }
  await shot("05-slash-menu");
  await page.keyboard.press("Escape");
  await page.locator(".slash-popover").waitFor({ state: "detached" });
  if ((await textarea.inputValue()) !== "请帮我执行 /") {
    throw new Error("Dismissing slash suggestions modified the draft");
  }
  await textarea.fill("请帮我执行 ");
  await textarea.fill("请帮我执行 /");
  await page.locator(".slash-popover").waitFor();
  await page.keyboard.press("Tab");
  const appliedSlash = await textarea.inputValue();
  const selectedSkillChip = page.locator(".composer-skill-selection");
  if (appliedSlash.trim() !== "请帮我执行" || (await selectedSkillChip.count()) !== 1) {
    throw new Error(`Skill selection did not become a structured chip: ${appliedSlash}`);
  }
  await shot("05b-skill-chip");
  await selectedSkillChip.getByRole("button", { name: /Remove skill/ }).click();
  await textarea.fill("");

  const modelButton = page.locator(".model-pill");
  await modelButton.click();
  await page.locator(".model-popover").waitFor();
  await textarea.click();
  await page.locator(".model-popover").waitFor({ state: "detached" });
  await modelButton.click();
  await page.locator(".model-popover").waitFor();
  await page.locator(".composer-toolbar").click({ position: { x: 300, y: 18 } });
  await page.locator(".model-popover").waitFor({ state: "detached" });
  await modelButton.click();
  await page.locator(".model-popover").waitFor();
  await page.locator(".model-menu-main button").filter({ hasText: "Model" }).hover();
  await page.locator(".model-submenu").waitFor();
  const modelMenuBounds = await page.locator(".model-menu-layer").evaluate((menu) => {
    const root = menu.querySelector(".model-popover")?.getBoundingClientRect();
    const submenu = menu.querySelector(".model-submenu")?.getBoundingClientRect();
    return root && submenu
      ? {
          rootLeft: root.left,
          rootRight: root.right,
          submenuLeft: submenu.left,
          submenuRight: submenu.right,
          submenuWidth: submenu.width,
          viewport: window.innerWidth,
        }
      : null;
  });
  if (!modelMenuBounds) throw new Error("Model submenu bounds are unavailable");
  if (modelMenuBounds.submenuLeft < modelMenuBounds.rootRight || modelMenuBounds.submenuWidth > 160) {
    throw new Error(`Model submenu is not compact or right-opening: ${JSON.stringify(modelMenuBounds)}`);
  }
  if (modelMenuBounds.rootLeft < 0 || modelMenuBounds.submenuRight > modelMenuBounds.viewport) {
    throw new Error(`Model menu is clipped: ${JSON.stringify(modelMenuBounds)}`);
  }
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
    await page.locator(".model-submenu [data-thinking-level]").first().waitFor();
    const renderedLevels = await page
      .locator(".model-submenu [data-thinking-level]")
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.thinkingLevel));
    if (renderedLevels.length === 0 || renderedLevels.some((level) => !level || !supportedLevels.has(level))) {
      throw new Error(`Model menu rendered unsupported thinking levels: ${renderedLevels.join(", ")}`);
    }

    const maxOption = page.locator('.model-submenu [data-thinking-level="max"]');
    if (await maxOption.count()) {
      const speedButton = page.locator('[data-model-menu-view="speed"]');
      const effortBounds = await effortButton.boundingBox();
      const speedBounds = await speedButton.boundingBox();
      const maxBounds = await maxOption.boundingBox();
      if (!effortBounds || !speedBounds || !maxBounds) {
        throw new Error("Model menu intent bounds are unavailable");
      }
      await page.mouse.move(effortBounds.x + effortBounds.width / 2, effortBounds.y + effortBounds.height / 2);
      await page.mouse.move(speedBounds.x + speedBounds.width / 2, speedBounds.y + speedBounds.height / 2);
      await page.mouse.move(maxBounds.x + maxBounds.width / 2, maxBounds.y + maxBounds.height / 2);
      await page.waitForTimeout(120);
      if ((await page.locator(".model-submenu").getAttribute("data-model-submenu")) !== "effort") {
        throw new Error("Crossing the Speed row incorrectly replaced the Effort submenu");
      }
    }
  }
  await shot("06-model-picker");
  await page.getByRole("button", { name: "Add Model" }).click();
  await page.getByRole("heading", { name: "Provider & Model" }).waitFor();
  const settingsSectionOrder = await page
    .locator(".settings-models-page > section")
    .evaluateAll((sections) => sections.map((section) => section.getAttribute("aria-label")));
  if (
    JSON.stringify(settingsSectionOrder) !==
    JSON.stringify(["Providers & API Keys", "Conversation title model", "Provider & Model"])
  ) {
    throw new Error(`Provider & Model sections are out of order: ${settingsSectionOrder.join(", ")}`);
  }
  const summaryModelSelect = page.getByRole("combobox", { name: "Summary model" });
  const expectedSummaryModel = `${initPayload.settings.summaryModel.provider}::${initPayload.settings.summaryModel.id}`;
  if ((await summaryModelSelect.inputValue()) !== expectedSummaryModel) {
    throw new Error("Conversation title summary model does not match persisted settings");
  }
  const providerSection = page.locator(".settings-provider-section");
  const providerToggle = page.locator(".settings-provider-toggle");
  if (!(await providerSection.evaluate((section) => section.classList.contains("open")))) {
    await providerToggle.click();
  }
  const providerRows = page.locator(".settings-provider-row");
  try {
    await page.waitForFunction(
      ({ selector, expected }) => document.querySelectorAll(selector).length === expected,
      { selector: ".settings-provider-row", expected: initPayload.providers.length },
      { timeout: 5_000 },
    );
  } catch {
    // Preserve a count-based assertion below so CI reports useful diagnostics
    // instead of only a generic Playwright timeout.
  }
  const providerRowCount = await providerRows.count();
  if (providerRowCount !== initPayload.providers.length) {
    throw new Error(
      `Provider settings did not render the complete provider registry: expected ${initPayload.providers.length}, got ${providerRowCount}`,
    );
  }
  if ((await providerRows.locator("svg").count()) !== initPayload.providers.length) {
    throw new Error("At least one provider is missing its icon");
  }
  const apiKeyProvider = initPayload.providers.find((provider) => provider.supportsApiKey);
  if (apiKeyProvider) {
    const providerRow = page.locator(`[data-provider-id="${apiKeyProvider.id}"]`);
    await providerRow.getByRole("button", { name: apiKeyProvider.configured ? "Replace key" : "Set key" }).click();
    const apiKeyInput = providerRow.getByRole("textbox", {
      name: `${apiKeyProvider.name} API key`,
      exact: true,
    });
    if ((await apiKeyInput.getAttribute("type")) !== "password") {
      throw new Error("Provider API key is not masked by default");
    }
    await apiKeyInput.fill("compass-smoke-key");
    const revealKey = providerRow.getByRole("button", { name: `Show ${apiKeyProvider.name} API key` });
    await revealKey.click();
    if ((await apiKeyInput.getAttribute("type")) !== "text") {
      throw new Error("Provider API key reveal control did not expose the draft");
    }
    await providerRow.getByRole("button", { name: `Hide ${apiKeyProvider.name} API key` }).click();
    if ((await apiKeyInput.getAttribute("type")) !== "password") {
      throw new Error("Provider API key hide control did not restore masking");
    }
    const copyKey = providerRow.getByRole("button", { name: `Copy ${apiKeyProvider.name} API key` });
    if (await copyKey.isDisabled()) throw new Error("Masked provider API key cannot be copied");
    await apiKeyInput.press("Escape");
    await providerRow.locator(".settings-provider-editor").waitFor({ state: "detached" });
  }
  await shot("07a-provider-icons");
  await providerToggle.click();
  const refreshButton = page.getByRole("button", { name: "Refresh providers and models" });
  await refreshButton.click();
  await page.locator(".settings-refresh-button.refreshing").waitFor();
  await page.locator(".settings-refresh-button.refreshing").waitFor({ state: "detached" });
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

  const togglableModelSwitch = page.locator('.settings-model-row:not(.active) [role=switch]:not(:disabled)').first();
  if (await togglableModelSwitch.count()) {
    const modelOrderBefore = await page.locator(".settings-model-row").evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-model-key")),
    );
    const modelKey = await togglableModelSwitch.evaluate((button) =>
      button.closest(".settings-model-row")?.getAttribute("data-model-key"),
    );
    const checkedBefore = await togglableModelSwitch.getAttribute("aria-checked");
    await togglableModelSwitch.click();
    await page.waitForFunction(
      ({ key, checked }) => {
        const row = Array.from(document.querySelectorAll(".settings-model-row"))
          .find((element) => element.getAttribute("data-model-key") === key);
        return row?.querySelector('[role="switch"]')?.getAttribute("aria-checked") !== checked;
      },
      { key: modelKey, checked: checkedBefore },
    );
    const modelOrderAfter = await page.locator(".settings-model-row").evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-model-key")),
    );
    if (JSON.stringify(modelOrderAfter) !== JSON.stringify(modelOrderBefore)) {
      throw new Error("Toggling a model reordered the visible model list");
    }
    await page.locator(".settings-model-row").evaluateAll((rows, key) => {
      const row = rows.find((element) => element.getAttribute("data-model-key") === key);
      (row?.querySelector('[role="switch"]'))?.click();
    }, modelKey);
  }
  await shot("07-models-settings");
  await page.setViewportSize({ width: 600, height: 880 });
  const responsiveLabels = [
    page.locator(".settings-back span"),
    page.locator(".settings-search input"),
    page.locator(".settings-nav nav strong").first(),
  ];
  for (const label of responsiveLabels) {
    if (!(await label.isVisible())) throw new Error("Responsive settings hid a required text label");
  }
  if (activeModelIsAvailable && !(await page.locator(".settings-active-model").isVisible())) {
    throw new Error("Responsive settings hid the active-model indicator");
  }
  await shot("07b-responsive-settings");
  await page.setViewportSize({ width: 1320, height: 880 });
  await page.getByRole("complementary").getByRole("button", { name: "Back" }).click();

  await page.locator(".context-trigger").click();
  const contextRingWidth = await page.locator(".context-trigger circle").first().evaluate((circle) =>
    Number.parseFloat(getComputedStyle(circle).strokeWidth),
  );
  if (Math.abs(contextRingWidth - 3.4) > 0.05) {
    throw new Error(`Context ring must be 3.4px: ${contextRingWidth}px`);
  }
  await page.getByRole("region", { name: "Context usage" }).waitFor();
  await page.locator(".context-usage-list").waitFor();
  await page.locator(".context-usage-visual").waitFor();
  if ((await page.locator(".workspace-context-surface .workspace-tab").count()) !== 1) {
    throw new Error("Context Usage is not integrated into the workspace surface");
  }
  await shot("08-context-usage");
  await page.getByRole("button", { name: "Close context usage" }).click();

  await page.locator('.composer-icon-btn[aria-label="More actions"]').click();
  await page.locator(".action-popover").waitFor();
  await shot("09-action-menu");
  await page.keyboard.press("Escape");

  await page.locator(".permission-pill").click();
  if ((await page.locator(".permission-option").count()) !== 3) {
    throw new Error("Permission menu must contain exactly three modes");
  }
  await shot("10-permission-menu");
  await page.keyboard.press("Escape");

  await page.locator(".composer").evaluate((node, imageBase64) => {
    const bytes = Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "dropped-smoke.png", { type: "image/png" }));
    window.__compassSmokeTransfer = transfer;
    node.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }));
  }, onePixelPng.toString("base64"));
  await page.locator(".composer-drop-overlay").waitFor();
  await page.locator(".composer").evaluate((node) => {
    const transfer = window.__compassSmokeTransfer;
    node.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    delete window.__compassSmokeTransfer;
  });
  await page.locator(".composer-attachment").waitFor();
  await shot("10b-image-drop");
  await page.locator('.composer-attachment button[aria-label^="Remove image"]').click();

  await page.locator(".composer-image-input").setInputFiles({
    name: "smoke.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await page.locator(".composer-attachment").waitFor();
  await shot("11-image-attachment");
  await page.locator('.composer-attachment button[aria-label^="Remove image"]').click();

  await page.keyboard.press("Control+P");
  const sessionSearch = page.locator(".session-search-input input");
  await sessionSearch.waitFor();
  if (!(await sessionSearch.evaluate((input) => document.activeElement === input))) {
    throw new Error("Session search shortcut did not transfer focus to the search input");
  }
  if ((await page.locator(".sidebar-search input").count()) !== 0) {
    throw new Error("Search still renders as an inline sidebar field");
  }
  await sessionSearch.fill("phonak");
  await shot("12-session-search-overlay");
  await sessionSearch.fill("");
  const searchResultCount = await page.locator('.session-search-result[role="option"]').count();
  if (searchResultCount > 0) {
    const selectedBefore = await sessionSearch.getAttribute("aria-activedescendant");
    await sessionSearch.press("ArrowDown");
    const selectedAfter = await sessionSearch.getAttribute("aria-activedescendant");
    if (searchResultCount > 1 && selectedAfter === selectedBefore) {
      throw new Error("ArrowDown did not move the session search selection");
    }
    await sessionSearch.press("Enter");
  } else {
    await page.keyboard.press("Escape");
  }
  await page.locator(".session-search-dialog").waitFor({ state: "detached" });

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "approval-request",
      request: {
        id: "smoke-approval",
        toolName: "bash",
        message: "Allow Compass to run a shell command?",
        detail: "bash\\necho smoke",
        args: { command: "echo smoke" },
        ts: Date.now(),
      },
    });
  });
  await page.locator(".approval-request").waitFor();
  await page.waitForTimeout(650);
  if ((await page.locator(".approval-request-actions button").count()) !== 2) {
    throw new Error("Inline approval must expose Allow and Deny actions");
  }
  await shot("12b-inline-approval");
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "approval-resolved",
      id: "smoke-approval",
    });
  });
  await page.locator(".approval-request").waitFor({ state: "detached" });

  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    const tools = [
      { id: "smoke-bash", callId: "smoke-bash-call", name: "bash", args: { command: "npm run check" }, output: "hidden command output" },
      { id: "smoke-read", callId: "smoke-read-call", name: "read", args: { path: "C:/workspace/notes.md" }, output: "# Smoke read content\n\nLine two is visible." },
      { id: "smoke-write", callId: "smoke-write-call", name: "write", args: { path: "C:/workspace/result.md" }, output: "Wrote result.md" },
      { id: "smoke-edit", callId: "smoke-edit-call", name: "edit", args: { path: "C:/workspace/app.ts" }, output: "Edited app.ts" },
    ];
    for (const tool of tools) {
      contents?.send("agent:event", {
        kind: "tool-start",
        id: tool.id,
        callId: tool.callId,
        name: tool.name,
        args: tool.args,
        ts: Date.now(),
      });
      contents?.send("agent:event", {
        kind: "tool-end",
        callId: tool.callId,
        output: tool.output,
        isError: false,
      });
    }
  });

  const exploration = page.locator(
    '[data-tool-exploration="true"][data-tool-call-ids~="smoke-bash-call"]',
  );
  const explorationToggle = exploration.locator(":scope > .tool-exploration-toggle");
  await explorationToggle.waitFor();
  if ((await explorationToggle.getAttribute("aria-expanded")) !== "true") {
    await explorationToggle.click();
  }
  await exploration.locator(".tool-exploration-body").waitFor();
  const activityRows = exploration.locator(".tool-activity-row");
  const overflowAnchor = await page.locator(".thread-scroll").evaluate((element) =>
    getComputedStyle(element).overflowAnchor,
  );
  if (overflowAnchor !== "auto") {
    throw new Error(`Thread scroll anchoring is not enabled: ${overflowAnchor}`);
  }
  const threadScroll = page.locator(".thread-scroll");
  const maxThreadScroll = await threadScroll.evaluate((element) => element.scrollHeight - element.clientHeight);
  if (maxThreadScroll > 30) {
    await threadScroll.evaluate((element) => {
      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 31);
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const jumpToLatest = page.getByRole("button", { name: "Jump to latest message" });
    await jumpToLatest.waitFor();
    await jumpToLatest.click();
    await page.waitForFunction(() => {
      const element = document.querySelector(".thread-scroll");
      return element && element.scrollHeight - element.scrollTop - element.clientHeight <= 30;
    });
    await jumpToLatest.waitFor({ state: "detached" });
  }
  if ((await activityRows.count()) !== 4) {
    throw new Error("Read, Write, Edit and Bash did not render inside one exploration group");
  }
  const activityStyles = await activityRows.evaluateAll((rows) => rows.map((row) => {
    const style = getComputedStyle(row);
    return {
      display: style.display,
      fontSize: style.fontSize,
      gap: style.gap,
      left: row.getBoundingClientRect().left,
      padding: style.padding,
    };
  }));
  const sharedStyles = new Set(activityStyles.map(({ left: _left, ...style }) => JSON.stringify(style)));
  const activityLefts = activityStyles.map(({ left }) => left);
  if (sharedStyles.size !== 1 || activityLefts.some((left) => Math.abs(left - activityLefts[0]) > 1)) {
    throw new Error(`Tool activity rows do not share one visual hierarchy: ${JSON.stringify(activityStyles)}`);
  }
  if (!(await exploration.evaluate((element) => element.parentElement?.classList.contains("thread-inner") ?? false))) {
    throw new Error("The tool exploration group is nested below an unexpected thread layer");
  }
  for (const callId of ["smoke-bash-call", "smoke-read-call", "smoke-write-call", "smoke-edit-call"]) {
    if ((await exploration.locator(`[data-tool-call-id="${callId}"]`).count()) !== 1) {
      throw new Error(`Exploration group omitted ${callId}`);
    }
  }
  if ((await exploration.locator(".tool-activity-output").count()) !== 0) {
    throw new Error("Successful tool output is not compacted inside the exploration group");
  }
  await shot("12c-tool-exploration");

  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.send("agent:event", {
      kind: "user-message",
      id: "smoke-live-tools-turn",
      text: "Inspect a live tool group",
      ts: Date.now(),
    });
    contents?.send("agent:event", {
      kind: "tool-start",
      id: "smoke-live-read",
      callId: "smoke-live-read-call",
      name: "read",
      args: { path: "C:/workspace/live.md" },
      ts: Date.now(),
    });
  });
  const plainUserBubble = page.locator(".msg-user-bubble").filter({ hasText: "Inspect a live tool group" });
  await plainUserBubble.waitFor();
  if ((await plainUserBubble.count()) !== 1) {
    throw new Error("Plain user message did not render as one bubble");
  }
  if ((await plainUserBubble.locator(".msg-user-skill-arguments").count()) !== 0) {
    throw new Error("Plain user message inherited the Skill argument divider");
  }
  const plainBubbleHeight = await plainUserBubble.evaluate((element) => element.getBoundingClientRect().height);
  if (plainBubbleHeight > 48) {
    throw new Error(`Plain user message bubble is too tall: ${plainBubbleHeight}`);
  }
  const liveReadGroup = page.locator(
    '[data-tool-exploration="true"][data-tool-call-ids~="smoke-live-read-call"]',
  );
  const liveReadToggle = liveReadGroup.locator(":scope > .tool-exploration-toggle");
  await liveReadToggle.waitFor();
  if ((await liveReadToggle.getAttribute("aria-expanded")) !== "true") {
    throw new Error("A running tool exploration did not open automatically");
  }
  await liveReadGroup.locator('[data-tool-call-id="smoke-live-read-call"].running').waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "tool-end",
      callId: "smoke-live-read-call",
      output: "Live read complete",
      isError: false,
    });
  });
  await page.waitForFunction((callId) => {
    const group = document.querySelector(`[data-tool-call-ids~="${callId}"]`);
    return group?.querySelector(":scope > .tool-exploration-toggle")?.getAttribute("aria-expanded") === "false";
  }, "smoke-live-read-call");
  if ((await liveReadGroup.locator(".tool-activity-output").count()) !== 0) {
    throw new Error("Successful live tool output remained expanded after completion");
  }
  await liveReadToggle.click();
  await liveReadGroup.locator(".tool-exploration-body").waitFor();
  if ((await liveReadToggle.getAttribute("aria-expanded")) !== "true") {
    throw new Error("A completed tool exploration could not be expanded manually");
  }
  await liveReadToggle.click();
  if ((await liveReadToggle.getAttribute("aria-expanded")) !== "false") {
    throw new Error("A completed tool exploration could not be collapsed manually");
  }

  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.send("agent:event", { kind: "assistant-start", id: "smoke-reasoning", ts: Date.now() });
    contents?.send("agent:event", {
      kind: "assistant-delta",
      id: "smoke-reasoning",
      blockType: "thinking",
      contentIndex: 0,
      delta: "Reasoning remains readable while the answer begins.",
    });
  });
  const reasoningMessage = page.locator(".msg-assistant").filter({ hasText: "Reasoning remains readable" });
  await reasoningMessage.locator(".thinking-content-wrapper").waitFor();
  const liveThinkingState = await reasoningMessage.locator(".thinking-block-capsule").evaluate((block) => {
    const style = getComputedStyle(block);
    return {
      live: block.classList.contains("live"),
      label: block.querySelector(".thinking-title-cn")?.textContent?.trim(),
      liveDotCount: block.querySelectorAll(".thinking-live-dot").length,
      animationName: style.animationName,
    };
  });
  if (
    !liveThinkingState.live
    || liveThinkingState.label !== "Thinking"
    || liveThinkingState.liveDotCount !== 1
    || liveThinkingState.animationName !== "thinking-pulse"
  ) {
    throw new Error(`Live Thinking treatment is incomplete: ${JSON.stringify(liveThinkingState)}`);
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "assistant-end",
      id: "smoke-reasoning",
      blocks: [
        { type: "thinking", text: "Reasoning remains readable while the answer begins." },
        { type: "text", text: "The final answer is ready." },
      ],
      stopReason: "stop",
    });
  });
  await page.waitForTimeout(120);
  if ((await reasoningMessage.locator(".thinking-toggle-button").getAttribute("aria-expanded")) !== "true") {
    throw new Error("Reasoning collapsed when streaming ended");
  }
  if (await reasoningMessage.locator(".thinking-block-capsule.live").count()) {
    throw new Error("Thinking kept its live animation after streaming ended");
  }
  const assistantCopyButton = reasoningMessage.getByRole("button", { name: "Copy response" });
  if ((await assistantCopyButton.locator("span").count()) !== 0) {
    throw new Error("Assistant copy action must remain icon-only");
  }
  if ((await assistantCopyButton.evaluate((element) => getComputedStyle(element).alignSelf)) !== "flex-start") {
    throw new Error("Assistant copy action is not aligned to the left");
  }
  await reasoningMessage.hover();
  await page.waitForFunction((element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return style.pointerEvents === "auto" && Number.parseFloat(style.opacity) > 0.99;
  }, await assistantCopyButton.elementHandle());
  await assistantCopyButton.click();
  await reasoningMessage.locator(".assistant-copy-button.copied").waitFor();
  await shot("12d-reasoning-copy");

  const firstSession = page.locator(".thread-item-shell").first();
  if (await firstSession.count()) {
    const previousClientRegistry = await page.evaluate(() => localStorage.getItem("compass.clients.v1"));
    try {
      const smokeClientPrefix = `Smoke ${Date.now()}`;
      const newClientButton = page.getByRole("button", { name: "New client profile" });
      for (const suffix of ["Alpha", "Beta"]) {
        const clientName = `${smokeClientPrefix} ${suffix}`;
        await newClientButton.click();
        const newClientDialog = page.getByRole("dialog", { name: "New client profile" });
        await newClientDialog.getByLabel("Name").fill(clientName);
        await newClientDialog.getByLabel("Age").fill("48");
        await newClientDialog.getByLabel("Contact").fill("smoke@example.test");
        await newClientDialog.locator('input[name="client-hearing-aid-brand"][value="phonak"]').check({ force: true });
        await newClientDialog.getByRole("button", { name: "Create profile" }).click();
        await newClientDialog.waitFor({ state: "detached" });
        await page.waitForFunction(async (expectedName) => {
          const payload = await window.compass.init();
          return payload.clientRegistry.clients.includes(expectedName);
        }, clientName);
      }

      await firstSession.click({ button: "right" });
      const sessionActions = await page
        .locator(".sidebar-context-menu button")
        .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
      const expectedActions = ["Assign to client…", "Rename", "Archive", "Delete", "Copy Session ID"];
      if (JSON.stringify(sessionActions) !== JSON.stringify(expectedActions)) {
        throw new Error(`Session actions do not match: ${sessionActions.join(", ")}`);
      }
      const menuBounds = await page.locator(".sidebar-context-menu").evaluate((menu) => {
        const bounds = menu.getBoundingClientRect();
        return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: innerWidth, height: innerHeight };
      });
      if (menuBounds.left < 0 || menuBounds.top < 0 || menuBounds.right > menuBounds.width || menuBounds.bottom > menuBounds.height) {
        throw new Error(`Session menu escaped the viewport: ${JSON.stringify(menuBounds)}`);
      }
      await shot("13-session-menu");

      const threadHeightBeforeConfirmation = await firstSession.evaluate((row) => row.getBoundingClientRect().height);
      await page.getByRole("menuitem", { name: "Delete" }).click();
      const inlineConfirmation = firstSession.getByRole("alertdialog", { name: "Confirm delete conversation" });
      await inlineConfirmation.waitFor();
      const confirmationLayout = await inlineConfirmation.evaluate((overlay) => ({
        position: getComputedStyle(overlay).position,
        inset: getComputedStyle(overlay).inset,
        rowHeight: overlay.parentElement?.getBoundingClientRect().height,
        seconds: overlay.querySelector(".thread-confirmation-countdown text")?.textContent,
      }));
      if (
        confirmationLayout.position !== "absolute"
        || confirmationLayout.inset !== "0px"
        || confirmationLayout.rowHeight !== threadHeightBeforeConfirmation
        || confirmationLayout.seconds !== "5"
      ) {
        throw new Error(`Inline confirmation shifted the thread row: ${JSON.stringify(confirmationLayout)}`);
      }
      await page.waitForTimeout(1_100);
      if ((await inlineConfirmation.locator(".thread-confirmation-countdown text").textContent()) !== "4") {
        throw new Error("Inline confirmation countdown did not advance from 5 to 4");
      }
      await shot("13a-inline-confirmation");
      await inlineConfirmation.getByRole("button", { name: "Undo" }).click();
      await inlineConfirmation.waitFor({ state: "detached" });

      await firstSession.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Assign to client…" }).click();
      const clientDialog = page.getByRole("dialog", { name: "Assign client" });
      const clientInput = clientDialog.getByPlaceholder("Enter or search for a client name");
      await clientInput.fill(smokeClientPrefix);
      if ((await clientDialog.getByRole("option").count()) !== 2) {
        throw new Error("Client assignment filtering did not expose both keyboard candidates");
      }
      const clientBefore = await clientInput.getAttribute("aria-activedescendant");
      await clientInput.press("ArrowDown");
      const clientAfter = await clientInput.getAttribute("aria-activedescendant");
      if (!clientAfter || clientAfter === clientBefore) {
        throw new Error("ArrowDown did not move the client assignment selection");
      }
      await shot("13b-client-keyboard-selection");
      await clientInput.press("Enter");
      await clientDialog.waitFor({ state: "detached" });

      await firstSession.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await firstSession.getByRole("button", { name: "Confirm rename" }).waitFor();
      await firstSession.getByRole("button", { name: "Cancel rename" }).click();

      await firstSession.hover();
      const moreButton = firstSession.locator(".thread-more-button");
      if (!(await moreButton.isVisible())) {
        throw new Error("Session action menu has no visible hover entry point");
      }
      const moreButtonStyle = await moreButton.evaluate((button) => {
        const style = getComputedStyle(button);
        return { opacity: Number(style.opacity), pointerEvents: style.pointerEvents };
      });
      if (moreButtonStyle.opacity < 0.99 || moreButtonStyle.pointerEvents === "none") {
        throw new Error(`Session action entry is not interactable on hover: ${JSON.stringify(moreButtonStyle)}`);
      }
      await moreButton.click();
      await page.locator(".sidebar-context-menu").waitFor();
      if ((await page.locator(".sidebar-context-menu button").count()) !== expectedActions.length) {
        throw new Error("Ellipsis entry did not open the complete session menu");
      }
      await page.keyboard.press("Escape");

      const assignedClientName = `${smokeClientPrefix} Alpha`;
      if (await page.locator(".sidebar").evaluate((element) => element.classList.contains("collapsed"))) {
        await page.locator(".titlebar-sidebar-toggle").click();
      }
      const clientSectionToggle = page.locator(".file-section-header-main");
      if ((await clientSectionToggle.getAttribute("aria-expanded")) !== "true") {
        await clientSectionToggle.click();
      }
      const assignedClientGroup = page.locator(".file-tree-item").filter({ hasText: assignedClientName });
      await assignedClientGroup.scrollIntoViewIfNeeded();
      await assignedClientGroup.hover();
      await assignedClientGroup.locator(".file-action-btn").click();
      const composerText = await page.locator(".composer textarea").inputValue();
      if (composerText !== "") {
        throw new Error(`Client session leaked assignment text into composer: ${JSON.stringify(composerText)}`);
      }
      await page.waitForFunction(async (expectedName) => {
        const payload = await window.compass.init();
        return Boolean(
          payload.stats.sessionId
          && payload.clientRegistry.assignments[payload.stats.sessionId] === expectedName
        );
      }, assignedClientName);
      const assignedContext = await page.evaluate(() => window.compass.getDeveloperContext());
      if (
        assignedContext.clientName !== assignedClientName
        || !assignedContext.clientContext?.includes(`Name: ${assignedClientName}`)
        || !assignedContext.effectiveSystemPrompt.includes(`Name: ${assignedClientName}`)
      ) {
        throw new Error(`Assigned client was not injected into context: ${JSON.stringify(assignedContext)}`);
      }
    } finally {
      await page.evaluate((registry) => {
        if (registry === null) localStorage.removeItem("compass.clients.v1");
        else localStorage.setItem("compass.clients.v1", registry);
      }, previousClientRegistry);
    }
  }

  const sidebar = page.locator(".sidebar");
  const sidebarResizer = page.locator(".sidebar-resizer");
  if (await sidebar.evaluate((element) => element.classList.contains("collapsed"))) {
    await page.locator(".titlebar-sidebar-toggle").click();
  }
  const originalSidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  const resizeBox = await sidebarResizer.boundingBox();
  if (!resizeBox) throw new Error("Sidebar resize handle is not visible");
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 42, resizeBox.y + 120, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(220);
  const resizedSidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  if (resizedSidebarWidth < originalSidebarWidth + 36) {
    throw new Error(`Sidebar did not resize: ${originalSidebarWidth} -> ${resizedSidebarWidth}`);
  }
  const resizedBox = await sidebarResizer.boundingBox();
  if (!resizedBox) throw new Error("Sidebar resize handle disappeared after resize");
  await page.mouse.move(resizedBox.x + resizedBox.width / 2, resizedBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(
    resizedBox.x + resizedBox.width / 2 - (resizedSidebarWidth - originalSidebarWidth),
    resizedBox.y + 120,
    { steps: 4 },
  );
  await page.mouse.up();
  await page.waitForTimeout(220);
  const restoredSidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  if (Math.abs(restoredSidebarWidth - originalSidebarWidth) > 2) {
    throw new Error(`Sidebar width was not restored: ${restoredSidebarWidth}`);
  }

  await page.setViewportSize({ width: 600, height: 880 });
  await page.locator(".sidebar-toggle").click();
  await page.locator(".sidebar.mobile-open").waitFor();
  await shot("14-mobile-sidebar");

  console.log(`done, outDir=${outDir}`);
} finally {
  await app.close();
  rmSync(smokeUserDataDir, { recursive: true, force: true });
}
