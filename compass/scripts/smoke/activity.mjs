export async function runActivityScenario({ app, page, shot }) {
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

  return {
    activityCanvasSelector,
    assertActivityOrb,
    assertNoActivityOrb,
    setActivityTheme,
    reasoningMessage,
  };
}
