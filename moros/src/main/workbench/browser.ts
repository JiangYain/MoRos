import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { ipcMain, session, WebContentsView, type BrowserWindow } from "electron";
import { workbenchScopeKey, type WorkbenchBounds, type WorkbenchBrowser, type WorkbenchEvent, type WorkbenchFeedback, type WorkbenchScope } from "../../shared/workbench.ts";
import { createBrowserArtifactPolicy, safeBrowserUrl, type BrowserArtifactPolicy } from "./paths.ts";

interface BrowserRecord {
  scope: WorkbenchScope;
  view: WebContentsView;
  state: WorkbenchBrowser;
  artifactPolicy: BrowserArtifactPolicy;
  attached?: BrowserWindow;
}
interface BrowserOptions {
  getWindow(): BrowserWindow | undefined;
  internalOrigins(): string[];
  isArtifactAllowed(url: string, scope: WorkbenchScope): boolean;
  emit(event: WorkbenchEvent): void;
}

export class WorkbenchBrowsers {
  private readonly browsers = new Map<string, BrowserRecord>();
  private readonly partitions = new Set<string>();
  constructor(private readonly options: BrowserOptions) {
    ipcMain.on("workbench:annotation", (event, value: unknown) => {
      const record = [...this.browsers.values()].find((record) => record.view.webContents.id === event.sender.id);
      if (record) void this.captureAnnotation(record, value).catch((error: unknown) => this.fail(record, String(error)));
    });
    ipcMain.on("workbench:annotation-cancel", (event) => {
      const record = [...this.browsers.values()].find((record) => record.view.webContents.id === event.sender.id);
      if (record) { record.state.annotationMode = undefined; this.publish(record); }
    });
  }

