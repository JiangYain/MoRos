import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { SessionContentMatch } from "../shared/types.ts";

/**
 * Full-text lookup over persisted Pi session JSONL files. The caller supplies
 * the canonical session listing (id, path, modifiedAt) plus the directory that
 * owns those files; anything outside that directory is never read.
 */

export interface SearchableSessionFile {
  id: string;
  path: string;
  modifiedAt: number;
}

export interface SessionContentSearchOptions {
  /** Canonical directory that owns every searchable session file. */
  sessionDir: string;
  maxFileBytes?: number;
  maxResults?: number;
}

export const SESSION_CONTENT_QUERY_MIN_LENGTH = 2;
export const SESSION_CONTENT_MAX_RESULTS = 200;
export const SESSION_CONTENT_MAX_FILE_BYTES = 4 * 1024 * 1024;
const SNIPPET_CONTEXT_CHARS = 40;

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function isInsideDirectory(directory: string, path: string): boolean {
  const offset = relative(directory, path);
  return Boolean(offset) && !offset.startsWith("..") && !isAbsolute(offset);
}

/**
 * Extracts the searchable plain text of one JSONL line: user/assistant
 * message entries only, joining string content or text blocks.
 */
export function extractSessionLineText(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  let entry: unknown;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!entry || typeof entry !== "object") return undefined;
  const record = entry as { type?: unknown; message?: unknown };
  if (record.type !== "message" || !record.message || typeof record.message !== "object") {
    return undefined;
  }
  const message = record.message as { role?: unknown; content?: unknown };
  if (message.role !== "user" && message.role !== "assistant") return undefined;
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return undefined;
  const parts: string[] = [];
  for (const block of message.content) {
    if (!block || typeof block !== "object") continue;
    const candidate = block as { type?: unknown; text?: unknown };
    if (candidate.type === "text" && typeof candidate.text === "string") {
      parts.push(candidate.text);
    }
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function buildSnippet(text: string, matchIndex: number, matchLength: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, matchIndex + matchLength + SNIPPET_CONTEXT_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function findSnippetInJsonl(content: string, needle: string): string | undefined {
  for (const line of content.split("\n")) {
    const text = extractSessionLineText(line);
    if (!text) continue;
    const flattened = text.replace(/\s+/g, " ").trim();
    const matchIndex = normalizeForMatch(flattened).indexOf(needle);
    if (matchIndex < 0) continue;
    return buildSnippet(flattened, matchIndex, needle.length);
  }
  return undefined;
}

/**
 * Scans the listed session files for a case-insensitive text match, newest
 * first. Each file contributes at most one match; oversized and unreadable
 * files are skipped so a slow disk cannot stall the search.
 */
export async function searchSessionContentFiles(
  query: string,
  sessions: readonly SearchableSessionFile[],
  options: SessionContentSearchOptions,
): Promise<SessionContentMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < SESSION_CONTENT_QUERY_MIN_LENGTH) return [];
  const needle = normalizeForMatch(trimmed);
  const sessionDir = resolve(options.sessionDir);
  const maxFileBytes = options.maxFileBytes ?? SESSION_CONTENT_MAX_FILE_BYTES;
  const maxResults = options.maxResults ?? SESSION_CONTENT_MAX_RESULTS;

  const matches: SessionContentMatch[] = [];
  const ordered = [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt);
  for (const session of ordered) {
    if (matches.length >= maxResults) break;
    const resolvedPath = resolve(session.path);
    if (!isInsideDirectory(sessionDir, resolvedPath)) continue;
    let content: string;
    try {
      const info = await stat(resolvedPath);
      if (!info.isFile() || info.size > maxFileBytes) continue;
      content = await readFile(resolvedPath, "utf8");
    } catch {
      continue;
    }
    const snippet = findSnippetInJsonl(content, needle);
    if (snippet === undefined) continue;
    matches.push({ id: session.id, path: session.path, snippet });
  }
  return matches;
}
