export async function runSettingsScenario({ page, shot, onePixelPng }) {
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
  await page.locator("#profile-name-input").fill("Moros Smoke Tester");
  await page.locator("#profile-handle-input").fill("moros_smoke");
  await page.getByRole("heading", { name: "Profile" }).click();
  const storedIdentity = await page.evaluate(() => {
    const raw = window.localStorage.getItem("moros.profile.identity.v1");
    return raw ? JSON.parse(raw) : null;
  });
  if (storedIdentity?.name !== "Moros Smoke Tester" || storedIdentity?.handle !== "moros_smoke") {
    throw new Error(`Profile identity did not persist: ${JSON.stringify(storedIdentity)}`);
  }
  const previousProfileAvatar = await page.evaluate(() =>
    window.localStorage.getItem("moros.profile.avatar.v1"),
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
      window.localStorage.setItem("moros.profile.avatar.v1", avatar);
    }, previousProfileAvatar);
  }
  await page.getByRole("complementary").getByRole("button", { name: "Back" }).click();

  await page.locator(".user-profile").click();
  if ((await page.locator(".user-profile .user-name").textContent())?.trim() !== "Moros Smoke Tester") {
    throw new Error("The sidebar did not adopt the persisted profile name");
  }
  if ((await page.locator(".profile-menu-head small").textContent())?.trim() !== "@moros_smoke") {
    throw new Error("The profile menu did not adopt the persisted profile username");
  }
  await page.locator(".profile-menu button").filter({ hasText: "Skill library" }).click();
  await page.getByRole("heading", { name: "Skills", exact: true }).waitFor();
  await shot("03-skills-settings");
  const skillsSearch = page.getByRole("textbox", { name: "Search skills", exact: true });
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
    (await window.moros.init()).settings.commandExplanationLanguage,
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
    (await window.moros.init()).settings.commandExplanationLanguage === "zh-CN",
  );
  await commandLanguageTrigger.click();
  await commandLanguageDialog.getByRole("button", {
    name: "Follow interface language",
    exact: true,
  }).click();
  await page.waitForFunction(async () =>
    (await window.moros.init()).settings.commandExplanationLanguage === "auto",
  );

  await page
    .getByRole("navigation", { name: "Settings navigation" })
    .getByRole("button", { name: "Dependencies", exact: true })
    .click();
  await page.getByRole("heading", { name: "Dependencies", exact: true }).waitFor();
  await page.locator(".settings-dependency-card").first().waitFor();
  if ((await page.locator(".settings-dependency-card").count()) !== 2) {
    throw new Error("Dependencies settings did not render the two generic runtime resources");
  }
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll(".settings-dependency-artwork img"));
    return images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0);
  });
  const dependencyArtworkLoaded = await page.locator(".settings-dependency-artwork img").evaluateAll(
    (images) => images.length === 2 && images.every((image) => image.complete && image.naturalWidth > 0),
  );
  if (!dependencyArtworkLoaded) {
    throw new Error("One or more dependency logos failed to load");
  }
  const dependencyPayload = await page.evaluate(() => window.moros.init());
  if (
    dependencyPayload.dependencies?.items.length !== 2
    || !dependencyPayload.dependencies.items.some((item) => item.id === "git")
    || !dependencyPayload.dependencies.items.some((item) => item.id === "bash")
  ) {
    throw new Error("Dependency detection payload is incomplete");
  }
  await shot("03c-dependencies-settings");
  await page.setViewportSize({ width: 600, height: 880 });
  await page.locator(".settings-dependency-grid").first().waitFor();
  await shot("03d-dependencies-settings-responsive");
  await page.setViewportSize({ width: 1320, height: 880 });
  await page.locator(".settings-dependency-card").filter({ hasText: "Bash / Git Bash" }).scrollIntoViewIfNeeded();
  await shot("03e-dependencies-runtime");
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
    const payload = await window.moros.init();
    return JSON.stringify(payload.settings.quickPrompts) === JSON.stringify(expected);
  }, smokeQuickPrompts);
  await page
    .getByRole("navigation", { name: "Settings navigation" })
    .getByRole("button", { name: /Appearance/ })
    .click();
  await page.getByRole("heading", { name: "Appearance" }).waitFor();
  const previousTheme = await page.evaluate(() => {
    const value = window.localStorage.getItem("moros.theme.v1");
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

  return { smokeQuickPrompts, previousTheme };
}