  private allowed(url: string, scope: WorkbenchScope): boolean {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      const internal = this.options.internalOrigins().some((origin) => {
        const target = new URL(origin);
        return parsed.origin === target.origin || (target.port === parsed.port && /^(localhost|127\.[\d.]+|\[::1\]|0\.0\.0\.0)$/.test(parsed.hostname));
      });
      return !internal || this.options.isArtifactAllowed(url, scope);
    } catch { return false; }
  }
  private publish(record: BrowserRecord): void {
    const contents = record.view.webContents;
    if (contents.isDestroyed()) return;
    record.state.canGoBack = contents.navigationHistory.canGoBack();
    record.state.canGoForward = contents.navigationHistory.canGoForward();
    this.options.emit({ kind: "workbench", scope: record.scope, type: "browser", browser: { ...record.state, consoleErrors: [...record.state.consoleErrors] } });
  }
  private fail(record: BrowserRecord, error: string): void { record.state.loading = false; record.state.error = error; this.publish(record); }

  create(scope: WorkbenchScope, id: string, url: string): WorkbenchBrowser {
    const normalized = url ? safeBrowserUrl(url) : "";
    if (normalized && !this.allowed(normalized, scope)) throw new Error("WB_BROWSER_INTERNAL_BLOCKED");
    const partition = `persist:moros-workbench-${createHash("sha256").update(workbenchScopeKey(scope)).digest("hex").slice(0, 24)}`;
    const isolated = session.fromPartition(partition);
    if (!this.partitions.has(partition)) {
      this.partitions.add(partition);
      isolated.setPermissionCheckHandler(() => false);
      isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      isolated.on("will-download", (event) => event.preventDefault());
      isolated.webRequest.onBeforeRequest((details, callback) => {
        const page = [...this.browsers.values()].find((record) => record.view.webContents.id === details.webContentsId);
        if (page?.artifactPolicy.restricted && /^https?:/.test(details.url) && !page.artifactPolicy.allows(details.url)) { callback({ cancel: true }); return; }
        const protocol = new URL(details.url).protocol;
        if (["file:", "javascript:", "ftp:"].includes(protocol)) { callback({ cancel: true }); return; }
        if (["http:", "https:"].includes(protocol) && !this.allowed(details.url, scope)) { callback({ cancel: true }); return; }
        callback({});
      });
    }
    const view = new WebContentsView({ webPreferences: {
      session: isolated, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: false,
      sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
      preload: join(import.meta.dirname, "../preload/workbench-browser.cjs"),
    } });
    view.setVisible(false);
    const state: WorkbenchBrowser = { id, url: normalized, title: normalized, loading: Boolean(normalized), canGoBack: false, canGoForward: false, consoleErrors: [] };
    const artifactPolicy = createBrowserArtifactPolicy(normalized, (target) => this.options.isArtifactAllowed(target, scope));
    const record: BrowserRecord = { scope, view, state, artifactPolicy };
    this.browsers.set(id, record);
    const contents = view.webContents;
    const navigationAllowed = (target: string): boolean => {
      if (!this.allowed(target, scope) || !artifactPolicy.allows(target)) return false;
      artifactPolicy.observe(target);
      return true;
    };
    contents.setWindowOpenHandler(({ url }) => {
      if (navigationAllowed(url)) void this.navigate(scope, id, url).catch((error: unknown) => this.fail(record, String(error)));
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, target) => { if (!navigationAllowed(target)) { event.preventDefault(); this.fail(record, "WB_UNSAFE_URL"); } });
    contents.on("will-redirect", (event, target) => { if (!navigationAllowed(target)) { event.preventDefault(); this.fail(record, "WB_UNSAFE_URL"); } });
    contents.on("did-start-loading", () => { state.loading = true; state.error = undefined; this.publish(record); });
    contents.on("did-stop-loading", () => { state.loading = false; this.publish(record); });
    contents.on("did-navigate", (_event, target) => { state.url = target; this.publish(record); });
    contents.on("did-navigate-in-page", (_event, target) => { state.url = target; this.publish(record); });
    contents.on("page-title-updated", (_event, title) => { state.title = title || state.url; this.publish(record); });
    contents.on("did-fail-load", (_event, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) this.fail(record, `${description} (${code})`); });
    contents.on("render-process-gone", (_event, details) => this.fail(record, `WB_BROWSER_PROCESS: ${details.reason}`));
    contents.on("console-message", (event) => {
      if (!new Set(["error", "warning"]).has(event.level)) return;
      state.consoleErrors.push({ message: event.message.slice(0, 4000), source: event.sourceId.slice(0, 2000), line: event.lineNumber, at: Date.now() });
      state.consoleErrors = state.consoleErrors.slice(-100);
      this.publish(record);
    });
    contents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;
      let action: Extract<WorkbenchEvent, { type: "shortcut" }>["action"] | undefined;
      if ((input.control || input.meta) && input.key.toLowerCase() === "w") action = "close";
      if (input.control && input.key === "Tab") action = input.shift ? "previous" : "next";
      if ((input.control || input.meta) && input.key.toLowerCase() === "l") action = "address";
      if (input.key === "Escape" && !state.annotationMode) action = "chat";
      if (action) { event.preventDefault(); this.options.getWindow()?.webContents.focus(); this.options.emit({ kind: "workbench", scope, type: "shortcut", tabId: id, action }); }
    });
    if (normalized) void contents.loadURL(normalized).catch((error: unknown) => { if (!String(error).includes("ERR_ABORTED")) this.fail(record, String(error)); });
    return { ...state };
  }

  private get(scope: WorkbenchScope, id: string): BrowserRecord {
    const record = this.browsers.get(id);
    if (!record || record.view.webContents.isDestroyed()) throw new Error("WB_BROWSER_GONE");
    if (workbenchScopeKey(record.scope) !== workbenchScopeKey(scope)) throw new Error("WB_SCOPE_MISMATCH");
    return record;
  }
  has(id: string): boolean { return this.browsers.has(id); }
  read(scope: WorkbenchScope, id: string): WorkbenchBrowser { return { ...this.get(scope, id).state }; }
  async navigate(scope: WorkbenchScope, id: string, url: string): Promise<WorkbenchBrowser> {
    const target = safeBrowserUrl(url);
    if (!this.allowed(target, scope)) throw new Error("WB_BROWSER_INTERNAL_BLOCKED");
    const record = this.get(scope, id);
    if (!record.artifactPolicy.allows(target)) throw new Error("WB_BROWSER_INTERNAL_BLOCKED");
    record.artifactPolicy.observe(target);
    record.state.url = target; record.state.error = undefined;
    void record.view.webContents.loadURL(target).catch((error: unknown) => { if (!String(error).includes("ERR_ABORTED")) this.fail(record, String(error)); });
    return this.read(scope, id);
  }
  navigation(scope: WorkbenchScope, id: string, action: "back" | "forward" | "reload"): WorkbenchBrowser {
    const { view } = this.get(scope, id);
    if (action === "reload") view.webContents.reload();
    else if (action === "back" && view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack();
    else if (action === "forward" && view.webContents.navigationHistory.canGoForward()) view.webContents.navigationHistory.goForward();
    return this.read(scope, id);
  }
  bounds(scope: WorkbenchScope, id: string, bounds: WorkbenchBounds): void {
    const record = this.get(scope, id);
    const window = this.options.getWindow();
    if (!window || window.isDestroyed()) return;
    if (!bounds.visible) { record.view.setVisible(false); return; }
    this.hideAll();
    if (record.attached !== window) {
      record.attached?.contentView.removeChildView(record.view);
      window.contentView.addChildView(record.view);
      record.attached = window;
    }
    const zoom = window.webContents.getZoomFactor();
    const [width, height] = window.getContentSize();
    const x = Math.min(width, Math.round(bounds.x * zoom));
    const y = Math.min(height, Math.round(bounds.y * zoom));
    record.view.setBounds({ x, y, width: Math.max(0, Math.min(width - x, Math.round(bounds.width * zoom))), height: Math.max(0, Math.min(height - y, Math.round(bounds.height * zoom))) });
    record.view.setVisible(true);
  }
  annotate(scope: WorkbenchScope, id: string, mode?: "element" | "region"): WorkbenchBrowser {
    const record = this.get(scope, id);
    record.state.annotationMode = mode;
    record.view.webContents.send("workbench:annotation-mode", mode ?? null);
    this.publish(record);
    return this.read(scope, id);
  }
  private async captureAnnotation(record: BrowserRecord, value: unknown): Promise<void> {
    if (!record.state.annotationMode || !value || typeof value !== "object") return;
    const data = value as { rect?: { x: number; y: number; width: number; height: number }; viewport?: { width: number; height: number; scrollX: number; scrollY: number }; selector?: string; evidence?: string };
    if (!data.rect || !data.viewport || ![data.rect.x, data.rect.y, data.rect.width, data.rect.height, data.viewport.width, data.viewport.height, data.viewport.scrollX, data.viewport.scrollY].every((value) => typeof value === "number" && Number.isFinite(value))) return;
    const { width, height } = record.view.getBounds();
    const x = Math.max(0, Math.min(width - 1, Math.floor(data.rect.x)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(data.rect.y)));
    const rect = { x, y, width: Math.max(1, Math.min(width - x, Math.ceil(data.rect.width))), height: Math.max(1, Math.min(height - y, Math.ceil(data.rect.height))) };
    const captured = await record.view.webContents.capturePage(rect);
    const image = captured.getSize().width > 1200 ? captured.resize({ width: 1200 }) : captured;
    const screenshot = image.toDataURL();
    const feedback: WorkbenchFeedback = {
      id: randomUUID(), kind: "browser", comment: "", selected: true, createdAt: Date.now(),
      source: { url: record.view.webContents.getURL(), title: record.state.title,
        selector: typeof data.selector === "string" ? data.selector.slice(0, 4000) : undefined,
        rect: { ...rect, x: rect.x + (Number(data.viewport.scrollX) || 0), y: rect.y + (Number(data.viewport.scrollY) || 0) }, viewport: data.viewport },
      evidence: typeof data.evidence === "string" ? data.evidence.slice(0, 4000) : "",
      ...(screenshot.length < 6_000_000 ? { screenshot } : {}),
    };
    record.state.annotationMode = undefined;
    record.view.setVisible(false);
    this.options.getWindow()?.webContents.focus();
    this.options.emit({ kind: "workbench", scope: record.scope, type: "annotation", tabId: record.state.id, feedback });
    this.publish(record);
  }
  hideAll(): void { for (const record of this.browsers.values()) record.view.setVisible(false); }
  close(scope: WorkbenchScope, id: string): void {
    if (!this.has(id)) return;
    const record = this.get(scope, id);
    if (record.attached && !record.attached.isDestroyed()) record.attached.contentView.removeChildView(record.view);
    record.view.webContents.close({ waitForBeforeUnload: false });
    this.browsers.delete(id);
  }
  closeAll(): void { for (const [id, record] of this.browsers) this.close(record.scope, id); }
}
