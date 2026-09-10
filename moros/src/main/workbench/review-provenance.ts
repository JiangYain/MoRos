import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { ReviewFile, WorkbenchScope } from "../../shared/workbench.ts";
import { workbenchScopeKey } from "../../shared/workbench.ts";
import { runGit, repositoryRoot } from "./git-process.ts";
import { insideDirectory } from "./paths.ts";

export interface WorkingSnapshot { at: number; root: string; files: Map<string, string>; hashes: Map<string, string>; dirty: Set<string>; limited: boolean }
interface TurnRecord { before: WorkingSnapshot; after?: WorkingSnapshot; writes: Map<string, string>; activeTools: Map<string, { path: string; expected?: string }> }

export async function snapshotWorkingTree(root: string, pathspec: string[] = []): Promise<WorkingSnapshot> {
  const [tracked, untracked, dirty] = await Promise.all([
    runGit(root, ["ls-files", "-z", "--", ...pathspec]), runGit(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...pathspec]),
    runGit(root, ["diff", "HEAD", "--name-only", "-z", "--", ...pathspec], undefined, true),
  ]);
  const snapshot: WorkingSnapshot = { at: Date.now(), root, files: new Map(), hashes: new Map(), dirty: new Set([...dirty.split("\0"), ...untracked.split("\0")].filter(Boolean)), limited: false };
  const paths = [...new Set([...tracked.split("\0"), ...untracked.split("\0")].filter(Boolean))];
  let bytes = 0;
  for (const path of paths.slice(0, 3000)) {
    if (bytes > 30_000_000) { snapshot.limited = true; break; }
    try {
      const target = resolve(root, path);
      if (!insideDirectory(root, target)) continue;
      const info = await lstat(target);
      if (!info.isFile() || info.size > 2_000_000) { snapshot.limited = true; continue; }
      const content = await readFile(target);
      bytes += content.length;
      snapshot.hashes.set(path, createHash("sha256").update(content).digest("hex"));
      if (!content.includes(0)) snapshot.files.set(path, content.toString("utf8"));
      else snapshot.limited = true;
    } catch { /* Deleted paths are represented by their absence. */ }
  }
  if (paths.length > 3000) snapshot.limited = true;
  return snapshot;
}

export class ReviewProvenance {
  private readonly turns = new Map<string, TurnRecord>();
  async begin(scope: WorkbenchScope): Promise<void> {
    try {
      const root = await repositoryRoot(scope.workspaceDir);
      this.turns.set(workbenchScopeKey(scope), { before: await snapshotWorkingTree(root), writes: new Map(), activeTools: new Map() });
    } catch { /* Chat remains available in a workspace without Git. */ }
  }
  async end(scope: WorkbenchScope): Promise<void> {
    const turn = this.turns.get(workbenchScopeKey(scope));
    if (turn) turn.after = await snapshotWorkingTree(turn.before.root);
  }
  async toolStart(scope: WorkbenchScope, callId: string, name: string, input: Record<string, unknown>): Promise<void> {
    const turn = this.turns.get(workbenchScopeKey(scope));
    if (!turn || !["write", "edit"].includes(name) || typeof input.path !== "string") return;
    const absolute = resolve(scope.workspaceDir, input.path);
    if (!insideDirectory(turn.before.root, absolute)) return;
    const path = relative(turn.before.root, absolute).replaceAll("\\", "/");
    let expected = name === "write" && typeof input.content === "string" ? input.content : undefined;
    if (name === "edit" && typeof input.oldText === "string" && typeof input.newText === "string") {
      try {
        const previous = await readFile(absolute, "utf8");
        if (previous.includes(input.oldText)) expected = previous.replace(input.oldText, input.newText);
      } catch { /* Unknown edits stay unattributed. */ }
    }
    turn.activeTools.set(callId, { path, expected });
  }
  async toolEnd(scope: WorkbenchScope, callId: string, failed: boolean): Promise<void> {
    const turn = this.turns.get(workbenchScopeKey(scope));
    const tool = turn?.activeTools.get(callId);
    if (!turn || !tool) return;
    turn.activeTools.delete(callId);
    if (failed || tool.expected === undefined) return;
    try {
      const bytes = await readFile(resolve(turn.before.root, tool.path));
      if (bytes.toString("utf8") === tool.expected) turn.writes.set(tool.path, createHash("sha256").update(bytes).digest("hex"));
    } catch { /* A concurrent removal cannot be attributed to this tool. */ }
  }
  get(scope: WorkbenchScope): TurnRecord | undefined { return this.turns.get(workbenchScopeKey(scope)); }
  classify(scope: WorkbenchScope, path: string, currentHash?: string): ReviewFile["ownership"] {
    const turn = this.get(scope);
    if (!turn) return "unknown";
    const before = turn.before.hashes.get(path);
    const written = turn.writes.get(path);
    if (written && written === currentHash) return turn.before.dirty.has(path) ? "mixed" : "agent";
    if (written) return "mixed";
    if (turn.before.dirty.has(path) && before === currentHash) return "preexisting";
    return "other";
  }
}
