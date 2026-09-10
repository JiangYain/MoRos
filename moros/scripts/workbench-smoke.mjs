import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, dirname } from "node:path";
import { createServer } from "node:http";
import { _electron as electron, chromium } from "playwright-core";
import { createWorkbenchFixtures } from "./smoke/workbench-fixtures.mjs";
import { runSmokePhase, closeElectronApplication } from "./smoke/harness.mjs";

const profile = await mkdtemp(join(tmpdir(), "moros-workbench-smoke-"));
const workspace = join(profile, "workspace");
const out = resolve(process.argv[2] ?? join(tmpdir(), "moros-workbench-smoke-output"));
await mkdir(out, { recursive: true });
await createWorkbenchFixtures(workspace);
await writeFile(join(profile, "moros-settings.json"), JSON.stringify({ workspaceDir: workspace, language: "en" }));
const fixtureServer = createServer((req, res) => {
  if (req.url === "/second") { res.end('<title>Second page</title><h1 id="second">Second page</h1>'); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end('<!doctype html><title>Workbench local app</title><style>body{padding:36px;font:18px system-ui;background:white;color:#222}button,a{display:inline-block;padding:16px;margin:16px 8px 0 0}#target{background:#f3f3f3;border:1px solid #ddd;border-radius:6px}</style><h1>Local application</h1><button id="target" onclick="this.textContent=\'Clicked\'">Review this button</button><a href="/second">Next page</a><script>console.error("Fixture console error")</script>');
});
await new Promise((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
const localUrl = `http://127.0.0.1:${fixtureServer.address().port}/`;
let app, page, web;
const errors = [];
const phase = (name, run) => runSmokePhase(`workbench.${name}`, run, { timeoutMs: 45_000 });
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
let scope, initialSessionPath;
const wb = (request) => page.evaluate((request) => window.moros.workbench(request), { scope, ...request });
const open = async (resource) => {
  const result = await wb({ operation: "open", resource });
  const tab = result.state.tabs.find((tab) => tab.id === result.state.activeTabId);
  await page.locator(`#wb-tab-${tab.id}[aria-selected="true"]`).waitFor({ state: "visible" });
  return tab;
};
const activePane = () => page.locator('.wb-tab-content:not([hidden])');
const guestCall = (id, expression) => app.evaluate(({ webContents }, { id, expression }) => webContents.fromId(id).executeJavaScript(expression), { id, expression });
const waitGuest = async (url) => {
  let id;
  for (let i = 0; i < 100; i++) {
    id = await app.evaluate(({ webContents }, url) => webContents.getAllWebContents().find((wc) => wc.getURL() === url)?.id, url);
    if (id && await guestCall(id, "document.readyState !== 'loading'")) return id;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Native browser failed to load fixture");
};
const chromeExecutable = () => {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const candidates = [
    configured,
    ...(process.platform === "win32" ? [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    ] : process.platform === "darwin" ? [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ] : [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ]),
  ].filter(Boolean);
  const executable = candidates.find((path) => existsSync(path));
  if (!executable) throw new Error("Workbench smoke requires Chrome or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.");
  return executable;
};
try {
  await phase("launch", async () => {
    app = await electron.launch({ args: ["out/main/index.js"], cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, MOROS_HEADLESS: "1", MOROS_WEB_PORT: "0", MOROS_USER_DATA_DIR: profile, MOROS_SKILL_HOME: join(profile, "skills"), PI_CODING_AGENT_DIR: join(profile, "pi-agent") }, timeout: 30_000 });
    page = await app.firstWindow(); page.setDefaultTimeout(15_000); page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.moros));
    const init = await page.evaluate(() => window.moros.init());
    scope = { workspaceDir: init.stats.workspaceDir, sessionId: init.stats.sessionId };
    initialSessionPath = (await page.evaluate(() => window.moros.getDeveloperContext())).sessionPath;
    await page.setViewportSize({ width: 1500, height: 960 });
    await page.locator(".composer-editor").waitFor();
    assert.equal((await wb({ operation: "state" })).state.open, false);
  });
  await phase("layout-and-files", async () => {
    const before = await page.locator(".main-col").boundingBox();
    await page.getByRole("button", { name: "Open workbench", exact: true }).click();
    await page.locator(".wb-start").waitFor(); await shot("01-empty-workbench");
    const after = await page.locator(".main-col").boundingBox(); assert.ok(after.width < before.width - 200);
    const separator = page.getByRole("separator", { name: "Resize workbench" });
    const width = Number(await separator.getAttribute("aria-valuenow"));
    await separator.focus(); await separator.press("ArrowLeft");
    await page.waitForFunction((width) => Number(document.querySelector(".wb-resizer")?.getAttribute("aria-valuenow")) > width, width);
    const divider = await separator.boundingBox();
    await page.mouse.move(divider.x + 2, divider.y + 100); await page.mouse.down(); await page.mouse.move(divider.x - 55, divider.y + 100, { steps: 6 }); await page.mouse.up();
    await page.waitForFunction((width) => Number(document.querySelector(".wb-resizer")?.getAttribute("aria-valuenow")) > width + 35, width);
    const resized = (await wb({ operation: "state" })).state.width;
    await page.locator(".wb-header").getByRole("button", { name: "Collapse panel", exact: true }).click(); await page.locator(".wb-shell.collapsed").waitFor();
    await page.locator(".wb-expand").click(); await page.locator(".wb-start").waitFor();
    assert.equal((await wb({ operation: "state" })).state.width, resized);
    await page.locator(".wb-start").getByRole("button", { name: "Files", exact: false }).click();
    await activePane().locator(".wb-files-home").waitFor(); await activePane().locator(".wb-file-tree").getByRole("button", { name: "sample.ts", exact: true }).waitFor();
    await activePane().getByLabel("Files, folders…", { exact: true }).fill("README");
    await activePane().locator(".wb-files-results").getByRole("button", { name: "README.md", exact: true }).click();
    await activePane().getByRole("heading", { name: "Workbench preview" }).waitFor();
    await activePane().getByRole("button", { name: "Back to files", exact: true }).click();
    await activePane().getByLabel("Files, folders…", { exact: true }).fill("");
    await activePane().locator(".wb-files-results").getByRole("button", { name: "README.md", exact: true }).waitFor();
    await activePane().locator(".wb-files-new").click();
    await page.getByLabel("Name or relative path", { exact: true }).fill("created.md"); await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
    await activePane().locator(".wb-code").waitFor(); assert.equal(await readFile(join(workspace, "created.md"), "utf8"), "");
    await activePane().getByRole("button", { name: "Back to files", exact: true }).click();
    await activePane().locator(".wb-file-tree").getByRole("button", { name: "New folder", exact: true }).click();
    await page.getByLabel("Name or relative path", { exact: true }).fill("created-folder"); await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
    await activePane().locator(".wb-file-tree").getByRole("button", { name: "created-folder", exact: true }).waitFor();
    await shot("09-files-home");
    const code = await open({ kind: "file", path: "sample.ts", line: 42 });
    await activePane().locator(".cm-activeLine").filter({ hasText: "value42" }).waitFor();
    assert.equal((await open({ kind: "file", path: join(workspace, "sample.ts"), line: 9 })).id, code.id);
    await activePane().locator(".cm-activeLine").filter({ hasText: "value9" }).waitFor();
    await activePane().getByRole("button", { name: "Add feedback", exact: true }).click();
    await page.getByLabel("Your comment", { exact: true }).fill("Inspect this code line");
    await page.getByRole("button", { name: "Add to pending feedback", exact: true }).click();
    await page.getByRole("dialog", { name: "Add feedback", exact: true }).waitFor({ state: "detached" });
    assert.equal((await wb({ operation: "state" })).state.feedback[0].source.line, 9);
    await open({ kind: "file", path: "README.md" }); await activePane().getByRole("heading", { name: "Workbench preview" }).waitFor();
    await activePane().locator(".wb-file-tree").getByRole("button", { name: "sample.ts", exact: true }).waitFor();
    await shot("02-markdown-and-tree");
    await activePane().getByRole("link", { name: "Jump to code" }).click();
    await activePane().locator(".cm-activeLine").filter({ hasText: "value42" }).waitFor();
    await open({ kind: "file", path: "image.png" }); await page.waitForFunction(() => document.querySelector('.wb-tab-content:not([hidden]) .wb-image img')?.naturalWidth > 0);
    await open({ kind: "file", path: "report.pdf" }); await page.waitForFunction(() => document.querySelector('.wb-tab-content:not([hidden]) .wb-pdf canvas')?.width > 100);
    await open({ kind: "file", path: "report.docx" }); await activePane().frameLocator("iframe").getByText("Workbench Word document").waitFor();
    const html = await open({ kind: "file", path: "preview.html" }); await activePane().frameLocator("iframe").getByRole("heading", { name: "HTML artifact" }).waitFor();
    assert.equal(await activePane().locator("iframe").getAttribute("sandbox"), "");
    await activePane().getByRole("button", { name: "Interact in browser", exact: true }).click();
    await page.waitForFunction(async (scope) => {
      const state = (await window.moros.workbench({ scope, operation: "state" })).state;
      return state.tabs.find((tab) => tab.id === state.activeTabId)?.resource.kind === "browser";
    }, scope);
    const artifactWorkbench = (await wb({ operation: "state" })).state;
    const artifactTab = artifactWorkbench.tabs.find((tab) => tab.id === artifactWorkbench.activeTabId);
    assert.ok(artifactTab);
    const artifactBrowser = (await wb({ operation: "browser", tabId: artifactTab.id, action: "inspect" })).browser;
    const artifactGuest = await waitGuest(artifactBrowser.url);
    await guestCall(artifactGuest, "history.pushState({}, '', '/escaped'); true");
    await page.waitForFunction(async ({ scope, id }) => {
      const browser = (await window.moros.workbench({ scope, operation: "browser", tabId: id, action: "inspect" })).browser;
      return browser.url.endsWith("/escaped");
    }, { scope, id: artifactTab.id });
    const escaped = await wb({ operation: "browser", tabId: artifactTab.id, action: "navigate", url: localUrl }).then(() => false, () => true);
    assert.equal(escaped, true);
    assert.equal(await guestCall(artifactGuest, "location.pathname"), "/escaped");
    await wb({ operation: "close", tabId: artifactTab.id });
    const order = (await wb({ operation: "state" })).state.tabs.map((tab) => tab.id).reverse();
    await wb({ operation: "layout", order });
    assert.deepEqual(await page.locator('.wb-tabs [role="tab"]').evaluateAll((tabs) => tabs.map((tab) => tab.dataset.workbenchTab)), order);
    await page.reload(); await page.locator(`#wb-tab-${html.id}[aria-selected="true"]`).waitFor();
    assert.equal((await wb({ operation: "state" })).state.feedback.length, 1);
  });
  let terminal;
  await phase("real-terminal", async () => {
    terminal = await open({ kind: "terminal" });
    await page.waitForFunction(async ({ scope, id }) => { const terminal = (await window.moros.workbench({ scope, operation: "terminal", tabId: id, action: "read" })).terminal; return !terminal.pendingCursorResponse && /PS [^\r\n]+>/.test(terminal.output); }, { scope, id: terminal.id });
    const input = activePane().locator(".xterm-helper-textarea"); await input.focus(); await page.keyboard.type("Write-Output ('MOROS_' + 'TERMINAL_READY')"); await page.keyboard.press("Enter");
    await page.waitForFunction(async ({ scope, id }) => (await window.moros.workbench({ scope, operation: "terminal", tabId: id, action: "read" })).terminal.output.includes("MOROS_TERMINAL_READY\r\n"), { scope, id: terminal.id });
    assert.equal((await wb({ operation: "terminal", tabId: terminal.id, action: "read" })).terminal.commands.at(-1).source, "user");
    await wb({ operation: "terminal", tabId: terminal.id, action: "resize", cols: 110, rows: 30 });
    await page.keyboard.type("while ($true) { Write-Output MOROS_TICK; Start-Sleep -Milliseconds 250 }"); await page.keyboard.press("Enter");
    await page.waitForFunction(async ({ scope, id }) => (await window.moros.workbench({ scope, operation: "terminal", tabId: id, action: "read" })).terminal.output.split("MOROS_TICK").length >= 4, { scope, id: terminal.id });
    await page.reload(); await page.locator(`#wb-tab-${terminal.id}`).waitFor();
    const interruptOffset = (await wb({ operation: "terminal", tabId: terminal.id, action: "read" })).terminal.endOffset;
    await activePane().locator(".xterm-helper-textarea").focus(); await page.keyboard.press("Control+c");
    await page.waitForFunction(async ({ scope, id, offset }) => { const terminal = (await window.moros.workbench({ scope, operation: "terminal", tabId: id, action: "read", offset })).terminal; return !terminal.pendingCursorResponse && /PS [^\r\n]+>/.test(terminal.output); }, { scope, id: terminal.id, offset: interruptOffset });
    await activePane().locator(".xterm-helper-textarea").focus(); await page.keyboard.type("Write-Output ('AFTER_' + 'INTERRUPT')"); await page.keyboard.press("Enter");
    await page.waitForFunction(async ({ scope, id }) => (await window.moros.workbench({ scope, operation: "terminal", tabId: id, action: "read" })).terminal.output.includes("AFTER_INTERRUPT\r\n"), { scope, id: terminal.id });
    await page.waitForFunction(() => document.querySelector('.wb-tab-content:not([hidden]) .xterm-rows')?.textContent.replace(/\s/g, "").includes("AFTER_INTERRUPT"));
    await shot("03-real-terminal");
    await page.locator(`#wb-tab-${terminal.id} button`).click(); await page.getByRole("dialog").filter({ hasText: "running process" }).waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await wb({ operation: "terminal", tabId: terminal.id, action: "read" })).terminal.status, "running");
  });
  await phase("native-browser-and-annotations", async () => {
    const browser = await open({ kind: "browser", url: "" });
    await activePane().getByText("Start browsing", { exact: true }).waitFor();
    await activePane().getByRole("textbox").fill(localUrl); await activePane().getByRole("textbox").press("Enter");
    const id = await waitGuest(localUrl);
    assert.equal(await guestCall(id, "typeof window.require + ':' + typeof window.moros"), "undefined:undefined");
    await page.waitForFunction(async ({ scope, id }) => (await window.moros.workbench({ scope, operation: "browser", tabId: id, action: "inspect" })).browser.consoleErrors.some((error) => error.message.includes("Fixture console error")), { scope, id: browser.id });
    await activePane().getByRole("button", { name: "Annotate an element", exact: true }).click();
    const rect = await guestCall(id, "(() => { const r=document.querySelector('#target').getBoundingClientRect(); return {x:r.x+20,y:r.y+20}; })()");
    await app.evaluate(({ webContents }, { id, rect }) => { const wc = webContents.fromId(id); wc.sendInputEvent({ type: "mouseMove", ...rect }); wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...rect }); wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...rect }); }, { id, rect });
    await page.getByLabel("Your comment", { exact: true }).fill("Raise the button label slightly");
    await page.getByRole("button", { name: "Add to pending feedback", exact: true }).click();
    const pending = (await wb({ operation: "state" })).state.feedback;
    const annotation = pending.find((entry) => entry.kind === "browser");
    assert.equal(annotation.source.url, localUrl); assert.match(annotation.source.selector, /target/); assert.match(annotation.screenshot, /^data:image\/png;base64/);
    assert.ok(annotation.source.rect.width < 350 && annotation.source.rect.height < 100);
    assert.equal(await guestCall(id, "document.querySelector('#target').textContent"), "Review this button");
    await activePane().getByRole("button", { name: "Annotate a region", exact: true }).click();
    await app.evaluate(({ webContents }, id) => { const wc = webContents.fromId(id); wc.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, x: 35, y: 35 }); wc.sendInputEvent({ type: "mouseMove", x: 205, y: 115 }); wc.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: 205, y: 115 }); }, id);
    await page.getByLabel("Your comment", { exact: true }).fill("Give this region more space"); await page.getByRole("button", { name: "Add to pending feedback", exact: true }).click();
    const region = (await wb({ operation: "state" })).state.feedback.find((entry) => entry.comment.startsWith("Give this region"));
    assert.ok(region.source.rect.width >= 160 && region.source.rect.height >= 70);
    await activePane().getByRole("textbox").fill(`${localUrl}second`); await activePane().getByRole("textbox").press("Enter"); await waitGuest(`${localUrl}second`);
    await activePane().getByRole("button", { name: "Back", exact: true }).click(); await waitGuest(localUrl);
    await activePane().getByRole("button", { name: "Forward", exact: true }).click(); await waitGuest(`${localUrl}second`);
    await activePane().getByRole("textbox").fill("http://127.0.0.1:1/"); await activePane().getByRole("textbox").press("Enter"); await activePane().getByRole("alert").waitFor();
    await activePane().getByRole("textbox").fill(localUrl); await activePane().getByRole("textbox").press("Enter"); await waitGuest(localUrl);
    await shot("04-browser-toolbar");
    const blocked = await wb({ operation: "browser", tabId: browser.id, action: "navigate", url: page.url() }).then(() => false, () => true); assert.equal(blocked, true);
    const nativeScreenshot = await app.evaluate(async ({ webContents }, id) => (await webContents.fromId(id).capturePage()).toDataURL(), id);
    await writeFile(join(out, "04-native-browser.png"), Buffer.from(nativeScreenshot.split(",")[1], "base64"));
  });
  await phase("git-review-and-feedback", async () => {
    const tab = await open({ kind: "review", range: "unstaged", path: "sample.ts" });
    await activePane().locator(".wb-diff-line.add").waitFor();
    await activePane().locator(".wb-diff-line.add .wb-line-number").last().click();
    await page.getByLabel("Your comment", { exact: true }).fill("Explain this change"); await page.getByRole("button", { name: "Add to pending feedback", exact: true }).click();
    const comment = (await wb({ operation: "state" })).state.feedback.find((entry) => entry.kind === "review");
    assert.equal(comment.source.side, "right"); assert.equal(comment.source.line, 5); assert.ok(comment.source.version);
    await activePane().getByRole("button", { name: "Stage all shown changes", exact: true }).click();
    const staged = await open({ kind: "review", range: "staged" }); await activePane().locator(".wb-diff-line.add").waitFor();
    await activePane().getByRole("button", { name: "Unstage all shown changes", exact: true }).click();
    await activePane().getByText("No changes in this scope.", { exact: true }).waitFor();
    await open(tab.resource); await activePane().getByRole("button", { name: "Refresh", exact: true }).click(); await activePane().locator(".wb-diff-line.add").waitFor();
    await activePane().locator(".wb-review-summary").getByRole("button", { name: "Revert…", exact: true }).click();
    await page.getByRole("dialog").filter({ hasText: "sample.ts" }).waitFor(); await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    assert.match(await readFile(join(workspace, "sample.ts"), "utf8"), /500/);
    await activePane().locator(".wb-review-summary").getByRole("button", { name: "Revert…", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm reverting selected changes", exact: true }).click();
    await page.waitForFunction(async ({ scope, id }) => (await window.moros.workbench({ scope, operation: "review", tabId: id, action: "read" })).review.files.length === 0, { scope, id: tab.id });
    assert.doesNotMatch(await readFile(join(workspace, "sample.ts"), "utf8"), /500/);
    for (const resource of [{ kind: "review", range: "branch", ref: "main" }, { kind: "review", range: "commit", ref: "HEAD" }]) { await open(resource); await activePane().locator(".wb-diff-line.add").waitFor(); }
    await shot("05-git-review");
    await open({ kind: "review", range: "last-turn" }); await activePane().getByRole("alert").filter({ hasText: "No turn baseline" }).waitFor();
    await page.locator(".wb-feedback-trigger").click(); await page.getByRole("dialog").getByText("Raise the button label slightly", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal((await wb({ operation: "state" })).state.feedback.length, 4);
  });
  await phase("isolation-themes-web-and-feedback-send", async () => {
    // This fixture persists a local conversation without invoking any model.
    const timestamp = new Date().toISOString();
    await mkdir(dirname(initialSessionPath), { recursive: true });
    await writeFile(initialSessionPath, [
      { type: "session", version: 3, id: scope.sessionId, timestamp, cwd: workspace },
      { type: "message", id: "fixture1", parentId: null, timestamp, message: { role: "user", content: [{ type: "text", text: "Workbench fixture conversation" }], timestamp: Date.now() } },
    ].map((value) => JSON.stringify(value)).join("\n") + "\n");
    const saved = (await wb({ operation: "state" })).state;
    const workspace2 = join(profile, "workspace-two"); await mkdir(workspace2);
    await page.evaluate((workspace) => window.moros.newSession(workspace), workspace2); await page.reload();
    const second = (await page.evaluate(() => window.moros.init())).stats;
    const secondState = await page.evaluate((scope) => window.moros.workbench({ scope, operation: "state" }), { workspaceDir: second.workspaceDir, sessionId: second.sessionId });
    assert.equal(secondState.state.tabs.length, 0);
    assert.equal((await wb({ operation: "terminal", tabId: terminal.id, action: "read" })).terminal.status, "running");
    await page.evaluate((path) => window.moros.openSession(path), initialSessionPath); await page.reload();
    await page.locator(`#wb-tab-${saved.activeTabId}`).waitFor(); assert.equal((await wb({ operation: "state" })).state.tabs.length, saved.tabs.length);
    assert.ok((await wb({ operation: "state" })).state.recentFiles.some((entry) => entry.path.endsWith("README.md")));
    await wb({ operation: "open", resource: { kind: "file", path: "README.md" } });
    await page.locator(".user-profile").click(); await page.locator(".profile-menu-head-button").click(); await page.locator(".settings-workspace").waitFor();
    assert.equal(await page.locator(".wb-shell").isVisible(), false);
    await page.reload();
    await page.evaluate(() => localStorage.setItem("moros.theme.v1", "dark"));
    await page.emulateMedia({ colorScheme: "dark" }); await page.reload(); await shot("06-dark-workbench");
    await page.setViewportSize({ width: 760, height: 850 }); await page.locator(".wb-shell.drawer").waitFor(); await shot("07-narrow-workbench");
    await page.locator('.wb-tabs [aria-selected="true"]').focus(); await page.keyboard.press("Escape");
    await page.locator(".wb-shell").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".wb-shell").isVisible(), false);
    await page.setViewportSize({ width: 1500, height: 960 }); await wb({ operation: "layout", open: true, collapsed: false });
    web = await chromium.launch({ executablePath: chromeExecutable(), headless: true });
    const webPage = await web.newPage(); await webPage.goto(page.url()); await webPage.locator(".composer-editor").waitFor();
    const rpc = await webPage.evaluate(async ({ scope }) => { const r = await fetch("/api/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "workbench", args: [{ scope, operation: "state" }] }) }); return r.json(); }, { scope });
    assert.ok(rpc.result?.state || rpc.state || rpc.value?.state, "Web RPC did not return shared workbench state");
    const browser = await open({ kind: "browser", url: localUrl });
    await webPage.locator('.wb-tab-content:not([hidden])').getByText(/cannot safely embed|Electron|desktop/i).first().waitFor();
    await webPage.close();
    await wb({ operation: "layout", open: false });
    // Capture only the IPC submission in this isolated profile. Never make a real model request.
    const capture = await app.evaluateHandle(({ ipcMain }) => {
      const requests = []; ipcMain.removeHandler("agent:prompt"); ipcMain.handle("agent:prompt", (_event, ...args) => { requests.push(args); return { ok: false, error: "Fixture captured; no model request." }; });
      return requests;
    });
    // Enable an explicitly offline UI fixture only after replacing the model prompt handler.
    const ids = saved.feedback.map((entry) => entry.id);
    const stats = (await page.evaluate(() => window.moros.init())).stats;
    await app.evaluate(({ BrowserWindow }, stats) => BrowserWindow.getAllWindows()[0].webContents.send("agent:event", { kind: "stats", stats: { ...stats, modelAuthConfigured: true, model: { id: "offline-fixture", provider: "fixture", name: "Offline fixture", reasoning: false, thinkingLevels: ["off"], supportsImages: true } } }), stats);
    await page.locator(".composer-editor").fill("Please apply my comments");
    await page.locator(".composer-editor").press("Enter");
    await page.waitForFunction(() => document.body.textContent.includes("Fixture captured; no model request."));
    const requests = await capture.jsonValue(); assert.deepEqual(requests[0][3], ids);
    assert.equal((await wb({ operation: "state" })).state.feedback.length, 4);
    const recalled = { text: "Restore /skill:layout exactly here", images: [{ mimeType: "image/png", data: (await readFile(join(workspace, "image.png"))).toString("base64"), name: "recalled-reference.png" }],
      feedback: [{ id: "recalled-comment", kind: "browser", comment: "Keep this recalled annotation", selected: true, createdAt: 1, source: { url: localUrl, selector: "#target" }, evidence: "Untrusted page label" }] };
    await page.locator(".composer-editor").fill("");
    await app.evaluate(({ ipcMain, BrowserWindow }, { scope, draft }) => {
      ipcMain.removeHandler("agent:remove-queued-message");
      ipcMain.handle("agent:remove-queued-message", (_event, _kind, _index, _text, expectedScope) => {
        if (JSON.stringify(expectedScope) !== JSON.stringify(scope)) return { ok: false, error: "Wrong recall scope" };
        BrowserWindow.getAllWindows()[0].webContents.send("agent:event", { kind: "queue-update", steering: [], followUp: [] });
        return { ok: true, scope, draft };
      });
      BrowserWindow.getAllWindows()[0].webContents.send("agent:event", { kind: "queue-update", steering: [draft.text], followUp: [] });
    }, { scope, draft: recalled });
    await page.locator(".queue-chip-body").click();
    await page.waitForFunction(() => document.querySelector(".composer-editor")?.textContent.includes("exactly here"));
    await page.locator('.composer-attachments img[alt="recalled-reference.png"]').waitFor();
    await page.locator(".wb-feedback-trigger").click();
    await page.getByRole("dialog").getByText("Keep this recalled annotation", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".composer-editor").press("Enter");
    await page.waitForFunction(() => document.body.textContent.includes("Fixture captured; no model request."));
    await page.locator('.composer-attachments img[alt="recalled-reference.png"]').waitFor();
    const recalledRequests = await capture.jsonValue();
    assert.equal(recalledRequests.length, 2);
    assert.deepEqual(recalledRequests[1][4], recalled.feedback);
    assert.equal(recalledRequests[1][1][0].name, "recalled-reference.png");
    await page.locator(".wb-feedback-trigger").click();
    await page.getByRole("dialog").getByText("Keep this recalled annotation", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await capture.dispose();
    assert.deepEqual(errors, []);
  });
  console.log("WORKBENCH_SMOKE_PASS");
} catch (error) {
  if (page) await shot("failure").catch(() => undefined);
  throw error;
} finally {
  await web?.close();
  if (app) await closeElectronApplication(app);
  await new Promise((resolve) => fixtureServer.close(resolve));
  assert.ok(relative(tmpdir(), resolve(profile)).startsWith("moros-workbench-smoke-"));
  await rm(profile, { recursive: true, force: true });
}
