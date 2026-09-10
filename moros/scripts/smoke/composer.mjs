export async function runComposerScenario({ page, shot, onePixelPng, smokeQuickPrompts }) {
  const textarea = page.locator(".composer-editor");
  const quickPrompts = page.locator(".quick-prompts");
  const workspacePayload = await page.evaluate(() => window.moros.init());
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
      document.querySelector(".composer-editor")?.dataset.value === expected
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
  if ((await textarea.getAttribute("data-value")) !== "请帮我执行 /") {
    throw new Error("Dismissing slash suggestions modified the draft");
  }
  await textarea.fill("请帮我执行 ");
  await textarea.fill("请帮我执行 /");
  await page.locator(".slash-popover").waitFor();
  await page.keyboard.press("Tab");
  const appliedSlash = await textarea.getAttribute("data-value");
  const selectedSkillChip = page.locator(".composer-editor .composer-skill-chip");
  if (!appliedSlash?.startsWith("请帮我执行 /skill:") || (await selectedSkillChip.count()) !== 1) {
    throw new Error(`Skill selection did not become a structured chip: ${appliedSlash}`);
  }
  await shot("05b-skill-chip");
  await textarea.fill("");

  await runInlineSlashScenario({ page, shot });

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
  const initPayload = await page.evaluate(() => window.moros.init());
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
    await apiKeyInput.fill("moros-smoke-key");
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
  const contextUsageRegion = page.getByRole("region", { name: "Context usage" });
  await contextUsageRegion.waitFor();
  const contextUsageLists = contextUsageRegion.locator(".context-usage-list");
  if ((await contextUsageLists.count()) !== 2) {
    throw new Error("Context Usage must render fixed and runtime details in two columns");
  }
  await contextUsageLists.first().waitFor();
  await contextUsageLists.nth(1).waitFor();
  await page.locator(".context-usage-visual").waitFor();
  const workspaceContextStrip = page.locator(".workspace-context-surface .workspace-context-strip");
  const expectedWorkspaceAccessory = workspaceHasUsableModel
    ? workspaceContextStrip.locator(".quick-prompts")
    : workspaceContextStrip.locator(".workspace-model-notice");
  if (
    (await workspaceContextStrip.count()) !== 1
    || (await workspaceContextStrip.locator(".workspace-session").count()) !== 1
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
    window.__morosSmokeTransfer = transfer;
    node.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: transfer }));
  }, onePixelPng.toString("base64"));
  await page.locator(".composer-drop-overlay").waitFor();
  await page.locator(".composer").evaluate((node) => {
    const transfer = window.__morosSmokeTransfer;
    node.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    delete window.__morosSmokeTransfer;
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
  await sessionSearch.fill("refactor");
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
  if (openedSearchResult && openedSearchResultTitle) {
    await page.waitForFunction((title) => Array.from(
      document.querySelectorAll(".thread-file-item.active .file-name"),
    ).some((node) => node.textContent?.trim() === title), openedSearchResultTitle);
  }
}

export async function runInlineSlashScenario({ page, shot }) {
  const textarea = page.locator(".composer-editor");
  const popover = page.locator(".slash-popover");
  await textarea.fill("我使用 我");
  await textarea.press("ArrowLeft");
  await textarea.press("/");
  await popover.waitFor();
  if ((await textarea.getAttribute("data-value")) !== "我使用 /我") {
    throw new Error("The inline slash fixture did not preserve the text after the caret");
  }
  await page.waitForFunction(() => {
    const popover = document.querySelector(".slash-popover");
    return popover && Number(getComputedStyle(popover).opacity) === 1;
  });
  await shot("05c-inline-slash", page.locator(".main-col"));

  await textarea.press("ArrowRight");
  await popover.waitFor({ state: "detached" });
  await textarea.press("ArrowLeft");
  await popover.waitFor();
  await textarea.press("Tab");
  const selectedSkill = page.locator(".composer-editor .composer-skill-chip");
  await selectedSkill.waitFor();
  if ((await textarea.getAttribute("data-value")) !== `我使用 ${await selectedSkill.getAttribute("data-skill-command")} 我`
    || (await textarea.evaluate((node) => { const range = window.getSelection().getRangeAt(0).cloneRange(); range.setEnd(node, node.childNodes.length); return range.toString(); })) !== "我") {
    throw new Error("Selecting an inline skill changed the surrounding text or moved the caret");
  }

  await textarea.fill("前文  /smoke 后文");
  await textarea.press("ArrowLeft");
  await textarea.press("ArrowLeft");
  await textarea.press("ArrowLeft");
  await popover.waitFor();
  await popover.locator(".popover-item").first().click();
  await selectedSkill.waitFor();
  if ((await textarea.getAttribute("data-value")) !== `前文  ${await selectedSkill.getAttribute("data-skill-command")}  后文`) {
    throw new Error("Selecting a filtered inline skill changed existing whitespace or the suffix");
  }

  await textarea.fill("/");
  await popover.waitFor();
  await textarea.press("Control+A");
  await popover.waitFor({ state: "detached" });
  await textarea.fill("https://example.com/path");
  await textarea.press("Home");
  await textarea.press("ArrowRight");
  await popover.waitFor({ state: "detached" });
  await textarea.fill("");
}
