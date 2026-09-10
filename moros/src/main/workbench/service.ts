import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename } from "node:path";
import {
  workbenchScopeKey, type WorkbenchEvent, type WorkbenchFeedback, type WorkbenchReply, type WorkbenchReplyFor, type WorkbenchRequest,
  type WorkbenchResource, type WorkbenchScope, type WorkbenchState, type WorkbenchTab,
} from "../../shared/workbench.ts";
import { WorkbenchStateRepository } from "./state.ts";
import { readWorkbenchFile, readWorkbenchDirectory, searchWorkbenchFiles, createWorkbenchEntry, WorkbenchFileWatches } from "./files.ts";
import { insideDirectory, resolveWorkbenchFile, safeBrowserUrl, workspaceRoot } from "./paths.ts";
import { WorkbenchReviews } from "./review.ts";
import type { WorkbenchTerminals } from "./terminals.ts";
import type { WorkbenchBrowsers } from "./browser.ts";
import type { WorkbenchArtifacts } from "./artifacts.ts";

export interface WorkbenchServiceOptions {
  directory: string;
  currentScope(): WorkbenchScope | undefined;
  emit(event: WorkbenchEvent): void;
  terminals: WorkbenchTerminals;
  browsers: WorkbenchBrowsers;
  artifacts: WorkbenchArtifacts;
  pickFile(root: string): Promise<string | undefined>;
  openFile(path: string): Promise<void>;
}

export class WorkbenchService {
  readonly reviews = new WorkbenchReviews();
  private readonly repository: WorkbenchStateRepository;
  private readonly roots = new Map<string, string>();
  private readonly grants = new Map<string, Set<string>>();
  private readonly watches = new WorkbenchFileWatches();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly closeConfirmations = new Map<string, { key: string; tabId: string; expires: number }>();
  private readonly options: WorkbenchServiceOptions;
  constructor(options: WorkbenchServiceOptions) { this.options = options; this.repository = new WorkbenchStateRepository(options.directory); }

  async register(scope: WorkbenchScope): Promise<void> {
    const key = workbenchScopeKey(scope);
    if (!this.roots.has(key)) {
      const [root, grants] = await Promise.all([workspaceRoot(scope.workspaceDir), this.repository.fileGrants(scope)]);
      this.roots.set(key, root);
      this.grants.set(key, grants);
    }
  }
  private async authorize(scope: WorkbenchScope): Promise<string> {
    const key = workbenchScopeKey(scope);
    const active = this.options.currentScope();
    if (active && workbenchScopeKey(active) === key) await this.register(scope);
    const root = this.roots.get(key);
    if (!root) throw new Error("WB_SCOPE_MISMATCH");
    return root;
  }
  private async update(scope: WorkbenchScope, mutate: (state: WorkbenchState) => WorkbenchState): Promise<WorkbenchState> {
    const state = await this.repository.update(scope, mutate);
    this.options.emit({ kind: "workbench", scope, type: "state", state });
    return state;
  }
  private tab(state: WorkbenchState, id: string): WorkbenchTab {
    const tab = state.tabs.find((tab) => tab.id === id);
    if (!tab) throw new Error("WB_TAB_GONE");
    return tab;
  }
  execute<R extends WorkbenchRequest>(request: R, actor?: "electron" | "web" | "agent"): Promise<WorkbenchReplyFor<R>>;
  async execute(request: WorkbenchRequest, actor: "electron" | "web" | "agent" = "electron"): Promise<WorkbenchReply> {
    await this.authorize(request.scope);
    if (["terminal", "browser", "file", "directory", "state"].includes(request.operation)) return this.perform(request, actor);
    const key = request.operation === "review" ? `review:${this.roots.get(workbenchScopeKey(request.scope))}` : workbenchScopeKey(request.scope);
    const task = (this.queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => this.perform(request, actor));
    this.queues.set(key, task);
    return task;
  }

