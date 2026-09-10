import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat, mkdir, writeFile } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, extname, resolve, join } from "node:path";
import type { WorkbenchDirectory, WorkbenchFile } from "../../shared/workbench.ts";
import { insideDirectory, resolveWorkbenchFile } from "./paths.ts";
import { validateZipArchive } from "../dependencies/zip-validator.ts";

const TEXT_LIMIT = 2_000_000;
const BINARY_LIMIT = 25_000_000;
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif", ".bmp": "image/bmp" };
const LANGUAGES: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
  ".py": "python", ".r": "r", ".rs": "rust", ".go": "go", ".java": "java", ".c": "c", ".h": "c", ".cpp": "cpp", ".cs": "csharp",
  ".json": "json", ".jsonc": "json", ".yaml": "yaml", ".yml": "yaml", ".toml": "ini", ".ini": "ini", ".xml": "xml", ".html": "xml", ".htm": "xml", ".svg": "xml",
  ".css": "css", ".scss": "scss", ".sql": "sql", ".sh": "bash", ".ps1": "powershell", ".bat": "dos", ".md": "markdown", ".mdx": "markdown", ".txt": "plaintext", ".log": "plaintext", ".csv": "plaintext", ".tsv": "plaintext",
};

export async function readWorkbenchFile(root: string, path: string, grants?: ReadonlySet<string>): Promise<WorkbenchFile> {
  const canonical = await resolveWorkbenchFile(root, path, grants);
  const info = await stat(canonical);
  const extension = extname(canonical).toLowerCase();
  const base: WorkbenchFile = { path: canonical, name: basename(canonical), version: `${info.mtimeMs}:${info.size}`, size: info.size, modifiedAt: info.mtimeMs, format: "unsupported", mime: "application/octet-stream", language: LANGUAGES[extension] ?? "plaintext" };
  if (info.size > BINARY_LIMIT) return { ...base, reason: "WB_FILE_TOO_LARGE" };
  const bytes = await readFile(canonical);
  base.version = createHash("sha256").update(bytes).digest("hex");
  if (IMAGE_TYPES[extension]) return { ...base, format: "image", mime: IMAGE_TYPES[extension], dataUrl: `data:${IMAGE_TYPES[extension]};base64,${bytes.toString("base64")}` };
  if (extension === ".pdf") return { ...base, format: "pdf", mime: "application/pdf", dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}` };
  if (extension === ".docx") {
    await validateZipArchive(canonical, dirname(canonical), { maxEntries: 5000, maxExtractedBytes: 40_000_000 });
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ buffer: bytes });
    return { ...base, format: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", previewHtml: result.value, text: (await mammoth.extractRawText({ buffer: bytes })).value };
  }
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
  if (!utf16 && bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0)) return { ...base, reason: "WB_UNSUPPORTED_FORMAT" };
  if ([".doc", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".zip", ".exe", ".dll"].includes(extension)) return { ...base, reason: "WB_UNSUPPORTED_FORMAT" };
  const text = bytes.subarray(0, TEXT_LIMIT).toString(utf16 ? "utf16le" : "utf8").replace(/^\uFEFF/, "");
  return { ...base, format: [".md", ".mdx", ".markdown"].includes(extension) ? "markdown" : [".html", ".htm"].includes(extension) ? "html" : "text", mime: "text/plain", text, truncated: bytes.length > TEXT_LIMIT };
}

export async function readWorkbenchDirectory(root: string, path = root): Promise<WorkbenchDirectory> {
  const canonical = await realpath(resolve(root, path));
  if (!insideDirectory(root, canonical)) throw new Error("WB_OUTSIDE_WORKSPACE");
  const entries = await readdir(canonical, { withFileTypes: true });
  const allowed = entries.filter((entry) => entry.name !== ".git" && !entry.isSymbolicLink() && (entry.isDirectory() || entry.isFile()))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  return { path: canonical, truncated: allowed.length > 1000, entries: allowed.slice(0, 1000).map((entry) => ({ name: entry.name, path: join(canonical, entry.name), directory: entry.isDirectory() })) };
}

export async function searchWorkbenchFiles(root: string, query: string): Promise<WorkbenchDirectory> {
  const normalized = query.trim().toLocaleLowerCase();
  const pending = [root];
  const entries: WorkbenchDirectory["entries"] = [];
  let scanned = 0, truncated = false;
  const excluded = new Set(["node_modules", ".git", ".next", ".cache", "coverage"]);
  while (pending.length && scanned < 10_000 && entries.length < 100) {
    const directory = await readWorkbenchDirectory(root, pending.shift()!);
    truncated ||= directory.truncated;
    for (const entry of directory.entries) {
      scanned += 1;
      if (excluded.has(entry.name)) continue;
      if (entry.name.toLocaleLowerCase().includes(normalized)) entries.push(entry);
      if (entry.directory) pending.push(entry.path);
      if (entries.length >= 100 || scanned >= 10_000) break;
    }
  }
  return { path: root, entries, truncated: truncated || pending.length > 0 || entries.length >= 100 };
}

export async function createWorkbenchEntry(root: string, path: string, directory: boolean): Promise<string> {
  if (!path.trim() || path.includes("\0")) throw new Error("WB_INVALID_PATH");
  const target = resolve(root, path);
  const parent = await realpath(dirname(target));
  if (!insideDirectory(root, parent) || !insideDirectory(root, target)) throw new Error("WB_OUTSIDE_WORKSPACE");
  const canonical = join(parent, basename(target));
  if (directory) await mkdir(canonical);
  else await writeFile(canonical, "", { flag: "wx" });
  return canonical;
}

export class WorkbenchFileWatches {
  private readonly watchers = new Map<string, FSWatcher>();
  watch(id: string, path: string, changed: () => void): void {
    this.close(id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watcher = watch(dirname(path), { persistent: false }, (_event, filename) => {
      if (filename && filename.toString().toLowerCase() !== basename(path).toLowerCase()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(changed, 150);
    });
    watcher.on("error", changed);
    watcher.once("close", () => { if (timer) clearTimeout(timer); });
    this.watchers.set(id, watcher);
  }
  close(id: string): void { this.watchers.get(id)?.close(); this.watchers.delete(id); }
  closeAll(): void { for (const id of this.watchers.keys()) this.close(id); }
}
