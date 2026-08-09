export async function runApprovalScenario({ app, page, shot }) {
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

}