  private async perform(request: WorkbenchRequest, actor: "electron" | "web" | "agent"): Promise<WorkbenchReply> {
    const { scope } = request;
    const key = workbenchScopeKey(scope);
    const root = this.roots.get(key)!;
    let state = await this.repository.get(scope);
    if (request.operation === "state") return { state };
    if (request.operation === "directory") return { directory: request.query?.trim() ? await searchWorkbenchFiles(root, request.query) : await readWorkbenchDirectory(root, request.path) };
    if (request.operation === "create-entry") {
      if (actor === "agent") throw new Error("WB_USER_ACTION_ONLY");
      const path = await createWorkbenchEntry(root, request.path, request.directory);
      return request.directory ? { directory: await readWorkbenchDirectory(root, path) } : this.open(scope, { kind: "file", path, line: 1 }, actor);
    }
    if (request.operation === "layout") {
      state = await this.update(scope, (current) => {
        const tabs = request.order ? request.order.map((id) => this.tab(current, id)) : current.tabs;
        if (tabs.length !== current.tabs.length || new Set(tabs.map((tab) => tab.id)).size !== tabs.length) throw new Error("WB_INVALID_TAB_ORDER");
        if (request.activeTabId) this.tab(current, request.activeTabId);
        return { ...current, tabs, ...(request.open !== undefined ? { open: request.open } : {}), ...(request.collapsed !== undefined ? { collapsed: request.collapsed } : {}), ...(request.width !== undefined ? { width: Math.max(280, Math.min(1200, request.width)) } : {}), ...(request.activeTabId ? { activeTabId: request.activeTabId } : {}) };
      });
      if (!state.open || state.collapsed) this.options.browsers.hideAll();
      return { state };
    }
    if (request.operation === "pick-file") {
      if (actor !== "electron") throw new Error("WB_NATIVE_PICKER_ONLY");
      const path = await this.options.pickFile(root);
      if (!path) return { state };
      const canonical = await realpath(path);
      this.grants.set(key, await this.repository.grantFile(scope, canonical));
      return this.open(scope, { kind: "file", path: canonical }, actor);
    }
    if (request.operation === "open") return this.open(scope, request.resource, actor);
    if (request.operation === "feedback") {
      state = await this.update(scope, (current) => {
        if (request.action === "add") {
          if (!request.feedback.comment.trim()) throw new Error("WB_COMMENT_REQUIRED");
          const feedback = [...current.feedback.filter((item) => item.id !== request.feedback.id), request.feedback];
          if (feedback.length > 40 || JSON.stringify(feedback).length > 16_000_000) throw new Error("WB_FEEDBACK_LIMIT");
          return { ...current, feedback };
        }
        const ids = new Set(request.ids);
        return { ...current, feedback: request.action === "remove" ? current.feedback.filter((item) => !ids.has(item.id)) : current.feedback.map((item) => ids.has(item.id) ? { ...item, ...(request.selected !== undefined ? { selected: request.selected } : {}), ...(request.comment !== undefined ? { comment: request.comment } : {}) } : item) };
      });
      return { state };
    }
    const tab = this.tab(state, request.tabId);
    if (request.operation === "close") {
      if (tab.resource.kind === "terminal" && this.options.terminals.isRunning(scope, tab.id)) {
        const confirmation = request.confirmation && this.closeConfirmations.get(request.confirmation);
        if (!confirmation || confirmation.key !== key || confirmation.tabId !== tab.id || confirmation.expires < Date.now()) {
          if (request.confirmation) throw new Error("WB_CONFIRMATION_EXPIRED");
          const token = randomUUID();
          this.closeConfirmations.set(token, { key, tabId: tab.id, expires: Date.now() + 120_000 });
          return { confirmation: { token, kind: "terminal-close", message: "WB_CONFIRM_TERMINAL" } };
        }
      }
      state = await this.update(scope, (current) => {
        const index = current.tabs.findIndex((item) => item.id === tab.id);
        const tabs = current.tabs.filter((item) => item.id !== tab.id);
        return { ...current, tabs, activeTabId: current.activeTabId === tab.id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null : current.activeTabId };
      });
      if (request.confirmation) this.closeConfirmations.delete(request.confirmation);
      if (tab.resource.kind === "terminal") this.options.terminals.close(scope, tab.id);
      if (tab.resource.kind === "browser") this.options.browsers.close(scope, tab.id);
      this.watches.close(tab.id);
      return { state };
    }
    if (request.operation === "file") {
      if (tab.resource.kind !== "file") throw new Error("WB_WRONG_TAB");
      const path = await resolveWorkbenchFile(root, tab.resource.path, this.grants.get(key));
      if (request.action === "open-system") { await this.options.openFile(path); return { done: true }; }
      const file = await readWorkbenchFile(root, path, this.grants.get(key));
      if (file.format === "html") {
        file.previewUrl = this.options.artifacts.url(scope, path, root);
        file.previewAssetsRestricted = !insideDirectory(root, path);
      }
      try { this.watches.watch(tab.id, path, () => this.options.emit({ kind: "workbench", scope, type: "file-changed", tabId: tab.id })); } catch { /* Manual refresh remains available. */ }
      return { file };
    }
    if (request.operation === "terminal") {
      if (tab.resource.kind !== "terminal") throw new Error("WB_WRONG_TAB");
      if (request.action === "input") this.options.terminals.input(scope, tab.id, request.data, actor === "agent" ? "agent" : "user");
      if (request.action === "resize") this.options.terminals.resize(scope, tab.id, request.cols, request.rows);
      return request.action === "read" ? { terminal: this.options.terminals.read(scope, tab.id, request.offset) } : { done: true };
    }
    if (request.operation === "browser") {
      if (tab.resource.kind !== "browser") throw new Error("WB_WRONG_TAB");
      if (actor === "web") throw new Error("WB_BROWSER_DESKTOP_ONLY");
      if (!this.options.browsers.has(tab.id)) this.options.browsers.create(scope, tab.id, tab.resource.url);
      if (request.action === "navigate") return { browser: await this.options.browsers.navigate(scope, tab.id, request.url) };
      if (request.action === "back" || request.action === "forward" || request.action === "reload") return { browser: this.options.browsers.navigation(scope, tab.id, request.action) };
      if (request.action === "bounds") { this.options.browsers.bounds(scope, tab.id, request.bounds); return { done: true }; }
      if (request.action === "annotate" || request.action === "cancel-annotation") return { browser: this.options.browsers.annotate(scope, tab.id, request.action === "annotate" ? request.mode : undefined) };
      return { browser: this.options.browsers.read(scope, tab.id) };
    }
    if (request.operation === "review") {
      if (tab.resource.kind !== "review") throw new Error("WB_WRONG_TAB");
      if (request.action === "read") return { review: await this.reviews.read(scope, tab.resource) };
      if (actor === "agent") throw new Error("WB_REVIEW_USER_ACTION_ONLY");
      if (request.action === "revert") return { review: await this.reviews.revert(scope, request.confirmation) };
      if (request.action === "prepare-revert") return { confirmation: await this.reviews.prepareRevert(scope, tab.resource, request.selection) };
      return { review: await this.reviews.mutate(scope, tab.resource, request.action, request.selection) };
    }
    throw new Error("Unknown workbench operation.");
  }

