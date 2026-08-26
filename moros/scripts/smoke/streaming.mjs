export async function runStreamingScenario({
  app,
  page,
  shot,
  previousTheme,
  activityCanvasSelector,
  assertActivityOrb,
  assertNoActivityOrb,
  setActivityTheme,
  reasoningMessage,
}) {
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
    "**. Moros renders the latest received text without a fixed-rate queue.",
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
    "This longer paragraph verifies that wrapped streamed text grows naturally in a narrow message column. Burst complete.",
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
  await assertNoActivityOrb();
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
  await assertNoActivityOrb();
  await page.emulateMedia({ reducedMotion: "no-preference" });

  await finalMessage.locator(".md").evaluate((root) => {
    const state = { mutationBatches: 0, mutationRecords: 0, startedAt: performance.now() };
    const observer = new MutationObserver((records) => {
      state.mutationBatches += 1;
      state.mutationRecords += records.length;
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    window.__morosStreamdownSmoke = { observer, state };
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
    const diagnostics = window.__morosStreamdownSmoke;
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
  await assertNoActivityOrb();
  await shot("12h-streaming-long-reply");
  await page.setViewportSize({ width: 560, height: 780 });
  await assertNoActivityOrb();
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
  await shot("12i-streaming-long-reply-narrow");
  await page.setViewportSize({ width: 1320, height: 880 });
  await assertNoActivityOrb();

  await page.evaluate(() => {
    window.__morosAssistantEndStartedAt = performance.now();
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
    performance.now() - window.__morosAssistantEndStartedAt
  ));
  console.log("STREAMDOWN_ASSISTANT_END", JSON.stringify({ assistantEndStableMs }));
  if (await finalMessage.locator('[data-streamdown="code-block-actions"]').count()) {
    throw new Error("Streamdown rendered a second set of code controls");
  }
  if ((await finalMessage.locator(".md-copy-button-icon").count()) !== 1) {
    throw new Error("Moros code copy control was not preserved exactly once");
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
  const assistantCopyPlacement = await assistantCopyButton.evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, left: Number.parseFloat(style.left) };
  });
  if (assistantCopyPlacement.position !== "absolute" || assistantCopyPlacement.left > 0) {
    throw new Error(`Assistant copy action is not anchored to the left edge: ${JSON.stringify(assistantCopyPlacement)}`);
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

  return { finalMessage, longSmokeAnswer };
}
