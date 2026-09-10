import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { prepareSessionForReconfiguration } from "../src/main/agent/session-reconfiguration.ts";

function fixture(t: TestContext): SessionManager {
  const root = mkdtempSync(join(tmpdir(), "moros-session-reconfigure-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, "workspace");
  mkdirSync(cwd);
  return SessionManager.create(cwd, join(root, "sessions"));
}

test("reconfiguration preserves an unwritten empty session's workspace, identity, and preferences", (t) => {
  const original = fixture(t);
  original.appendModelChange("openai", "fixture-model");
  original.appendThinkingLevelChange("high");
  original.appendSessionInfo("Fixture conversation");
  assert.equal(existsSync(original.getSessionFile()!), false);
  const source = prepareSessionForReconfiguration(original, "not persisted");
  assert.ok(source instanceof SessionManager);
  assert.notEqual(source, original);
  assert.equal(source.getCwd(), original.getCwd());
  assert.equal(source.getSessionId(), original.getSessionId());
  assert.equal(source.getSessionName(), original.getSessionName());
  assert.deepEqual(source.buildSessionContext(), original.buildSessionContext());
  assert.equal(existsSync(source.getSessionFile()!), false);
});

test("reconfiguration uses the validated file path for persisted sessions", (t) => {
  const original = fixture(t);
  const path = original.getSessionFile()!;
  writeFileSync(path, `${JSON.stringify(original.getHeader())}\n`, { flag: "wx" });
  const source = prepareSessionForReconfiguration(original, "not persisted");
  assert.equal(source, path);
  assert.equal(SessionManager.open(path).getCwd(), original.getCwd());
});

test("reconfiguration refuses to discard user content not yet persisted by Pi", (t) => {
  const original = fixture(t);
  original.appendMessage({ role: "user", content: "Unanswered fixture message", timestamp: 1 });
  assert.equal(existsSync(original.getSessionFile()!), false);
  assert.throws(() => prepareSessionForReconfiguration(original, "not persisted"), /not persisted/);
  assert.equal(original.buildSessionContext().messages.length, 1);
});
