import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface AppSettings {
  workspaceDir: string;
  /** Extra directories scanned for SKILL.md packages. */
  skillDirs: string[];
  /** Skill names hidden from the agent. */
  disabledSkills: string[];
  defaultModel?: { provider: string; id: string };
  thinkingLevel?: string;
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
    workspaceDir: defaultWorkspaceDir(),
    skillDirs: [],
    disabledSkills: [],
  };
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged = { ...defaults, ...parsed };
    if (!merged.workspaceDir || !existsSync(merged.workspaceDir)) {
      merged.workspaceDir = defaults.workspaceDir;
    }
    merged.skillDirs = (merged.skillDirs ?? []).filter((dir) => existsSync(dir));
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
