import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { SkillScope } from "../shared/types.ts";

const SKILL_LOCATIONS = [
  { folder: ".moros", source: "Moros" },
  { folder: ".agents", source: "Agent Skills" },
  { folder: ".codex", source: "Codex" },
  { folder: ".claude", source: "Claude Code" },
  { folder: ".cursor", source: "Cursor" },
  { folder: ".opencode", source: "OpenCode" },
  { folder: ".pi", source: "Pi" },
] as const;

const HARNESS_FOLDERS = new Set<string>(SKILL_LOCATIONS.map(({ folder }) => folder));
const SKIP_FOLDERS = new Set([
  "node_modules", "vendor", "out", "dist", "build", "coverage", "terminals",
]);

export interface SkillDiscoveryOptions {
  workspaceDir: string;
  additionalDirs?: readonly string[];
  homeDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface DiscoveredSkillSource {
  directory: string;
  source: string;
  scope: SkillScope;
}

export function skillDirectoryKey(path: string): string {
  let canonical = resolve(path);
  try {
    canonical = realpathSync.native(canonical);
  } catch {
    // A skill can disappear between discovery and a UI refresh.
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

export function discoverSkillDirs(root: string, maxDepth = 3): string[] {
  const found: string[] = [];
  const visited = new Set<string>();

  const walk = (dir: string, depth: number): void => {
    const key = skillDirectoryKey(dir);
    if (visited.has(key)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    visited.add(key);
    const manifest = entries.find((entry) => entry.name === "SKILL.md");
    let hasSkill = manifest?.isFile() ?? false;
    if (manifest?.isSymbolicLink()) {
      try {
        hasSkill = statSync(join(dir, "SKILL.md")).isFile();
      } catch {
        hasSkill = false;
      }
    }
    if (hasSkill) {
      found.push(dir);
      // Some skill bundles contain an explicit collection of child skills.
      if (depth < maxDepth) walk(join(dir, "skills"), depth + 1);
      return;
    }
    if (depth >= maxDepth) return;
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (HARNESS_FOLDERS.has(entry.name)) {
        walk(join(dir, entry.name, "skills"), depth + 1);
        continue;
      }
      if (SKIP_FOLDERS.has(entry.name) && !existsSync(join(dir, entry.name, "SKILL.md"))) continue;
      if (entry.name.startsWith(".") && entry.name !== ".system") continue;
      walk(join(dir, entry.name), depth + 1);
    }
  };

  walk(resolve(root), 0);
  return found;
}

function workspaceScopes(workspaceDir: string): string[] {
  const scopes: string[] = [];
  let current = resolve(workspaceDir);
  while (true) {
    scopes.push(current);
    if (existsSync(join(current, ".git"))) return scopes;
    const parent = dirname(current);
    if (parent === current) return [resolve(workspaceDir)];
    current = parent;
  }
}

function configuredPath(value: string | undefined, fallback: string, homeDir: string): string {
  const path = value?.trim() || fallback;
  return resolve(path.replace(/^~(?=[\\/]|$)/, homeDir));
}

export function discoverSkillSources({
  workspaceDir,
  additionalDirs = [],
  homeDir = homedir(),
  env = process.env,
}: SkillDiscoveryOptions): DiscoveredSkillSource[] {
  const sources: DiscoveredSkillSource[] = [];
  const seen = new Set<string>();
  const add = (root: string, source: string, scope: SkillScope, maxDepth = 6): void => {
    for (const directory of discoverSkillDirs(root, maxDepth)) {
      const key = skillDirectoryKey(directory);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ directory, source, scope });
    }
  };

  for (const scope of workspaceScopes(workspaceDir)) {
    for (const location of SKILL_LOCATIONS) {
      add(join(scope, location.folder, "skills"), location.source, "project");
    }
  }
  if (skillDirectoryKey(workspaceDir) !== skillDirectoryKey(homeDir)) {
    add(workspaceDir, "Workspace", "project", 3);
  }
  for (const directory of additionalDirs) add(directory, "Custom", "custom");

  const configHome = configuredPath(env.XDG_CONFIG_HOME, join(homeDir, ".config"), homeDir);
  const userRoots: Record<string, string> = {
    ".codex": configuredPath(env.CODEX_HOME, join(homeDir, ".codex"), homeDir),
    ".claude": configuredPath(env.CLAUDE_CONFIG_DIR, join(homeDir, ".claude"), homeDir),
    ".opencode": configuredPath(env.OPENCODE_CONFIG_DIR, join(configHome, "opencode"), homeDir),
    ".pi": join(homeDir, ".pi", "agent"),
  };
  for (const location of SKILL_LOCATIONS) {
    add(join(userRoots[location.folder] ?? join(homeDir, location.folder), "skills"), location.source, "user");
  }
  return sources;
}
