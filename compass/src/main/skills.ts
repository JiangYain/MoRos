import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Find skill package directories (containing SKILL.md) under a root folder.
 * Shallow recursive walk, depth-limited, skipping noise directories.
 */
export function discoverSkillDirs(root: string, maxDepth = 3): string[] {
  const found: string[] = [];
  if (!existsSync(root)) return found;

  const skip = new Set(["node_modules", ".git", "out", "dist", ".codex", ".cursor", "terminals"]);

  const walk = (dir: string, depth: number): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === "SKILL.md")) {
      found.push(dir);
      return; // a skill root; don't descend further
    }
    if (depth >= maxDepth) return;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
      walk(join(dir, entry.name), depth + 1);
    }
  };

  walk(root, 0);
  return found;
}
