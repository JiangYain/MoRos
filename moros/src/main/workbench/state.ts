import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeWorkbenchResource } from "../../shared/workbench-contract.ts";
import { emptyWorkbench, workbenchScopeKey, type WorkbenchScope, type WorkbenchState, type WorkbenchTab } from "../../shared/workbench.ts";

export class WorkbenchStateRepository {
  private readonly states = new Map<string, WorkbenchState>();
  private readonly writes = new Map<string, Promise<void>>();
  private readonly loads = new Map<string, Promise<WorkbenchState>>();
  private readonly directory: string;
  constructor(directory: string) { this.directory = directory; }

  private path(scope: WorkbenchScope): string {
    return join(this.directory, `${createHash("sha256").update(workbenchScopeKey(scope)).digest("hex")}.json`);
  }

  async get(scope: WorkbenchScope): Promise<WorkbenchState> {
    const key = workbenchScopeKey(scope);
    const cached = this.states.get(key);
    if (cached) return cached;
    const pending = this.loads.get(key);
    if (pending) return pending;
    const load = this.load(scope, key);
    this.loads.set(key, load);
    try { return await load; } finally { this.loads.delete(key); }
  }

  private async load(scope: WorkbenchScope, key: string): Promise<WorkbenchState> {
    let state = emptyWorkbench(scope);
    try {
      const saved = JSON.parse(await readFile(this.path(scope), "utf8")) as WorkbenchState;
      if (workbenchScopeKey(saved.scope) === key && Array.isArray(saved.tabs)) {
        const tabs = saved.tabs.slice(0, 40).flatMap((tab): WorkbenchTab[] => {
          try {
            const legacyHome = tab.resource?.kind === "file" && tab.resource.path === "";
            const resource = decodeWorkbenchResource(legacyHome ? { kind: "files" } : tab.resource);
            return [{ id: String(tab.id), key: legacyHome ? "files" : String(tab.key), title: String(tab.title).slice(0, 200), resource }];
          }
          catch { return []; }
        });
        state = { ...state, open: Boolean(saved.open), collapsed: Boolean(saved.collapsed),
          width: Math.max(280, Math.min(1200, Number(saved.width) || 480)), tabs,
          activeTabId: tabs.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId : tabs[0]?.id ?? null,
          feedback: Array.isArray(saved.feedback) ? saved.feedback.filter((item) => typeof item.comment === "string" && item.source).slice(0, 40) : [],
          recentFiles: Array.isArray(saved.recentFiles) ? saved.recentFiles.filter((item) => typeof item.path === "string" && typeof item.openedAt === "number").slice(0, 20) : [],
          revision: Number(saved.revision) || 0,
        };
      } else throw new Error("Invalid saved workbench state.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("WB_STATE_READ_FAILED", { cause: error });
    }
    this.states.set(key, state);
    return state;
  }

  async fileGrants(scope: WorkbenchScope): Promise<Set<string>> {
    try {
      const saved: unknown = JSON.parse(await readFile(`${this.path(scope)}.grants`, "utf8"));
      if (!Array.isArray(saved) || !saved.every((path) => typeof path === "string" && !path.includes("\0"))) throw new Error("Invalid saved file grants.");
      return new Set(saved.slice(0, 200));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
      throw new Error("WB_STATE_READ_FAILED", { cause: error });
    }
  }

  async grantFile(scope: WorkbenchScope, path: string): Promise<Set<string>> {
    const grants = await this.fileGrants(scope);
    grants.add(path);
    await this.persist(`${this.path(scope)}.grants`, [...grants].slice(-200));
    return grants;
  }

  private async persist(path: string, value: unknown): Promise<void> {
    const content = JSON.stringify(value);
    await mkdir(this.directory, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async update(scope: WorkbenchScope, update: (state: WorkbenchState) => WorkbenchState): Promise<WorkbenchState> {
    const key = workbenchScopeKey(scope);
    let next: WorkbenchState;
    const task = (this.writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const current = await this.get(scope);
      next = { ...update(structuredClone(current)), scope, revision: current.revision + 1 };
      await this.persist(this.path(scope), next);
      this.states.set(key, next);
    });
    this.writes.set(key, task);
    try { await task; return next!; }
    finally { if (this.writes.get(key) === task) this.writes.delete(key); }
  }

  async flush(): Promise<void> { await Promise.all(this.writes.values()); }
}
