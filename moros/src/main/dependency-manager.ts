import type {
  DependencyId,
  DependencyInstallProgress,
  DependencyResource,
  DependencySnapshot,
  RuntimePrerequisites,
} from "../shared/types.ts";
import { resolve } from "node:path";
import { getDependencyCatalogItem, type DependencyCatalogItem } from "./dependencies/catalog.ts";
import {
  inspectDependencyResources,
} from "./dependencies/inventory.ts";
import {
  dependencyAbortError,
} from "./dependencies/process.ts";
import {
  installGitWithWinget,
  prepareDependencyInstaller,
} from "./dependencies/installer.ts";

export interface DependencyInstallRuntime {
  platform: NodeJS.Platform;
  prepareInstaller: typeof prepareDependencyInstaller;
  installGit: typeof installGitWithWinget;
}

export interface DependencyManagerOptions {
  rootDir: string;
  openPath: (path: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  onProgress: (progress: DependencyInstallProgress) => void;
  installRuntime?: Partial<DependencyInstallRuntime>;
}

interface ActiveInstallTask {
  controller: AbortController;
  dependencyId: DependencyId;
  generation: number;
  phase: "cancelable" | "irreversible";
}

export interface DependencySnapshotOptions {
  force?: boolean;
  /** Reuse an existing inventory after its normal refresh interval has elapsed. */
  allowStale?: boolean;
}

const INVENTORY_CACHE_MS = 10_000;
const INSTALL_COMPLETION_PHASES = new Set<DependencyInstallProgress["phase"]>([
  "awaiting-user",
  "installing",
  "launching",
]);

export function shouldRefreshDependencyInventory(
  hasCachedItems: boolean,
  cachedAt: number,
  now: number,
  options: DependencySnapshotOptions = {},
): boolean {
  if (options.force || !hasCachedItems) return true;
  return !options.allowStale && now - cachedAt > INVENTORY_CACHE_MS;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 600);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class DependencyManager {
  private readonly rootDir: string;
  private readonly openPath: DependencyManagerOptions["openPath"];
  private readonly openExternal: DependencyManagerOptions["openExternal"];
  private readonly onProgress: DependencyManagerOptions["onProgress"];
  private readonly installRuntime: DependencyInstallRuntime;
  private readonly installs = new Map<DependencyId, DependencyInstallProgress>();
  private readonly tasks = new Map<DependencyId, ActiveInstallTask>();
  private cachedItems?: DependencyResource[];
  private cachedAt = 0;
  private nextGeneration = 0;
  private shutDown = false;

  constructor(options: DependencyManagerOptions) {
    this.rootDir = resolve(options.rootDir);
    this.openPath = options.openPath;
    this.openExternal = options.openExternal;
    this.onProgress = options.onProgress;
    this.installRuntime = {
      platform: options.installRuntime?.platform ?? process.platform,
      prepareInstaller: options.installRuntime?.prepareInstaller ?? prepareDependencyInstaller,
      installGit: options.installRuntime?.installGit ?? installGitWithWinget,
    };
  }

  private updateProgress(
    dependencyId: DependencyId,
    progress: Omit<DependencyInstallProgress, "dependencyId" | "updatedAt">,
  ): DependencyInstallProgress {
    const next: DependencyInstallProgress = {
      dependencyId,
      ...progress,
      updatedAt: Date.now(),
    };
    this.installs.set(dependencyId, next);
    this.onProgress(next);
    return next;
  }

  private invalidateInventory(): void {
    this.cachedItems = undefined;
    this.cachedAt = 0;
  }

  async snapshot(
    prerequisites: RuntimePrerequisites,
    options: DependencySnapshotOptions = {},
  ): Promise<DependencySnapshot> {
    if (shouldRefreshDependencyInventory(Boolean(this.cachedItems), this.cachedAt, Date.now(), options)) {
      this.cachedItems = await inspectDependencyResources(prerequisites);
      this.cachedAt = Date.now();
      for (const item of this.cachedItems) {
        const progress = this.installs.get(item.id);
        if (
          item.availability === "installed"
          && progress
          && INSTALL_COMPLETION_PHASES.has(progress.phase)
        ) {
          this.updateProgress(item.id, {
            phase: "completed",
            progress: 1,
            sessionId: progress.sessionId,
            artifactPath: progress.artifactPath,
          });
        }
      }
    }
    const cachedItems = this.cachedItems;
    if (!cachedItems) throw new Error("Dependency inventory is unavailable.");
    return {
      items: cachedItems.map((item) => ({ ...item })),
      installs: Array.from(this.installs.values(), (progress) => ({ ...progress })),
      checkedAt: this.cachedAt || Date.now(),
    };
  }

  async openSource(dependencyId: DependencyId): Promise<void> {
    const item = getDependencyCatalogItem(dependencyId);
    if (!item) throw new Error(`Unknown dependency: ${dependencyId}`);
    await this.openExternal(item.documentationUrl);
  }

  startInstall(dependencyId: DependencyId, sessionId?: string): { ok: boolean; error?: string } {
    const item = getDependencyCatalogItem(dependencyId);
    if (!item) return { ok: false, error: `Unknown dependency: ${dependencyId}` };
    if (this.shutDown) return { ok: false, error: "Dependency installation is shutting down." };
    if (this.tasks.has(dependencyId)) return { ok: false, error: `${item.name} is already being installed.` };
    const task: ActiveInstallTask = {
      controller: new AbortController(),
      dependencyId,
      generation: ++this.nextGeneration,
      phase: "cancelable",
    };
    this.tasks.set(dependencyId, task);
    this.updateProgress(dependencyId, { phase: "queued", progress: 0, sessionId });
    void this.runInstall(item, task, sessionId)
      .catch((error: unknown) => {
        if (!this.isCurrentTask(task)) return;
        this.updateProgress(dependencyId, isAbortError(error) || task.controller.signal.aborted
          ? { phase: "cancelled", sessionId }
          : { phase: "failed", sessionId, error: errorMessage(error) });
      })
      .finally(() => {
        if (this.tasks.get(dependencyId)?.generation === task.generation) {
          this.tasks.delete(dependencyId);
        }
      });
    return { ok: true };
  }

  cancelInstall(dependencyId: DependencyId): { ok: boolean; error?: string } {
    const task = this.tasks.get(dependencyId);
    if (!task) return { ok: false, error: "No active installation was found." };
    if (task.phase === "irreversible") {
      return {
        ok: false,
        error: "The installer or external page has already been launched and can no longer be cancelled.",
      };
    }
    if (task.controller.signal.aborted) {
      return { ok: false, error: "Dependency installation cancellation is already in progress." };
    }
    task.controller.abort();
    return { ok: true };
  }

  shutdown(): void {
    this.shutDown = true;
    for (const task of this.tasks.values()) {
      if (task.phase === "cancelable") task.controller.abort();
    }
    this.tasks.clear();
  }

  private isCurrentTask(task: ActiveInstallTask): boolean {
    return !this.shutDown
      && this.tasks.get(task.dependencyId)?.generation === task.generation;
  }

  private updateTaskProgress(
    task: ActiveInstallTask,
    progress: Omit<DependencyInstallProgress, "dependencyId" | "updatedAt">,
  ): boolean {
    if (!this.isCurrentTask(task)) return false;
    this.updateProgress(task.dependencyId, progress);
    return true;
  }

  private beginIrreversibleLaunch(
    task: ActiveInstallTask,
    progress: Omit<DependencyInstallProgress, "dependencyId" | "updatedAt">,
  ): void {
    if (!this.isCurrentTask(task) || task.controller.signal.aborted) {
      throw dependencyAbortError();
    }
    task.phase = "irreversible";
    this.updateProgress(task.dependencyId, progress);
  }

  private async openDocumentation(
    item: DependencyCatalogItem,
    task: ActiveInstallTask,
    sessionId?: string,
  ): Promise<void> {
    this.beginIrreversibleLaunch(task, { phase: "launching", progress: 1, sessionId });
    await this.openExternal(item.documentationUrl);
    this.updateTaskProgress(task, { phase: "awaiting-user", progress: 1, sessionId });
  }

  private async runInstall(
    item: DependencyCatalogItem,
    task: ActiveInstallTask,
    sessionId?: string,
  ): Promise<void> {
    const signal = task.controller.signal;
    if (item.installKind === "winget") {
      await this.installGitForWindows(item, task, sessionId);
      return;
    }
    if (item.installKind === "external") {
      await this.openDocumentation(item, task, sessionId);
      return;
    }
    if (this.installRuntime.platform !== "win32") {
      await this.openDocumentation(item, task, sessionId);
      return;
    }
    const installerPath = await this.installRuntime.prepareInstaller(
      item,
      this.rootDir,
      signal,
      (progress) => this.updateTaskProgress(task, { ...progress, sessionId }),
    );
    this.beginIrreversibleLaunch(task, {
      phase: "launching",
      progress: 1,
      sessionId,
      artifactPath: installerPath,
    });
    const launchError = await this.openPath(installerPath);
    if (!this.isCurrentTask(task)) return;
    if (launchError) throw new Error(launchError);
    this.invalidateInventory();
    this.updateTaskProgress(task, {
      phase: "awaiting-user",
      progress: 1,
      sessionId,
      artifactPath: installerPath,
    });
  }

  private async installGitForWindows(
    item: DependencyCatalogItem,
    task: ActiveInstallTask,
    sessionId?: string,
  ): Promise<void> {
    if (this.installRuntime.platform !== "win32") {
      await this.openDocumentation(item, task, sessionId);
      return;
    }
    // winget may hand installation off to an MSI or another child process.
    // Killing only the winget parent cannot prove that the system mutation was
    // cancelled, so cross the irreversible boundary before spawning it.
    this.beginIrreversibleLaunch(task, { phase: "installing", sessionId });
    const outcome = await this.installRuntime.installGit(task.controller.signal);
    if (!this.isCurrentTask(task)) return;
    if (outcome === "unavailable") {
      await this.openDocumentation(item, task, sessionId);
      return;
    }
    this.invalidateInventory();
    this.updateTaskProgress(task, { phase: "completed", progress: 1, sessionId });
  }
}
