import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  DEFAULT_SUMMARY_MODEL,
  isAppLanguage,
  isCommandExplanationLanguage,
  isDependencyId,
  isPermissionMode,
  isThinkingLevel,
  type AppLanguage,
  type CommandExplanationLanguage,
  type DependencyId,
  type ModelSelection,
  type PermissionMode,
  type ThinkingLevel,
} from "@shared/types";
import { normalizeQuickPrompts } from "@shared/quick-prompts";

export interface AppSettings {
  language: AppLanguage;
  /** Language used by the summary model for command explanations. */
  commandExplanationLanguage: CommandExplanationLanguage;
  workspaceDir: string;
  /** Extra directories scanned for SKILL.md packages. */
  skillDirs: string[];
  /** Skill names hidden from the agent. */
  disabledSkills: string[];
  permissionMode: PermissionMode;
  defaultModel?: { provider: string; id: string };
  /** Lightweight model used to generate concise conversation titles. */
  summaryModel: ModelSelection;
  /** Model keys explicitly shown in the composer model picker. */
  enabledModels: string[];
  thinkingLevel?: ThinkingLevel;
  /** User-defined shortcuts shown beside the composer. Undefined uses localized defaults. */
  quickPrompts?: string[];
  /** User-selected executables for dependencies that may have parallel installations. */
  dependencyExecutablePaths?: Partial<Record<DependencyId, string>>;
}

function normalizeDependencyExecutablePaths(
  value: unknown,
): Partial<Record<DependencyId, string>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const normalized: Partial<Record<DependencyId, string>> = {};
  for (const [id, candidate] of Object.entries(value)) {
    if (
      !isDependencyId(id)
      || typeof candidate !== "string"
      || !candidate.trim()
      || !isAbsolute(candidate.trim())
    ) continue;
    const path = candidate.trim();
    if (id === "phonak-target" && basename(path).toLowerCase() !== "target.exe") continue;
    normalized[id] = path;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function settingsPath(): string {
  return join(app.getPath("userData"), "compass-settings.json");
}

function defaultWorkspaceDir(): string {
  // In dev the app lives inside the FAI workspace; default to its parent so
  // sibling skill folders (e.g. phonak-target-control) are discovered.
  // import.meta.dirname is stable (= <project>/out/main) regardless of how
  // electron was launched, unlike app.getAppPath().
  if (!app.isPackaged) {
    const devParent = resolve(import.meta.dirname, "../../..");
    if (existsSync(devParent)) return devParent;
  }
  const parent = resolve(app.getAppPath(), "..");
  return existsSync(parent) ? parent : app.getPath("home");
}

export function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    language: "zh-CN",
    commandExplanationLanguage: "auto",
    workspaceDir: defaultWorkspaceDir(),
    skillDirs: [],
    disabledSkills: [],
    permissionMode: "full",
    enabledModels: [],
    summaryModel: { ...DEFAULT_SUMMARY_MODEL },
  };
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged = { ...defaults, ...parsed };
    if (!merged.workspaceDir || !existsSync(merged.workspaceDir)) {
      merged.workspaceDir = defaults.workspaceDir;
    }
    merged.skillDirs = (merged.skillDirs ?? []).filter((dir) => existsSync(dir));
    merged.enabledModels = [
      ...new Set(
        (Array.isArray(merged.enabledModels) ? merged.enabledModels : []).filter(
          (key): key is string => typeof key === "string" && key.length > 0,
        ),
      ),
    ];
    const quickPrompts = normalizeQuickPrompts(parsed.quickPrompts);
    if (quickPrompts) merged.quickPrompts = quickPrompts;
    else delete merged.quickPrompts;
    const dependencyExecutablePaths = normalizeDependencyExecutablePaths(
      parsed.dependencyExecutablePaths,
    );
    if (dependencyExecutablePaths) merged.dependencyExecutablePaths = dependencyExecutablePaths;
    else delete merged.dependencyExecutablePaths;
    if (
      !merged.summaryModel ||
      typeof merged.summaryModel.provider !== "string" ||
      typeof merged.summaryModel.id !== "string" ||
      !merged.summaryModel.provider.trim() ||
      !merged.summaryModel.id.trim()
    ) {
      merged.summaryModel = { ...DEFAULT_SUMMARY_MODEL };
    }
    if (!isPermissionMode(merged.permissionMode)) merged.permissionMode = defaults.permissionMode;
    if (!isAppLanguage(merged.language)) merged.language = defaults.language;
    if (!isCommandExplanationLanguage(merged.commandExplanationLanguage)) {
      merged.commandExplanationLanguage = defaults.commandExplanationLanguage;
    }
    if (merged.thinkingLevel !== undefined && !isThinkingLevel(merged.thinkingLevel)) {
      delete merged.thinkingLevel;
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: AppSettings): void {
  const file = settingsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
}