  private async open(scope: WorkbenchScope, resource: WorkbenchResource, actor: "electron" | "web" | "agent"): Promise<{ state: WorkbenchState }> {
    const scopeKey = workbenchScopeKey(scope);
    const root = this.roots.get(scopeKey)!;
    let normalized = resource;
    let resourceKey: string;
    let title: string;
    const state = await this.repository.get(scope);
    if (resource.kind === "files") {
      resourceKey = "files"; title = "Files";
    } else if (resource.kind === "file") {
      const path = await resolveWorkbenchFile(root, resource.path, this.grants.get(scopeKey));
      normalized = { ...resource, path }; resourceKey = `file:${process.platform === "win32" ? path.toLowerCase() : path}`; title = basename(path);
    } else if (resource.kind === "browser") {
      const url = resource.url ? safeBrowserUrl(resource.url) : "";
      normalized = { ...resource, url }; resourceKey = `browser:${url}`; title = url ? new URL(url).host : "";
    } else if (resource.kind === "review") {
      resourceKey = `review:${resource.range}:${resource.ref ?? ""}:${resource.path ?? ""}`; title = `Review · ${resource.range}`;
    } else {
      resourceKey = `terminal:${resource.terminalId ?? randomUUID()}`;
      title = resource.title || `Terminal ${state.tabs.filter((tab) => tab.resource.kind === "terminal").length + 1}`;
    }
    const existing = state.tabs.find((tab) => tab.key === resourceKey || (resource.kind === "terminal" && resource.terminalId === tab.id));
    const recentPath = normalized.kind === "file" ? normalized.path : "";
    const rememberFile = (current: WorkbenchState): WorkbenchState["recentFiles"] => recentPath
      ? [{ path: recentPath, openedAt: Date.now() }, ...(current.recentFiles ?? []).filter((item) => item.path !== recentPath)].slice(0, 20)
      : current.recentFiles;
    if (existing) {
      return { state: await this.update(scope, (current) => ({ ...current, open: true, collapsed: false, activeTabId: existing.id, recentFiles: rememberFile(current), tabs: current.tabs.map((tab) => tab.id === existing.id && resource.kind === "file" ? { ...tab, resource: normalized } : tab) })) };
    }
    if (state.tabs.length >= 40) throw new Error("WB_TAB_LIMIT");
    const id = randomUUID();
    if (resource.kind === "terminal") {
      if (resource.terminalId) throw new Error("WB_TERMINAL_GONE");
      this.options.terminals.create(scope, id, root, title);
      normalized = { ...resource, terminalId: id };
    }
    if (normalized.kind === "browser" && actor !== "web") this.options.browsers.create(scope, id, normalized.url);
    const tab: WorkbenchTab = { id, key: resourceKey, title, resource: normalized };
    try {
      return { state: await this.update(scope, (current) => ({ ...current, open: true, collapsed: false, activeTabId: id, recentFiles: rememberFile(current), tabs: [...current.tabs, tab] })) };
    } catch (error) {
      if (resource.kind === "terminal") this.options.terminals.close(scope, id);
      if (resource.kind === "browser" && actor !== "web") this.options.browsers.close(scope, id);
      throw error;
    }
  }

