import { createHash, randomUUID } from "node:crypto";
import { readFile, lstat, unlink } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { createTwoFilesPatch } from "diff";
import type { ReviewFile, ReviewHunk, ReviewLine, ReviewSelection, WorkbenchConfirmation, WorkbenchResource, WorkbenchReview, WorkbenchScope } from "../../shared/workbench.ts";
import { repositoryRoot, resolveCommit, runGit } from "./git-process.ts";
import { insideDirectory } from "./paths.ts";
import { ReviewProvenance, snapshotWorkingTree } from "./review-provenance.ts";

type ReviewResource = Extract<WorkbenchResource, { kind: "review" }>;
interface ReviewSnapshot { review: WorkbenchReview; patches: Map<string, string>; untracked: Set<string> }
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

function decodePath(value: string): string {
  const raw = value.split("\t")[0].trim();
  if (raw.startsWith('"')) {
    if (!raw.endsWith('"')) throw new Error("WB_UNSUPPORTED_GIT_PATH");
    const chunks: Buffer[] = [];
    for (const token of raw.slice(1, -1).match(/\\[0-7]{1,3}|\\.|[^\\]+/g) ?? []) {
      if (/^\\[0-7]/.test(token)) chunks.push(Buffer.from([parseInt(token.slice(1), 8)]));
      else if (token.startsWith("\\")) {
        const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", a: "\x07", '"': '"', "\\": "\\" };
        if (!(token[1] in escapes)) throw new Error("WB_UNSUPPORTED_GIT_PATH");
        chunks.push(Buffer.from(escapes[token[1]]));
      } else chunks.push(Buffer.from(token));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return raw;
}

export function parseReviewPatch(patch: string, fallbackPath = ""): ReviewFile {
  const rawLines = patch.split("\n");
  const oldHeader = rawLines.find((line) => line.startsWith("--- "));
  const newHeader = rawLines.find((line) => line.startsWith("+++ "));
  const renamed = rawLines.find((line) => line.startsWith("rename to "));
  const oldPath = oldHeader ? decodePath(oldHeader.slice(4)).replace(/^a\//, "") : undefined;
  const newPath = newHeader ? decodePath(newHeader.slice(4)).replace(/^b\//, "") : undefined;
  const path = newPath && newPath !== "/dev/null" ? newPath : renamed ? decodePath(renamed.slice(10)) : oldPath && oldPath !== "/dev/null" ? oldPath : fallbackPath;
  const firstHunk = rawLines.findIndex((line) => line.startsWith("@@ "));
  const header = rawLines.slice(0, firstHunk < 0 ? rawLines.length : firstHunk).join("\n");
  const hunks: ReviewHunk[] = [];
  let current: ReviewHunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of rawLines.slice(firstHunk < 0 ? rawLines.length : firstHunk)) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (match) {
      current = { id: hash(`${path}\n${line}\n${hunks.length}`), header: line, lines: [], patch: `${header}\n${line}\n` };
      hunks.push(current);
      oldLine = Number(match[1]); newLine = Number(match[2]);
      continue;
    }
    if (!current || !line.length) continue;
    const row: ReviewLine = { kind: "meta", text: line };
    if (line[0] === "+") { row.kind = "add"; row.text = line.slice(1); row.newLine = newLine++; additions += 1; }
    else if (line[0] === "-") { row.kind = "delete"; row.text = line.slice(1); row.oldLine = oldLine++; deletions += 1; }
    else if (line[0] === " ") { row.kind = "context"; row.text = line.slice(1); row.oldLine = oldLine++; row.newLine = newLine++; }
    current.lines.push(row);
    current.patch += `${line}\n`;
  }
  return { path, oldPath: oldPath && oldPath !== path && oldPath !== "/dev/null" ? oldPath : undefined,
    status: oldPath === "/dev/null" ? "added" : newPath === "/dev/null" ? "deleted" : renamed ? "renamed" : "modified",
    additions, deletions, binary: /^(?:Binary files|GIT binary patch)/m.test(patch), hunks, ownership: "unknown" };
}

export class WorkbenchReviews {
  readonly provenance = new ReviewProvenance();
  private readonly confirmations = new Map<string, { scope: string; resource: ReviewResource; selection: ReviewSelection; expires: number }>();

  async read(scope: WorkbenchScope, resource: ReviewResource): Promise<WorkbenchReview> { return (await this.snapshot(scope, resource)).review; }

  private async snapshot(scope: WorkbenchScope, resource: ReviewResource): Promise<ReviewSnapshot> {
    const root = await repositoryRoot(scope.workspaceDir);
    const target = resource.path === undefined ? undefined : resolve(scope.workspaceDir, resource.path);
    if (target && (!insideDirectory(root, target) || resource.path?.includes("\0"))) throw new Error("WB_INVALID_PATH");
    const filter = target ? relative(root, target).replaceAll("\\", "/") : "";
    const pathspec = filter ? [filter] : [];
    const head = (await runGit(root, ["rev-parse", "--verify", "HEAD"], undefined, true)).trim() || undefined;
    const branch = (await runGit(root, ["branch", "--show-current"], undefined, true)).trim() || undefined;
    const patches = new Map<string, string>();
    const untracked = new Set<string>();
    let raw = "";
    let loadedCommit = false;
    let ref = resource.ref;
    let warning: string | undefined;
    let lastTurnAfter: Awaited<ReturnType<typeof snapshotWorkingTree>> | undefined;
    const baseline = this.provenance.get(scope);
    if (resource.range === "last-turn") {
      if (!baseline) throw new Error("WB_NO_TURN_BASELINE");
      const after = baseline.after ?? await snapshotWorkingTree(root, pathspec);
      lastTurnAfter = after;
      const paths = new Set([...baseline.before.files.keys(), ...after.files.keys()]);
      for (const path of paths) {
        if (filter && path !== filter && !path.startsWith(`${filter}/`)) continue;
        if ((baseline.before.hashes.has(path) && !baseline.before.files.has(path)) || (after.hashes.has(path) && !after.files.has(path))) continue;
        const beforeText = baseline.before.files.get(path) ?? "";
        const afterText = after.files.get(path) ?? "";
        if (beforeText === afterText) continue;
        patches.set(path, createTwoFilesPatch(`a/${path}`, `b/${path}`, beforeText, afterText, undefined, undefined, { context: 3 }));
      }
      warning = baseline.before.limited || after.limited ? "WB_BASELINE_LIMITED" : "WB_TURN_ATTRIBUTION";
    } else {
      const args = ["diff", "--no-ext-diff", "--no-textconv", "--binary", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/"];
      if (resource.range === "staged") args.push("--cached");
      if (resource.range === "branch") {
        if (!ref) {
          ref = (await runGit(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], undefined, true)).trim();
          if (!ref) {
            for (const candidate of ["refs/heads/main", "refs/heads/master"]) {
              if ((await runGit(root, ["show-ref", "--verify", candidate], undefined, true)).trim()) { ref = candidate; break; }
            }
          }
        }
        if (!ref) throw new Error("WB_REVIEW_REF_REQUIRED");
        const base = await resolveCommit(root, ref);
        const mergeBase = (await runGit(root, ["merge-base", base, "HEAD"])).trim();
        args.push(mergeBase, "HEAD");
      } else if (resource.range === "commit") {
        ref ||= "HEAD";
        const commit = await resolveCommit(root, ref);
        const parent = (await runGit(root, ["rev-parse", "--verify", `${commit}^`], undefined, true)).trim();
        if (parent) args.push(parent, commit);
        else {
          raw = await runGit(root, ["show", "--format=", "--no-ext-diff", "--no-textconv", "--binary", commit, "--", ...pathspec]);
          loadedCommit = true;
        }
      }
      if (!loadedCommit) raw = await runGit(root, [...args, "--", ...pathspec]);
      for (const chunk of raw.split(/(?=^diff --git )/m).filter(Boolean)) {
        const fallback = / b\/(.*)\n/.exec(chunk)?.[1] ?? "";
        const file = parseReviewPatch(chunk, fallback);
        if (file.path) patches.set(file.path, chunk);
      }
      if (resource.range === "unstaged") {
        const paths = (await runGit(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...pathspec])).split("\0").filter(Boolean);
        if (paths.length > 2000) throw new Error("WB_DIFF_TOO_LARGE");
        for (const path of paths) {
          const target = resolve(root, path);
          if (!insideDirectory(root, target)) continue;
          untracked.add(path);
          const info = await lstat(target);
          const content = info.isFile() && info.size <= 2_000_000 ? await readFile(target) : null;
          patches.set(path, content && !content.includes(0)
            ? createTwoFilesPatch("/dev/null", `b/${path}`, "", content.toString("utf8"), undefined, undefined, { context: 3 })
            : `diff --git a/${path} b/${path}\nnew file mode 100644\nBinary files /dev/null and b/${path} differ\n`);
        }
      }
    }
    const files: ReviewFile[] = [];
    const fingerprints: string[] = [];
    for (const [path, patch] of patches) {
      const file = parseReviewPatch(patch, path);
      if (!insideDirectory(root, resolve(root, file.path))) throw new Error("WB_INVALID_PATH");
      let currentHash = lastTurnAfter?.hashes.get(path);
      if (!lastTurnAfter) {
        try { const info = await lstat(resolve(root, path)); if (info.isFile() && info.size <= 2_000_000) currentHash = createHash("sha256").update(await readFile(resolve(root, path))).digest("hex"); } catch { /* Removed file. */ }
      }
      if (resource.range === "branch" || resource.range === "commit") file.ownership = "unknown";
      else if (resource.range === "staged" && baseline) {
        const stagedText = await runGit(root, ["show", `:${path}`], undefined, true);
        file.ownership = this.provenance.classify(scope, path, hash(stagedText));
      } else file.ownership = this.provenance.classify(scope, path, currentHash);
      let fingerprint = currentHash ?? "missing";
      if (!lastTurnAfter && !currentHash) { try { const info = await lstat(resolve(root, path)); fingerprint = `${info.size}:${info.mtimeMs}:${info.mode}`; } catch { /* Deleted file. */ } }
      fingerprints.push(`${path}:${fingerprint}`);
      files.push(file);
    }
    const version = hash(JSON.stringify([root, resource.range, ref, head, [...patches], fingerprints]));
    return { review: { root, range: resource.range, ref, head, branch, version, files, additions: files.reduce((n, file) => n + file.additions, 0), deletions: files.reduce((n, file) => n + file.deletions, 0), baselineAt: baseline?.before.at, warning }, patches, untracked };
  }

  private select(snapshot: ReviewSnapshot, selection: ReviewSelection): ReviewFile[] {
    if (selection.version !== snapshot.review.version) throw new Error("WB_STALE_DIFF");
    const paths = selection.paths ?? snapshot.review.files.map((file) => file.path);
    if (!paths.length || paths.some((path) => !snapshot.patches.has(path))) throw new Error("WB_INVALID_SELECTION");
    const files = snapshot.review.files.filter((file) => paths.includes(file.path));
    if (selection.hunkId && (files.length !== 1 || files[0].binary || files[0].status === "renamed" || !files[0].hunks.some((hunk) => hunk.id === selection.hunkId))) throw new Error("WB_INVALID_SELECTION");
    return files;
  }

  async mutate(scope: WorkbenchScope, resource: ReviewResource, action: "stage" | "unstage", selection: ReviewSelection): Promise<WorkbenchReview> {
    if ((action === "stage" && resource.range !== "unstaged") || (action === "unstage" && resource.range !== "staged")) throw new Error("WB_READ_ONLY_DIFF");
    const snapshot = await this.snapshot(scope, resource);
    const files = this.select(snapshot, selection);
    if (selection.hunkId) {
      const patch = files[0].hunks.find((hunk) => hunk.id === selection.hunkId)!.patch;
      await runGit(snapshot.review.root, ["apply", "--cached", ...(action === "unstage" ? ["--reverse"] : []), "--whitespace=nowarn", "-"], patch);
    } else if (action === "stage") {
      await runGit(snapshot.review.root, ["add", "--", ...files.flatMap((file) => file.oldPath ? [file.oldPath, file.path] : [file.path])]);
    } else if (snapshot.review.head) {
      await runGit(snapshot.review.root, ["restore", "--staged", "--", ...files.flatMap((file) => file.oldPath ? [file.oldPath, file.path] : [file.path])]);
    } else {
      await runGit(snapshot.review.root, ["rm", "--cached", "--", ...files.map((file) => file.path)]);
    }
    return this.read(scope, resource);
  }

  async prepareRevert(scope: WorkbenchScope, resource: ReviewResource, selection: ReviewSelection): Promise<WorkbenchConfirmation> {
    if (resource.range !== "unstaged") throw new Error("WB_REVERT_UNSTAGED_ONLY");
    const snapshot = await this.snapshot(scope, resource);
    const files = this.select(snapshot, selection);
    const token = randomUUID();
    this.confirmations.set(token, { scope: JSON.stringify(scope), resource, selection, expires: Date.now() + 120_000 });
    return { token, kind: "revert", paths: files.map((file) => file.path), hunkHeader: selection.hunkId ? files[0].hunks.find((hunk) => hunk.id === selection.hunkId)?.header : undefined, message: "WB_CONFIRM_REVERT" };
  }

  async revert(scope: WorkbenchScope, token: string): Promise<WorkbenchReview> {
    const confirmation = this.confirmations.get(token);
    this.confirmations.delete(token);
    if (!confirmation || confirmation.scope !== JSON.stringify(scope) || confirmation.expires < Date.now()) throw new Error("WB_CONFIRMATION_EXPIRED");
    const snapshot = await this.snapshot(scope, confirmation.resource);
    const files = this.select(snapshot, confirmation.selection);
    const trackedPatches: string[] = [];
    for (const file of files) {
      if (confirmation.selection.hunkId) trackedPatches.push(file.hunks.find((hunk) => hunk.id === confirmation.selection.hunkId)!.patch);
      else if (!snapshot.untracked.has(file.path)) trackedPatches.push(snapshot.patches.get(file.path)!);
    }
    const patch = trackedPatches.join("");
    if (patch) {
      await runGit(snapshot.review.root, ["apply", "--check", "--reverse", "--whitespace=nowarn", "-"], patch);
      await runGit(snapshot.review.root, ["apply", "--reverse", "--whitespace=nowarn", "-"], patch);
    }
    if (!confirmation.selection.hunkId) {
      for (const file of files.filter((file) => snapshot.untracked.has(file.path))) {
        const target = resolve(snapshot.review.root, file.path);
        if (!insideDirectory(snapshot.review.root, target)) throw new Error("WB_INVALID_PATH");
        await unlink(target);
      }
    }
    return this.read(scope, confirmation.resource);
  }
}
