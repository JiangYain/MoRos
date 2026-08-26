import assert from "node:assert/strict";
import test from "node:test";
import type { UiSessionInfo } from "../src/shared/types.ts";
import {
  buildWorkspaceSessionGroups,
  workspaceKeyForPath,
} from "../src/renderer/src/components/sidebar/workspace-session-groups.ts";

function session(
  id: string,
  cwd: string | null,
  modifiedAt: number,
): UiSessionInfo {
  return {
    id,
    path: `C:\\sessions\\${id}.jsonl`,
    cwd,
    firstMessage: id,
    createdAt: modifiedAt,
    modifiedAt,
    messageCount: 1,
  };
}

test("groups sessions by canonical workspace and keeps unknown cwd stable", () => {
  const pinnedKey = workspaceKeyForPath("C:\\work\\two");
  const groups = buildWorkspaceSessionGroups({
    currentWorkspaceDir: "C:\\work\\one\\",
    legacyWorkspaceName: "Legacy sessions",
    pinned: { [pinnedKey]: true },
    sessions: [
      session("one-old", "C:\\work\\one", 10),
      session("one-new", "c:\\work\\one\\", 30),
      session("two", "C:\\work\\two", 20),
      session("legacy", null, 40),
    ],
  });

  assert.equal(groups.length, 3);
  assert.equal(groups[0].workspacePath, "C:\\work\\two");
  assert.equal(groups[0].isPinned, true);
  const current = groups.find((group) => group.isCurrent);
  assert.ok(current);
  assert.deepEqual(current.sessions.map((item) => item.id), ["one-new", "one-old"]);
  const legacy = groups.find((group) => group.workspacePath === null);
  assert.equal(legacy?.workspaceName, "Legacy sessions");
  assert.equal(legacy?.isCurrent, false);
});

test("adds the current empty workspace without re-homing legacy sessions", () => {
  const groups = buildWorkspaceSessionGroups({
    currentWorkspaceDir: "/work/current",
    legacyWorkspaceName: "Legacy sessions",
    pinned: {},
    sessions: [session("legacy", null, 10)],
  });

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.isCurrent)?.workspacePath, "/work/current");
  assert.equal(groups.find((group) => group.workspacePath === null)?.sessions[0]?.id, "legacy");
});
