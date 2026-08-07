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
  // The renderer removes the legacy key only after the database import
  // commits. Wait for that synchronous signal before starting another init
  // request, otherwise an init begun before the import can return a stale
  // (but internally consistent) pre-migration snapshot.
  await page.waitForFunction(
    (key) => localStorage.getItem(key) === null,
    "compass.clients.v1",
  );
  const migratedBrands = await page.evaluate(async (name) => {
    const payload = await window.compass.init();
    return Object.values(payload.clientRegistry.profiles)
      .find((profile) => profile.displayName === name)?.hearingAidBrands ?? [];
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
  await page.locator(".settings-profile-identity").waitFor();
  await page.locator(".settings-profile-photo-actions").waitFor();
  await page.locator("#profile-name-input").fill("Compass Smoke Tester");
  await page.locator("#profile-handle-input").fill("compass_smoke");
  await page.getByRole("heading", { name: "Profile" }).click();
  const storedIdentity = await page.evaluate(() => {
    const raw = window.localStorage.getItem("compass.profile.identity.v1");
    return raw ? JSON.parse(raw) : null;
  });
  if (storedIdentity?.name !== "Compass Smoke Tester" || storedIdentity?.handle !== "compass_smoke") {
    throw new Error(`Profile identity did not persist: ${JSON.stringify(storedIdentity)}`);
  }
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
  if ((await page.locator(".user-profile .user-name").textContent())?.trim() !== "Compass Smoke Tester") {
    throw new Error("The sidebar did not adopt the persisted profile name");
  }
  if ((await page.locator(".profile-menu-head small").textContent())?.trim() !== "@compass_smoke") {
    throw new Error("The profile menu did not adopt the persisted profile username");
  }
  await page.locator(".profile-menu button").filter({ hasText: "Skill library" }).click();
  await page.getByRole("heading", { name: "Skills", exact: true }).waitFor();
  await shot("03-skills-settings");
  const skillsSearch = page.getByRole("textbox", { name: "Search skills", exact: true });
  await skillsSearch.fill("phonak-target");
  if ((await page.locator(".settings-skill-row").count()) !== 1) {
    throw new Error("Skill search did not keep the matching Target skill");
  }
  await skillsSearch.fill("__no_matching_skill__");
  await page.locator(".settings-skills-empty").waitFor();
  await skillsSearch.fill("");
  await page.locator(".settings-skills-filters button").filter({ hasText: "Disabled skills" }).click();
  await page.locator(".settings-skills-empty").waitFor();
  await page.locator(".settings-skills-filters button").filter({ hasText: "All" }).click();
  await page.locator(".settings-skill-row").first().waitFor();
  await page.setViewportSize({ width: 600, height: 880 });
  await page.locator(".settings-skills-search input").waitFor();
  await page.locator(".settings-skills-filters").waitFor();
  await shot("03b-skills-settings-responsive");
  await page.setViewportSize({ width: 1320, height: 880 });
  await page.getByRole("complementary").getByRole("button", { name: "Back" }).click();

  await page.locator(".user-profile").click();
  await page.locator(".profile-menu button").filter({ hasText: "Settings" }).click();
  await page.getByRole("heading", { name: "General" }).waitFor();

  const languageTrigger = page.getByRole("button", { name: "Language", exact: true });
  await languageTrigger.focus();
  await languageTrigger.press("ArrowDown");
  const languageSearch = page.locator("#settings-language-listbox input");
  await languageSearch.waitFor();
  await languageSearch.press("ArrowDown");
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-settings-dropdown-option"));
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const trigger = document.querySelector('.settings-language-dropdown-btn');
    return document.activeElement === trigger && trigger?.getAttribute("aria-expanded") === "false";
  });

  const commandLanguageTrigger = page.getByRole("button", {
    name: "Command explanation language",
    exact: true,
  });
  const initialCommandLanguage = await page.evaluate(async () =>
    (await window.compass.init()).settings.commandExplanationLanguage,
  );
  if (initialCommandLanguage !== "auto") {
    throw new Error(`Command explanation language did not default to auto: ${initialCommandLanguage}`);
  }
  await commandLanguageTrigger.click();
  const commandLanguageDialog = page.getByRole("dialog", {
    name: "Command explanation language",
    exact: true,
  });
  await commandLanguageDialog.waitFor();
  await shot("03a-command-explanation-language");
  await commandLanguageDialog.getByRole("button", { name: "简体中文", exact: true }).click();
  await page.waitForFunction(async () =>
    (await window.compass.init()).settings.commandExplanationLanguage === "zh-CN",
  );
  await commandLanguageTrigger.click();
  await commandLanguageDialog.getByRole("button", {
    name: "Follow interface language",
    exact: true,
  }).click();
  await page.waitForFunction(async () =>
    (await window.compass.init()).settings.commandExplanationLanguage === "auto",
  );

  await page
    .getByRole("navigation", { name: "Settings navigation" })
    .getByRole("button", { name: "Dependencies", exact: true })
    .click();
  await page.getByRole("heading", { name: "Dependencies", exact: true }).waitFor();
  await page.locator(".settings-dependency-card").first().waitFor();
  if ((await page.locator(".settings-dependency-card").count()) !== 6) {
    throw new Error("Dependencies settings did not render the six allow-listed resources");
  }
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll(".settings-dependency-artwork img"));
    return images.length === 6 && images.every((image) => image.complete && image.naturalWidth > 0);
  });
  const dependencyArtworkLoaded = await page.locator(".settings-dependency-artwork img").evaluateAll(
    (images) => images.length === 6 && images.every((image) => image.complete && image.naturalWidth > 0),
  );
  if (!dependencyArtworkLoaded) {
    throw new Error("One or more dependency logos failed to load");
  }
  const dependencyPayload = await page.evaluate(() => window.compass.init());
  if (
    dependencyPayload.dependencies?.items.length !== 6
    || !dependencyPayload.dependencies.items.some((item) => item.id === "signia-connexx")
    || !dependencyPayload.dependencies.items.some((item) => item.id === "noahlink-wireless-driver")
  ) {
    throw new Error("Dependency detection payload is incomplete");
  }
  const signiaCard = page.locator(".settings-dependency-card").filter({ hasText: "Signia Connexx" });
  const signiaInstall = signiaCard.getByRole("button", { name: "Download & install", exact: true });
  if (await signiaInstall.isVisible()) {
    await signiaInstall.click();
    await signiaCard.getByText("Compass will download from the fixed source and then open the Windows installer.").waitFor();
    await signiaCard.getByRole("button", { name: "Cancel", exact: true }).click();
    await signiaCard.locator(".settings-dependency-confirm").waitFor({ state: "detached" });
  }
  await shot("03c-dependencies-settings");
  await page.setViewportSize({ width: 600, height: 880 });
  await page.locator(".settings-dependency-grid").first().waitFor();
  await shot("03d-dependencies-settings-responsive");
  await page.setViewportSize({ width: 1320, height: 880 });
  await page.locator(".settings-dependency-card").filter({ hasText: "Noahlink Wireless Driver" }).scrollIntoViewIfNeeded();
  await shot("03e-dependencies-driver");
  await page
    .getByRole("navigation", { name: "Settings navigation" })
    .getByRole("button", { name: "General", exact: true })
    .click();
  await page.getByRole("heading", { name: "General" }).waitFor();

  const settingsSearch = page.locator(".settings-search input");
  await settingsSearch.fill("color theme");
  await page.locator(".settings-search-result").filter({ hasText: "Color theme" }).click();
  const highlightedTheme = page.locator("#settings-theme.settings-search-target-highlight");
  await highlightedTheme.waitFor();
  if (!(await highlightedTheme.evaluate((target) => target.contains(document.activeElement)))) {
    throw new Error("Settings search did not focus the selected target");
  }
  await page
    .getByRole("navigation", { name: "Settings navigation" })
    .getByRole("button", { name: /General/ })
    .click();
  await page.getByRole("heading", { name: "General" }).waitFor();

  const smokeQuickPrompts = [
    "Smoke quick prompt one with enough text to exercise the fixed-width shortcut surface",
    "Smoke quick prompt two",
    "Smoke quick prompt three",
    "Smoke quick prompt four",
    "Smoke quick prompt five",
  ];
  const quickPromptEditor = page.locator(".settings-quick-prompts-editor");
  const quickPromptInputs = quickPromptEditor.locator(".settings-quick-prompt-row textarea");
  if ((await quickPromptInputs.count()) !== 3) {
    throw new Error("Quick prompt settings did not start with the three localized defaults");
  }
  for (let index = 0; index < 3; index += 1) {
    await quickPromptInputs.nth(index).fill(smokeQuickPrompts[index]);
  }
  const addQuickPrompt = quickPromptEditor.getByRole("button", { name: "Add quick prompt", exact: true });
  for (let index = 3; index < smokeQuickPrompts.length; index += 1) {
    await addQuickPrompt.click();
    await quickPromptInputs.nth(index).fill(smokeQuickPrompts[index]);
  }
  if (!(await addQuickPrompt.isDisabled()) || (await quickPromptInputs.count()) !== 5) {
    throw new Error("Quick prompt settings did not enforce the five-item maximum");
  }
  await quickPromptEditor.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(async (expected) => {
    const payload = await window.compass.init();
    return JSON.stringify(payload.settings.quickPrompts) === JSON.stringify(expected);
  }, smokeQuickPrompts);
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
  const quickPrompts = page.locator(".quick-prompts");
  const workspacePayload = await page.evaluate(() => window.compass.init());
  const workspaceHasUsableModel = Boolean(
    workspacePayload.stats.model && workspacePayload.stats.modelAuthConfigured,
  );
  if (workspaceHasUsableModel) {
    await quickPrompts.waitFor();
    if ((await quickPrompts.locator(".quick-prompt-btn").count()) !== 1) {
      throw new Error("The workspace must show exactly one quick prompt at a time");
    }
    const quickPromptText = quickPrompts.locator(".quick-prompt-text");
    if ((await quickPromptText.textContent()) !== smokeQuickPrompts[0]) {
      throw new Error("The first saved quick prompt did not appear in the workspace strip");
    }
    await quickPrompts.locator(".quick-prompt-btn").click();
    await page.waitForFunction((expected) => (
      document.querySelector(".composer textarea")?.value === expected
    ), smokeQuickPrompts[0]);
    await textarea.fill("");
    await quickPrompts.hover();
    await page.mouse.wheel(0, 80);
    await page.waitForFunction((expected) => (
      document.querySelector(".quick-prompt-text")?.textContent === expected
    ), smokeQuickPrompts[1]);
  } else {
    const modelNotice = page.locator(".workspace-model-notice");
    await modelNotice.waitFor();
    const expectedNotice = workspacePayload.stats.model
      ? "No credentials configured — configure"
      : "No model configured — configure";
    if ((await modelNotice.getByRole("button").textContent())?.trim() !== expectedNotice) {
      throw new Error("The workspace did not show the correct model configuration action");
    }
    if ((await quickPrompts.count()) !== 0) {
      throw new Error("Quick prompts must yield to the model configuration action when no model is usable");
    }
  }
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

  const modelButton = page.locator(".model-pill:not(.model-ring-trigger)");
  const collapsedModelButton = page.locator(".model-ring-trigger");
  if (await collapsedModelButton.count()) {
    await collapsedModelButton.click();
    await page.locator(".model-pill:not(.model-ring-trigger)").waitFor();
  }
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

  }
  if ((await page.locator('[data-model-menu-view="speed"]').count()) !== 0) {
    throw new Error("The removed fixed Speed row is still present in the model menu");
  }
  await shot("06-model-picker");
  await page.getByRole("button", { name: "Add Model" }).click();
  await page.getByRole("heading", { name: "Provider & Model" }).waitFor();
  const settingsSectionOrder = await page
    .locator(".settings-models-card-row-copy > strong")
    .allTextContents();
  if (
    JSON.stringify(settingsSectionOrder) !==
    JSON.stringify(["Providers & API Keys", "Enabled models", "Active model", "Conversation title model"])
  ) {
    throw new Error(`Provider & Model sections are out of order: ${settingsSectionOrder.join(", ")}`);
  }
  const summaryModelButton = page.getByRole("button", { name: "Conversation title model" });
  const expectedSummaryModel = initPayload.models.find(
    (model) => model.provider === initPayload.settings.summaryModel.provider
      && model.id === initPayload.settings.summaryModel.id,
  )?.name ?? initPayload.settings.summaryModel.id;
  if ((await summaryModelButton.textContent())?.trim() !== expectedSummaryModel) {
    throw new Error("Conversation title summary model does not match persisted settings");
  }
  const providerSection = page.locator("#settings-providers");
  const providerToggle = page.locator(".settings-models-card-row-accordion-toggle");
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
    const apiKeyTrigger = providerRow.getByRole("button", { name: apiKeyProvider.configured ? "Replace key" : "Set key" });
    await apiKeyTrigger.click();
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
    const apiKeyTriggerHandle = await apiKeyTrigger.elementHandle();
    if (!apiKeyTriggerHandle) throw new Error("Provider API key trigger disappeared after closing the editor");
    await page.waitForFunction((button) => document.activeElement === button, apiKeyTriggerHandle);
  }
  await shot("07a-provider-icons");
  await providerToggle.click();
  const enabledModelsButton = page.getByRole("button", { name: "Enabled models" });
  if (initPayload.models.length > 0) {
    await enabledModelsButton.focus();
    await enabledModelsButton.press("ArrowDown");
    const enabledModelsSearch = page.getByRole("textbox", { name: "Search Enabled models" });
    await enabledModelsSearch.waitFor();
    const enabledModelOptions = page.getByRole("listbox", { name: "Enabled models" }).getByRole("option");
    if ((await enabledModelOptions.count()) !== initPayload.models.length) {
      throw new Error("Enabled models dropdown did not render the complete model registry");
    }
    if ((await enabledModelOptions.evaluateAll((options) => options.some((option) => option.tabIndex !== -1)))) {
      throw new Error("Enabled model options introduced one Tab stop per model");
    }
    const enabledModelKeys = new Set(initPayload.settings.enabledModels);
    const activeModelKey = initPayload.stats.model
      ? `${initPayload.stats.model.provider}::${initPayload.stats.model.id}`
      : undefined;
    const modelToggleProbe = initPayload.models.find((model) =>
      !enabledModelKeys.has(`${model.provider}::${model.id}`),
    ) ?? (enabledModelKeys.size > 1
      ? initPayload.models.find((model) => {
          const key = `${model.provider}::${model.id}`;
          return key !== activeModelKey && enabledModelKeys.has(key);
        })
      : undefined);
    if (modelToggleProbe) {
      const probeKey = `${modelToggleProbe.provider}::${modelToggleProbe.id}`;
      const probeWasEnabled = enabledModelKeys.has(probeKey);
      const probeGroup = page.locator(".settings-summary-model-dropdown-group").filter({
        hasText: modelToggleProbe.providerName,
      });
      const probeOption = probeGroup.getByRole("option").filter({
        hasText: modelToggleProbe.name,
      });
      if ((await probeOption.count()) !== 1) {
        throw new Error(`Could not uniquely identify enabled-model probe ${probeKey}`);
      }
      const toggleStartedAt = performance.now();
      await probeOption.click();
      const toggleClickMs = performance.now() - toggleStartedAt;
      const immediateSelection = await probeOption.getAttribute("aria-selected");
      if (immediateSelection !== String(!probeWasEnabled)) {
        throw new Error(
          `Enabled-model selection did not update immediately: ${probeKey}, click=${toggleClickMs.toFixed(1)}ms`,
        );
      }
      console.log("ENABLED_MODEL_SELECTION", JSON.stringify({ probeKey, toggleClickMs }));
    }
    await enabledModelsSearch.press("ArrowDown");
    await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "option");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => {
      const trigger = document.querySelector('[aria-controls="settings-enabled-models-listbox"]');
      return document.activeElement === trigger && trigger?.getAttribute("aria-expanded") === "false";
    });
  }
  await shot("07-models-settings");
  await page.setViewportSize({ width: 600, height: 880 });
  const responsiveLabels = [
    page.locator(".settings-back span"),
    page.locator(".settings-search input"),
    page.locator(".settings-nav nav button span").first(),
  ];
  for (const label of responsiveLabels) {
    if (!(await label.isVisible())) throw new Error("Responsive settings hid a required text label");
  }
  await shot("07b-responsive-settings");
  await page.setViewportSize({ width: 1320, height: 880 });
  await page.getByRole("complementary").getByRole("button", { name: "Back" }).click();

  await page.locator(".context-trigger").click();
  const contextRingWidth = await page.locator(".context-trigger circle").first().evaluate((circle) =>
    Number.parseFloat(getComputedStyle(circle).strokeWidth),
  );
  if (Math.abs(contextRingWidth - 3) > 0.05) {
    throw new Error(`Context ring must be 3px: ${contextRingWidth}px`);
  }
  await page.getByRole("region", { name: "Context usage" }).waitFor();
  await page.locator(".context-usage-list").waitFor();
  await page.locator(".context-usage-visual").waitFor();
  const workspaceContextStrip = page.locator(".workspace-context-surface .workspace-context-strip");
  const expectedWorkspaceAccessory = workspaceHasUsableModel
    ? workspaceContextStrip.locator(".quick-prompts")
    : workspaceContextStrip.locator(".workspace-model-notice");
  if (
    (await workspaceContextStrip.count()) !== 1
    || (await workspaceContextStrip.locator(".workspace-client-name").count()) !== 1
    || (await expectedWorkspaceAccessory.count()) !== 1
  ) {
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
  let openedSearchResult = false;
  let openedSearchResultTitle = "";
  if (searchResultCount > 0) {
    const selectedBefore = await sessionSearch.getAttribute("aria-activedescendant");
    await sessionSearch.press("ArrowDown");
    const selectedAfter = await sessionSearch.getAttribute("aria-activedescendant");
    if (searchResultCount > 1 && selectedAfter === selectedBefore) {
      throw new Error("ArrowDown did not move the session search selection");
    }
    openedSearchResultTitle = (await page.locator(".session-search-result.selected strong").textContent())?.trim() ?? "";
    await sessionSearch.press("Enter");
    openedSearchResult = true;
  } else {
    await page.keyboard.press("Escape");
  }
  await page.locator(".session-search-dialog").waitFor({ state: "detached" });
  if (openedSearchResult) {
    if (openedSearchResultTitle) {
      await page.waitForFunction((title) => Array.from(
        document.querySelectorAll(".thread-file-item.active .file-name"),
      ).some((node) => node.textContent?.trim() === title), openedSearchResultTitle);
    }
    await page.getByRole("button", { name: "Hearing health", exact: true }).click();
    const hearingHealthWorkspace = page.getByRole("region", { name: "Hearing health", exact: true });
    await hearingHealthWorkspace.waitFor();
    await page.keyboard.press("Control+P");
    const activeSessionSearch = page.locator(".session-search-input input");
    await activeSessionSearch.waitFor();
    await page.waitForFunction(() => Boolean(
      document.querySelector(".session-search-input input")?.getAttribute("aria-activedescendant"),
    ));
    await activeSessionSearch.press("Enter");
    await page.locator(".session-search-dialog").waitFor({ state: "detached" });
    await hearingHealthWorkspace.waitFor({ state: "detached" });
    await page.locator(".composer").waitFor();
  }

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "approval-request",
      request: {
        id: "smoke-approval",
        toolName: "bash",
        message: "Allow Compass to run a shell command?",
        detail: "bash\\necho smoke",
        args: { command: "echo smoke" },
        explanationPending: true,
        ts: Date.now(),
      },
    });
  });
  await page.locator(".approval-request").waitFor();
  const pendingApprovalOrb = page.locator(
    ".approval-request-explanation.pending canvas.agent-activity-orb-canvas[data-agent-activity-state='solving']",
  );
  if ((await pendingApprovalOrb.count()) !== 1) {
    throw new Error("Pending approval explanation must use the Thinking Orb");
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "approval-explanation",
      id: "smoke-approval",
      explanation: "Runs a harmless smoke-test command and prints its result.",
    });
  });
  await page.getByText("Runs a harmless smoke-test command and prints its result.", { exact: true }).waitFor();
  if ((await page.locator(".approval-request-explanation canvas.agent-activity-orb-canvas").count()) !== 0) {
    throw new Error("Approval explanation Orb must disappear when the explanation is ready");
  }
  await page.waitForTimeout(650);
  const approvalActionCount = await page.locator(".approval-request-actions button").count();
  if (approvalActionCount !== 2) {
    throw new Error(`Inline approval must expose Allow and Deny actions; found ${approvalActionCount}`);
  }
  const approvalCommandStyle = await page.locator(".approval-request-command").evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, borderTopStyle: style.borderTopStyle };
  });
  if (approvalCommandStyle.borderTopStyle !== "none" || approvalCommandStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Approval command must render without a nested frame: ${JSON.stringify(approvalCommandStyle)}`);
  }
  const approvalExplanationBorder = await page.locator(".approval-request-explanation").evaluate(
    (element) => getComputedStyle(element).borderTopStyle,
  );
  if (approvalExplanationBorder !== "dashed") {
    throw new Error(`Approval explanation divider is not dashed: ${approvalExplanationBorder}`);
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
    contents?.send("agent:event", { kind: "agent-start" });
    contents?.send("agent:event", {
      kind: "user-message",
      id: "smoke-tool-exploration-turn",
      text: "Inspect completed tool grouping",
      ts: Date.now(),
    });
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
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", { kind: "agent-end" });
  });
  await exploration.waitFor({ state: "detached" });

  const activityCanvasSelector = "canvas.agent-activity-orb-canvas[data-agent-activity-state]";
  const assertActivityOrb = async (state, scope, statusText) => {
    await page.waitForFunction(({ selector, expectedState }) => {
      const canvases = Array.from(document.querySelectorAll(selector));
      return canvases.length === 1 && canvases[0]?.getAttribute("data-agent-activity-state") === expectedState;
    }, { selector: activityCanvasSelector, expectedState: state });
    const canvases = page.locator(activityCanvasSelector);
    const count = await canvases.count();
    if (count !== 1) {
      throw new Error("Expected exactly one activity Orb, found " + count);
    }
    const canvas = canvases.first();
    const details = await canvas.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const slotBounds = element.parentElement?.getBoundingClientRect();
      return {
        state: element.getAttribute("data-agent-activity-state"),
        width: bounds.width,
        height: bounds.height,
        slotHeight: slotBounds?.height,
        role: element.getAttribute("role"),
        ariaHidden: element.getAttribute("aria-hidden"),
        ariaLabel: element.getAttribute("aria-label"),
        animationName: getComputedStyle(element).animationName,
      };
    });
    if (
      details.state !== state
      || Math.abs(details.width - 20) > 0.1
      || Math.abs(details.height - 20) > 0.1
      || typeof details.slotHeight !== "number"
      || details.slotHeight >= 20
      || details.role !== "presentation"
      || details.ariaHidden !== "true"
      || details.ariaLabel
      || details.animationName !== "none"
    ) {
      throw new Error("Activity Orb contract mismatch: " + JSON.stringify(details));
    }
    if (scope && (await scope.locator(activityCanvasSelector).count()) !== 1) {
      throw new Error("Activity Orb mounted outside its active content");
    }

    const status = page.locator('[role="status"][data-agent-activity-orb]');
    if (statusText) {
      if ((await status.count()) !== 1 || !(await status.textContent())?.includes(statusText)) {
        throw new Error("Localized activity status is missing: " + statusText);
      }
    } else {
      if ((await status.count()) !== 0 || (await canvas.locator("..").getAttribute("aria-hidden")) !== "true") {
        throw new Error("Decorative activity Orb leaked into the accessibility tree");
      }
    }
  };
  const assertNoActivityOrb = async () => {
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 0, activityCanvasSelector);
  };
  const setActivityTheme = async (preference) => {
    await page.evaluate((next) => {
      localStorage.setItem("compass.theme.v1", next);
      window.dispatchEvent(new Event("compass:theme-change"));
    }, preference);
    if (preference === "light" || preference === "dark") {
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, preference);
    }
  };

  await setActivityTheme("light");

  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.send("agent:event", { kind: "agent-start" });
    contents?.send("agent:event", {
      kind: "user-message",
      id: "smoke-live-tools-turn",
      text: "Inspect a live tool group",
      ts: Date.now(),
    });
    contents?.send("agent:event", { kind: "assistant-start", id: "smoke-reasoning", ts: Date.now() });
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
  const reasoningMessage = page.locator('[data-assistant-message-id="smoke-reasoning"]');
  await reasoningMessage.waitFor();
  await assertActivityOrb("working", reasoningMessage, "Agent is working");

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "assistant-delta",
      id: "smoke-reasoning",
      blockType: "thinking",
      contentIndex: 0,
      delta: "Reasoning remains readable after the tool runs.",
    });
  });
  await reasoningMessage.locator(".thinking-content-wrapper").waitFor();
  await assertActivityOrb("solving", reasoningMessage.locator(".thinking-toggle-button"));
  const liveThinkingState = await reasoningMessage.locator(".thinking-block-capsule").evaluate((block) => ({
    live: block.classList.contains("live"),
    label: block.querySelector(".thinking-title-cn")?.textContent?.trim(),
    expanded: block.querySelector(".thinking-toggle-button")?.getAttribute("aria-expanded"),
    animationName: getComputedStyle(block).animationName,
  }));
  if (
    !liveThinkingState.live
    || liveThinkingState.label !== "Thinking"
    || liveThinkingState.expanded !== "true"
    || liveThinkingState.animationName !== "none"
  ) {
    throw new Error("Live Thinking treatment is incomplete: " + JSON.stringify(liveThinkingState));
  }
  await page.waitForTimeout(650);
  await shot("12d-activity-solving-light");
  await setActivityTheme("dark");
  await assertActivityOrb("solving", reasoningMessage.locator(".thinking-toggle-button"));
  await page.waitForTimeout(120);
  await shot("12e-activity-solving-dark");
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (!await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    throw new Error("Electron did not apply the reduced-motion media preference");
  }
  await assertActivityOrb("solving", reasoningMessage.locator(".thinking-toggle-button"));
  await page.waitForTimeout(120);
  await shot("12f-activity-solving-reduced-motion-dark");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setActivityTheme("light");

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "assistant-end",
      id: "smoke-reasoning",
      blocks: [{ type: "thinking", text: "Reasoning remains readable after the tool runs." }],
      stopReason: "toolUse",
    });
  });
  await assertNoActivityOrb();
  if ((await reasoningMessage.locator(".thinking-toggle-button").getAttribute("aria-expanded")) !== "true") {
    throw new Error("Reasoning collapsed when its streaming phase ended");
  }
  if (await reasoningMessage.locator(".thinking-block-capsule.live").count()) {
    throw new Error("Thinking remained live after assistant-end");
  }

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "tool-start",
      id: "smoke-live-read",
      callId: "smoke-live-read-call",
      name: "read",
      args: { path: "C:/workspace/live.md" },
      ts: Date.now(),
    });
  });
  const liveReadGroup = page.locator(
    '[data-tool-exploration="true"][data-tool-call-ids~="smoke-live-read-call"]',
  );
  const liveReadToggle = liveReadGroup.locator(":scope > .tool-exploration-toggle");
  await liveReadToggle.waitFor();
  if ((await liveReadToggle.getAttribute("aria-expanded")) !== "true") {
    throw new Error("A running tool exploration did not open automatically");
  }
  await liveReadGroup.locator('[data-tool-call-id="smoke-live-read-call"].running').waitFor();
  await assertActivityOrb("searching", liveReadToggle);
  await shot("12g-activity-searching-tool");
  await page.setViewportSize({ width: 560, height: 780 });
  await assertActivityOrb("searching", liveReadToggle);
  const narrowToolPlacement = await liveReadToggle.evaluate((toggle) => {
    const orb = toggle.querySelector("canvas.agent-activity-orb-canvas")?.getBoundingClientRect();
    const chevron = toggle.querySelector(".tool-exploration-chevron")?.getBoundingClientRect();
    if (!orb || !chevron) return undefined;
    return {
      orbLeft: orb.left,
      orbRight: orb.right,
      viewport: window.innerWidth,
      overlapsChevron: orb.left < chevron.right
        && orb.right > chevron.left
        && orb.top < chevron.bottom
        && orb.bottom > chevron.top,
    };
  });
  if (
    !narrowToolPlacement
    || narrowToolPlacement.orbLeft < 0
    || narrowToolPlacement.orbRight > narrowToolPlacement.viewport
    || narrowToolPlacement.overlapsChevron
  ) {
    throw new Error("Narrow tool Orb placement overflowed: " + JSON.stringify(narrowToolPlacement));
  }
  await shot("12g2-activity-searching-tool-narrow");
  await page.setViewportSize({ width: 1320, height: 880 });
  await assertActivityOrb("searching", liveReadToggle);
  if ((await liveReadGroup.locator(".tool-activity-row canvas").count()) !== 0) {
    throw new Error("A running tool duplicated its Orb inside an activity row");
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "tool-end",
      callId: "smoke-live-read-call",
      output: "Live read complete",
      isError: false,
    });
  });
  await assertNoActivityOrb();
  await page.waitForFunction((callId) => {
    const group = document.querySelector(`[data-tool-call-ids~="${callId}"]`);
    const toggle = group?.querySelector(":scope > .tool-exploration-toggle");
    return !group?.classList.contains("running") && toggle?.getAttribute("aria-expanded") === "true";
  }, "smoke-live-read-call");
  if ((await liveReadGroup.locator(".tool-activity-output").count()) !== 0) {
    throw new Error("Successful live tool output remained expanded after completion");
  }
  await liveReadToggle.click();
  await liveReadGroup.locator(".tool-exploration-body").waitFor({ state: "hidden" });
  if ((await liveReadToggle.getAttribute("aria-expanded")) !== "false") {
    throw new Error("A completed tool exploration could not be collapsed manually");
  }
  await liveReadToggle.click();
  await liveReadGroup.locator(".tool-exploration-body").waitFor();
  if ((await liveReadToggle.getAttribute("aria-expanded")) !== "true") {
    throw new Error("A completed tool exploration could not be expanded manually");
  }

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "tool-start",
      id: "smoke-owner-switch-tool",
      callId: "smoke-owner-switch-tool-call",
      name: "custom_dynamic_tool",
      args: { task: "verify one activity owner" },
      ts: Date.now(),
    });
  });
  const ownerSwitchTool = page.locator('[data-tool-call-id="smoke-owner-switch-tool-call"]');
  await ownerSwitchTool.waitFor();
  await assertActivityOrb("working", ownerSwitchTool);
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.send("agent:event", {
      kind: "tool-end",
      callId: "smoke-owner-switch-tool-call",
      output: "Owner switch complete",
      isError: false,
    });
    contents?.send("agent:event", {
      kind: "assistant-start",
      id: "smoke-owner-switch-answer",
      ts: Date.now(),
    });
  });
  const ownerSwitchAnswer = page.locator('[data-assistant-message-id="smoke-owner-switch-answer"]');
  await ownerSwitchAnswer.locator(activityCanvasSelector).waitFor();
  const ownerSwitchOrbCount = await page.locator(activityCanvasSelector).count();
  if (ownerSwitchOrbCount !== 1) {
    const owners = await page.locator(activityCanvasSelector).evaluateAll((canvases) => canvases.map((canvas) => ({
      state: canvas.getAttribute("data-agent-activity-state"),
      messageId: canvas.closest("[data-assistant-message-id]")?.getAttribute("data-assistant-message-id"),
      toolCallId: canvas.closest("[data-tool-call-id]")?.getAttribute("data-tool-call-id"),
      approvalId: canvas.closest("[data-approval-id]")?.getAttribute("data-approval-id"),
    })));
    throw new Error(`Activity owner switch briefly mounted ${ownerSwitchOrbCount} Orbs: ${JSON.stringify(owners)}`);
  }
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "assistant-end",
      id: "smoke-owner-switch-answer",
      blocks: [],
      stopReason: "stop",
    });
  });
  await assertNoActivityOrb();

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "assistant-start",
      id: "smoke-final-answer",
      ts: Date.now(),
    });
  });
  const finalMessage = page.locator('[data-assistant-message-id="smoke-final-answer"]');
  await finalMessage.waitFor();
  await assertActivityOrb("working", finalMessage, "Agent is working");

  const incompleteBoldDelta = "The final answer is **ready";
  const incompleteFenceDelta = [
    "**. Compass renders the latest received text without a fixed-rate queue.",
    "",
    "- The first streamed list item remains readable.",
    "- The second streamed list item keeps its structure.",
    "",
    "```ts",
    'const phase = "live";',
  ].join("\n");
  const completedTail = [
    "",
    "console.log(phase);",
    "```",
    "",
    "| Mode | Result |",
    "| --- | --- |",
    "| streaming | ready |",
    "",
    "[Streamdown reference](https://streamdown.ai)",
    "",
    "<button data-smoke-raw-html>Raw HTML stays text</button>",
    "",
    "The completed reasoning remains readable above the tool exploration, and the tool details can still be collapsed or expanded independently.",
    "",
    "This longer paragraph verifies that the composing Orb remains aligned while wrapped text grows naturally in a narrow message column. Burst complete.",
  ].join("\n");
  const highFrequencyDeltas = completedTail.match(/[\s\S]{1,9}/g) ?? [completedTail];
  const longSmokeAnswer = incompleteBoldDelta + incompleteFenceDelta + highFrequencyDeltas.join("");

  await app.evaluate(({ BrowserWindow }, answer) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "assistant-delta",
      id: "smoke-final-answer",
      blockType: "text",
      contentIndex: 0,
      delta: answer,
    });
  }, incompleteBoldDelta);
  await page.waitForFunction(() => (
    document.querySelector('[data-assistant-message-id="smoke-final-answer"] .md')?.textContent?.includes("The final answer is ready")
  ));
  await finalMessage.locator("[data-sd-animate]").first().waitFor();
  await assertActivityOrb("composing", finalMessage, "Agent is composing a response");
  if (await page.locator(".thinking-content-text [data-sd-animate], .tool-exploration-body [data-sd-animate]").count()) {
    throw new Error("Thinking or tool Markdown received streaming word animation");
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => (
    document.querySelectorAll('[data-assistant-message-id="smoke-final-answer"] [data-sd-animate]').length === 0
  ), undefined, { timeout: 2_000 });
  await app.evaluate(({ BrowserWindow }, answer) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "assistant-delta",
      id: "smoke-final-answer",
      blockType: "text",
      contentIndex: 0,
      delta: answer,
    });
  }, incompleteFenceDelta);
  await finalMessage.locator(".md-code-block").waitFor();
  if ((await finalMessage.locator(".md-code-lang").textContent())?.trim() !== "ts") {
    throw new Error("Reduced-motion streaming syntax repair lost an incomplete code fence language tag");
  }
  if (await finalMessage.locator("[data-sd-animate]").count()) {
    throw new Error("Reduced motion enabled streaming word animation");
  }
  const reducedMotionText = await finalMessage.locator(".md").textContent();
  const reducedMotionVisible = await finalMessage.locator(".md").evaluate((element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
  });
  if (!reducedMotionVisible
    || !reducedMotionText?.includes("The final answer is")
    || !reducedMotionText.includes("ready")) {
    throw new Error("Reduced motion hid active Markdown text");
  }
  await assertActivityOrb("composing", finalMessage, "Agent is composing a response");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await finalMessage.locator(".md").evaluate((root) => {
    const state = { mutationBatches: 0, mutationRecords: 0, startedAt: performance.now() };
    const observer = new MutationObserver((records) => {
      state.mutationBatches += 1;
      state.mutationRecords += records.length;
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    window.__compassStreamdownSmoke = { observer, state };
  });
  await app.evaluate(({ BrowserWindow }, deltas) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    for (const delta of deltas) {
      contents?.send("agent:event", {
        kind: "assistant-delta",
        id: "smoke-final-answer",
        blockType: "text",
        contentIndex: 0,
        delta,
      });
    }
  }, highFrequencyDeltas);
  await page.waitForFunction(() => (
    document.querySelector('[data-assistant-message-id="smoke-final-answer"] .md')?.textContent?.includes("Burst complete.")
  ), undefined, { timeout: 2_000 });
  const streamdownDomMetrics = await page.evaluate(() => {
    const diagnostics = window.__compassStreamdownSmoke;
    diagnostics?.observer.disconnect();
    return diagnostics ? {
      ...diagnostics.state,
      stableMs: performance.now() - diagnostics.state.startedAt,
    } : undefined;
  });
  if (!streamdownDomMetrics || streamdownDomMetrics.mutationBatches >= highFrequencyDeltas.length) {
    throw new Error("High-frequency Markdown updates were not batched: " + JSON.stringify(streamdownDomMetrics));
  }
  console.log("STREAMDOWN_DOM_BURST", JSON.stringify({
    inputDeltaEvents: highFrequencyDeltas.length,
    ...streamdownDomMetrics,
  }));
  await finalMessage.locator("[data-sd-animate]").first().waitFor();
  await assertActivityOrb("composing", finalMessage, "Agent is composing a response");
  await shot("12h-activity-composing-long-reply");
  await page.setViewportSize({ width: 560, height: 780 });
  await assertActivityOrb("composing", finalMessage, "Agent is composing a response");
  const narrowMarkdown = await finalMessage.evaluate((message) => ({
    clientWidth: message.clientWidth,
    scrollWidth: message.scrollWidth,
    threadClientWidth: document.querySelector(".thread-scroll")?.clientWidth,
    threadScrollWidth: document.querySelector(".thread-scroll")?.scrollWidth,
  }));
  if (
    narrowMarkdown.scrollWidth > narrowMarkdown.clientWidth + 1
    || typeof narrowMarkdown.threadClientWidth !== "number"
    || typeof narrowMarkdown.threadScrollWidth !== "number"
    || narrowMarkdown.threadScrollWidth > narrowMarkdown.threadClientWidth + 1
  ) {
    throw new Error("Narrow streamed Markdown overflowed horizontally: " + JSON.stringify(narrowMarkdown));
  }
  await shot("12i-activity-composing-long-reply-narrow");
  await page.setViewportSize({ width: 1320, height: 880 });
  await assertActivityOrb("composing", finalMessage, "Agent is composing a response");

  await page.evaluate(() => {
    window.__compassAssistantEndStartedAt = performance.now();
  });
  await app.evaluate(({ BrowserWindow }, answer) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.send("agent:event", {
      kind: "assistant-end",
      id: "smoke-final-answer",
      blocks: [{ type: "text", text: answer }],
      stopReason: "stop",
    });
    contents?.send("agent:event", { kind: "agent-end" });
  }, longSmokeAnswer);
  await assertNoActivityOrb();
  await page.waitForFunction(() => (
    document.querySelectorAll('[data-assistant-message-id="smoke-final-answer"] [data-sd-animate]').length === 0
  ), undefined, { timeout: 2_000 });
  const assistantEndStableMs = await page.evaluate(() => (
    performance.now() - window.__compassAssistantEndStartedAt
  ));
  console.log("STREAMDOWN_ASSISTANT_END", JSON.stringify({ assistantEndStableMs }));
  if (await finalMessage.locator('[data-streamdown="code-block-actions"]').count()) {
    throw new Error("Streamdown rendered a second set of code controls");
  }
  if ((await finalMessage.locator(".md-copy-button-icon").count()) !== 1) {
    throw new Error("Compass code copy control was not preserved exactly once");
  }
  if ((await finalMessage.locator("table").count()) !== 1) {
    throw new Error("Markdown table rendering was not preserved");
  }
  const smokeLink = finalMessage.getByRole("link", { name: "Streamdown reference" });
  const smokeLinkState = {
    href: await smokeLink.getAttribute("href"),
    rel: await smokeLink.getAttribute("rel"),
    target: await smokeLink.getAttribute("target"),
  };
  if (!smokeLinkState.href
    || new URL(smokeLinkState.href).href !== "https://streamdown.ai/"
    || smokeLinkState.target !== "_blank"
    || !smokeLinkState.rel?.split(/\s+/).includes("noreferrer")) {
    throw new Error("Markdown link behavior changed: " + JSON.stringify(smokeLinkState));
  }
  if (await finalMessage.locator("button[data-smoke-raw-html]").count()
    || !(await finalMessage.locator(".md").textContent())?.includes("Raw HTML stays text")) {
    throw new Error("Raw HTML execution semantics expanded");
  }
  const caretState = await finalMessage.locator(".md").evaluate((root) => ({
    caretVariable: getComputedStyle(root).getPropertyValue("--streamdown-caret").trim(),
    legacyCaret: Boolean(root.querySelector(".stream-caret")),
  }));
  if (caretState.caretVariable || caretState.legacyCaret) {
    throw new Error("A stream caret was reintroduced: " + JSON.stringify(caretState));
  }
  await setActivityTheme(previousTheme);
  await reasoningMessage.waitFor({ state: "detached" });
  const completedSummary = page.locator(".execution-summary-container").last();
  const completedSummaryToggle = completedSummary.locator(":scope > .execution-summary-bar");
  await completedSummaryToggle.waitFor();
  if ((await completedSummaryToggle.getAttribute("aria-expanded")) !== "true") {
    await completedSummaryToggle.click();
  }
  const completedThinkingToggle = completedSummary.locator(".thinking-toggle-button").first();
  await completedThinkingToggle.waitFor();
  if ((await completedThinkingToggle.getAttribute("aria-expanded")) !== "true") {
    await completedThinkingToggle.click();
  }
  const completedThinking = completedSummary.locator(".thinking-content-text").first();
  await completedThinking.waitFor();
  if (!(await completedThinking.textContent())?.includes("Reasoning remains readable")) {
    throw new Error("Completed Thinking content is no longer readable");
  }
  const codeCopyButton = finalMessage.getByRole("button", { name: "Copy code" });
  await codeCopyButton.click();
  await finalMessage.locator(".md-copy-button-icon.copied").waitFor();
  const copiedCode = await app.evaluate(({ clipboard }) => clipboard.readText());
  if (copiedCode.replaceAll("\r\n", "\n") !== 'const phase = "live";\nconsole.log(phase);') {
    throw new Error("Code copy content changed: " + JSON.stringify(copiedCode));
  }
  const assistantCopyButton = finalMessage.getByRole("button", { name: "Copy response" });
  if ((await assistantCopyButton.locator("span").count()) !== 0) {
    throw new Error("Assistant copy action must remain icon-only");
  }
  if ((await assistantCopyButton.evaluate((element) => getComputedStyle(element).alignSelf)) !== "flex-start") {
    throw new Error("Assistant copy action is not aligned to the left");
  }
  await finalMessage.hover();
  await page.waitForFunction((element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return style.pointerEvents === "auto" && Number.parseFloat(style.opacity) > 0.99;
  }, await assistantCopyButton.elementHandle());
  await assistantCopyButton.click();
  await finalMessage.locator(".assistant-copy-button.copied").waitFor();
  const copiedReply = await app.evaluate(({ clipboard }) => clipboard.readText());
  if (copiedReply.replaceAll("\r\n", "\n") !== longSmokeAnswer) {
    throw new Error("Reply copy no longer uses canonical Markdown text");
  }
  await shot("12d-reasoning-copy");

  const backendPayload = await page.evaluate(() => window.compass.init());
  const historyPayload = {
    ...backendPayload,
    approvals: [],
    stats: {
      ...backendPayload.stats,
      sessionId: "smoke-streamdown-history",
      sessionName: "Streamdown history",
      sessionPath: undefined,
      isStreaming: false,
    },
    thread: [{
      kind: "assistant",
      id: "smoke-final-answer",
      blocks: [{ type: "text", text: longSmokeAnswer }],
      streaming: false,
      stopReason: "stop",
      ts: Date.now(),
    }],
  };
  const otherSessionPayload = {
    ...backendPayload,
    approvals: [],
    stats: {
      ...backendPayload.stats,
      sessionId: "smoke-streamdown-other",
      sessionName: "Other session",
      sessionPath: undefined,
      isStreaming: false,
    },
    thread: [],
  };
  await app.evaluate(({ BrowserWindow }, payload) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "state-refresh",
      payload,
    });
  }, otherSessionPayload);
  await finalMessage.waitFor({ state: "detached" });
  await app.evaluate(({ BrowserWindow }, payload) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "state-refresh",
      payload,
    });
  }, historyPayload);
  await finalMessage.waitFor();
  if (await finalMessage.locator("[data-sd-animate]").count()) {
    throw new Error("Historical Markdown replayed streaming animation after a session switch");
  }
  await app.evaluate(({ BrowserWindow }, payload) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
      kind: "state-refresh",
      payload,
    });
  }, backendPayload);
  await finalMessage.waitFor({ state: "detached" });

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
      const assignedClientName = `${smokeClientPrefix} Alpha`;

      await firstSession.click({ button: "right" });
      const sessionActions = await page
        .locator(".sidebar-context-menu button")
        .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
      const expectedActions = ["Rename", "Archive", "Copy Session ID", "Delete"];
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
      const sessionRows = page.locator(".thread-item-shell");
      if (await sessionRows.count() > 1) {
        await sessionRows.nth(1).click({ button: "right" });
        const parallelSessionMenu = page.locator(".sidebar-context-menu");
        await parallelSessionMenu.waitFor();
        if (!(await inlineConfirmation.isVisible())) {
          throw new Error("Opening another session menu dismissed an active delete countdown");
        }
        await page.locator(".sidebar-brand-name").click();
        await parallelSessionMenu.waitFor({ state: "detached" });
      }
      await inlineConfirmation.getByRole("button", { name: "Undo" }).click();
      await inlineConfirmation.waitFor({ state: "detached" });

      const idleSessionCursor = await firstSession
        .locator(".thread-file-item")
        .evaluate((row) => getComputedStyle(row).cursor);
      if (idleSessionCursor !== "pointer") {
        throw new Error(`Idle session row uses the wrong cursor: ${idleSessionCursor}`);
      }

      const assignmentsBeforeDrag = await page.evaluate(async () => (await window.compass.init()).clientRegistry.assignments);
      const draggedSessionTitle = (await firstSession.locator(".file-name").textContent())?.trim();
      const assignedClientGroup = page.locator(".file-tree-item").filter({ hasText: assignedClientName });
      const assignedClientFolder = assignedClientGroup.locator(":scope > .folder-row");
      await assignedClientFolder.scrollIntoViewIfNeeded();
      await firstSession.dragTo(assignedClientFolder);
      await page.waitForFunction(async ({ expectedName, previousAssignments }) => {
        const payload = await window.compass.init();
        return Object.entries(payload.clientRegistry.assignments).some(
          ([sessionId, clientName]) => clientName === expectedName && previousAssignments[sessionId] !== expectedName,
        );
      }, { expectedName: assignedClientName, previousAssignments: assignmentsBeforeDrag });
      if (draggedSessionTitle) {
        await assignedClientGroup.locator(".thread-item-shell").filter({ hasText: draggedSessionTitle }).waitFor();
      }
      await shot("13b-session-drag-assignment");

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

      if (await page.locator(".sidebar").evaluate((element) => element.classList.contains("collapsed"))) {
        await page.locator(".titlebar-sidebar-toggle").click();
      }
      const clientSectionToggle = page.locator(".file-section-header-main");
      if ((await clientSectionToggle.getAttribute("aria-expanded")) !== "true") {
        await clientSectionToggle.click();
      }
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

      const dependencyScenario = await page.evaluate(async () => {
        const payload = await window.compass.init();
        if (!payload.dependencies || !payload.stats.sessionId) return null;
        return {
          original: payload.dependencies,
          sessionId: payload.stats.sessionId,
          missing: {
            ...payload.dependencies,
            items: payload.dependencies.items.map((item) => item.id === "phonak-target"
              ? {
                  ...item,
                  availability: "missing",
                  installedVersion: undefined,
                  installedPath: undefined,
                }
              : item),
            installs: [],
            checkedAt: Date.now(),
          },
        };
      });
      if (!dependencyScenario) throw new Error("Dependency scenario could not resolve the active session");
      await app.evaluate(({ BrowserWindow }, dependencies) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
          kind: "dependencies-changed",
          dependencies,
        });
      }, dependencyScenario.missing);
      const dependencyCard = page.locator(".thread-dependency-card");
      await dependencyCard.waitFor();
      await dependencyCard.getByRole("button", { name: "Download & install Target", exact: true }).waitFor();
      await dependencyCard.getByRole("button", { name: "Later", exact: true }).waitFor();
      await page.waitForTimeout(650);
      await shot("13c-session-dependency-recommendation");

      await app.evaluate(({ BrowserWindow }, { sessionId }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
          kind: "dependency-install-progress",
          progress: {
            dependencyId: "phonak-target",
            phase: "downloading",
            progress: 0.37,
            downloadedBytes: 38797312,
            totalBytes: 104857600,
            sessionId,
            updatedAt: Date.now(),
          },
        });
      }, { sessionId: dependencyScenario.sessionId });
      const dependencyProgress = dependencyCard.getByRole("progressbar");
      await dependencyProgress.waitFor();
      if ((await dependencyProgress.getAttribute("aria-valuenow")) !== "37") {
        throw new Error("Session dependency progress did not render the expected percentage");
      }
      await dependencyCard.getByText("37%").waitFor();
      await page.waitForTimeout(220);
      await shot("13d-session-dependency-progress");
      await app.evaluate(({ BrowserWindow }, dependencies) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("agent:event", {
          kind: "dependencies-changed",
          dependencies,
        });
      }, dependencyScenario.original);
      await dependencyCard.waitFor({ state: "detached" });
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

  await page.setViewportSize({ width: 1320, height: 880 });
  await page.evaluate(() => window.compass.setLanguage("zh-CN"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(async () => (await window.compass.init()).settings.language === "zh-CN");
  await page.locator(".user-profile").click();
  await page.locator(".profile-menu button").filter({ hasText: "设置" }).click();
  await page
    .getByRole("navigation", { name: "设置导航" })
    .getByRole("button", { name: "依赖项", exact: true })
    .click();
  await page.getByRole("heading", { name: "依赖项", exact: true }).waitFor();
  await page.locator(".settings-dependency-card").first().waitFor();
  await page.waitForTimeout(650);
  await shot("15-dependencies-zh-CN");

  console.log(`done, outDir=${outDir}`);
} finally {
  await app.close();
  rmSync(smokeUserDataDir, { recursive: true, force: true });
}