  async browserChanged(event: Extract<WorkbenchEvent, { type: "browser" }>): Promise<void> {
    const state = await this.repository.get(event.scope);
    const tab = state.tabs.find((tab) => tab.id === event.browser.id);
    if (!tab || tab.resource.kind !== "browser" || (tab.title === event.browser.title && tab.resource.url === event.browser.url)) return;
    await this.update(event.scope, (current) => ({ ...current, tabs: current.tabs.map((tab) => tab.id === event.browser.id ? { ...tab, title: event.browser.title.slice(0, 200), key: `browser:${event.browser.url}`, resource: { kind: "browser", url: event.browser.url } } : tab) }));
  }
  async takeFeedback(scope: WorkbenchScope, ids: string[]): Promise<WorkbenchFeedback[]> {
    await this.authorize(scope);
    let selected: WorkbenchFeedback[] = [];
    await this.update(scope, (current) => {
      selected = current.feedback.filter((item) => ids.includes(item.id));
      if (selected.length !== new Set(ids).size) throw new Error("WB_FEEDBACK_GONE");
      return { ...current, feedback: current.feedback.filter((item) => !ids.includes(item.id)) };
    });
    return selected;
  }
  async restoreFeedback(scope: WorkbenchScope, feedback: WorkbenchFeedback[]): Promise<void> {
    if (!feedback.length) return;
    await this.update(scope, (current) => ({ ...current, feedback: [...feedback.filter((item) => !current.feedback.some((other) => other.id === item.id)), ...current.feedback] }));
  }
  hideBrowsers(): void { this.options.browsers.hideAll(); }
  async shutdown(): Promise<void> { this.watches.closeAll(); this.options.browsers.closeAll(); this.options.terminals.closeAll(); await this.repository.flush(); }
}
