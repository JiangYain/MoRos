export async function runSessionScenario({ app, page, shot, finalMessage, longSmokeAnswer }) {
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
}
