import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  extractSessionLineText,
  searchSessionContentFiles,
  type SearchableSessionFile,
} from "../src/main/session-content-search.ts";

function sessionLine(role: "user" | "assistant", content: unknown): string {
  return JSON.stringify({
    type: "message",
    id: "entry-1",
    parentId: null,
    timestamp: "2026-08-12T00:00:00.000Z",
    message: { role, content, timestamp: 1 },
  });
}

function writeSession(path: string, lines: string[]): void {
  const header = JSON.stringify({ type: "session", id: "header", timestamp: "2026-08-12T00:00:00.000Z", cwd: "C:\\workspace" });
  writeFileSync(path, `${header}\n${lines.join("\n")}\n`, "utf8");
}

function withSessionDirectory(
  run: (sessionDir: string) => Promise<void>,
): Promise<void> {
  const sessionDir = mkdtempSync(join(tmpdir(), "compass-session-search-"));
  return run(sessionDir).finally(() => rmSync(sessionDir, { recursive: true, force: true }));
}

test("finds text matches case-insensitively and reports a snippet", () => withSessionDirectory(async (sessionDir) => {
  const first = join(sessionDir, "first.jsonl");
  const second = join(sessionDir, "second.jsonl");
  writeSession(first, [
    sessionLine("user", "Please open Phonak TARGET and wait for the main window."),
  ]);
  writeSession(second, [
    sessionLine("assistant", [{ type: "text", text: "No fitting software mentioned here." }]),
  ]);
  const sessions: SearchableSessionFile[] = [
    { id: "first", path: first, modifiedAt: 100 },
    { id: "second", path: second, modifiedAt: 200 },
  ];

  const matches = await searchSessionContentFiles("phonak target", sessions, { sessionDir });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "first");
  assert.equal(matches[0].path, first);
  assert.match(matches[0].snippet, /Phonak TARGET/);
}));

test("orders matches by most recent modification and respects the result cap", () => withSessionDirectory(async (sessionDir) => {
  const older = join(sessionDir, "older.jsonl");
  const newer = join(sessionDir, "newer.jsonl");
  writeSession(older, [sessionLine("user", "shared keyword one")]);
  writeSession(newer, [sessionLine("user", "shared keyword two")]);
  const sessions: SearchableSessionFile[] = [
    { id: "older", path: older, modifiedAt: 100 },
    { id: "newer", path: newer, modifiedAt: 200 },
  ];

  const matches = await searchSessionContentFiles("shared keyword", sessions, { sessionDir });
  assert.deepEqual(matches.map((match) => match.id), ["newer", "older"]);

  const capped = await searchSessionContentFiles("shared keyword", sessions, { sessionDir, maxResults: 1 });
  assert.deepEqual(capped.map((match) => match.id), ["newer"]);
}));

test("skips files that exceed the size budget", () => withSessionDirectory(async (sessionDir) => {
  const oversized = join(sessionDir, "oversized.jsonl");
  writeSession(oversized, [sessionLine("user", `needle ${"x".repeat(512)}`)]);

  const sessions: SearchableSessionFile[] = [{ id: "oversized", path: oversized, modifiedAt: 100 }];
  const matches = await searchSessionContentFiles("needle", sessions, { sessionDir, maxFileBytes: 64 });

  assert.deepEqual(matches, []);
}));

test("never reads listed entries that point outside the session directory", () => withSessionDirectory(async (sessionDir) => {
  const insideDir = join(sessionDir, "sessions");
  mkdirSync(insideDir);
  const inside = join(insideDir, "inside.jsonl");
  const outside = join(sessionDir, "outside.jsonl");
  writeSession(inside, [sessionLine("user", "escape needle inside")]);
  writeSession(outside, [sessionLine("user", "escape needle outside")]);

  const sessions: SearchableSessionFile[] = [
    { id: "inside", path: inside, modifiedAt: 200 },
    { id: "outside", path: join(insideDir, "..", "outside.jsonl"), modifiedAt: 300 },
  ];
  const matches = await searchSessionContentFiles("escape needle", sessions, { sessionDir: insideDir });

  assert.deepEqual(matches.map((match) => match.id), ["inside"]);
}));

test("short queries and non-message lines never match", () => withSessionDirectory(async (sessionDir) => {
  const path = join(sessionDir, "session.jsonl");
  writeSession(path, [
    JSON.stringify({ type: "session_info", id: "info", parentId: null, timestamp: "2026-08-12T00:00:00.000Z", name: "needle in the name" }),
    sessionLine("user", "regular text"),
    "{not json",
  ]);
  const sessions: SearchableSessionFile[] = [{ id: "one", path, modifiedAt: 100 }];

  assert.deepEqual(await searchSessionContentFiles(" a ", sessions, { sessionDir }), []);
  assert.deepEqual(await searchSessionContentFiles("needle", sessions, { sessionDir }), []);

  assert.equal(extractSessionLineText(sessionLine("user", "hello")), "hello");
  assert.equal(
    extractSessionLineText(sessionLine("assistant", [
      { type: "thinking", thinking: "hidden" },
      { type: "text", text: "visible" },
    ])),
    "visible",
  );
  assert.equal(extractSessionLineText("{}"), undefined);
}));

test("long matched text is clipped to a compact snippet around the hit", () => withSessionDirectory(async (sessionDir) => {
  const path = join(sessionDir, "session.jsonl");
  const text = `${"a".repeat(120)} snippet-center ${"b".repeat(120)}`;
  writeSession(path, [sessionLine("user", text)]);
  const sessions: SearchableSessionFile[] = [{ id: "one", path, modifiedAt: 100 }];

  const matches = await searchSessionContentFiles("snippet-center", sessions, { sessionDir });

  assert.equal(matches.length, 1);
  const snippet = matches[0].snippet;
  assert.ok(snippet.startsWith("…"));
  assert.ok(snippet.endsWith("…"));
  assert.match(snippet, /snippet-center/);
  assert.ok(snippet.length < 120);
}));
