import assert from "node:assert/strict";
import test from "node:test";
import { completeSessionRemoval } from "../src/main/session-removal-completion.ts";

test("successful archive and delete clear assignments without exposing internal session IDs", async () => {
  const cleared: string[] = [];
  let publishCalls = 0;
  const completion = {
    clearAssignment: (sessionId: string) => {
      cleared.push(sessionId);
    },
    publish: () => {
      publishCalls += 1;
    },
  };

  const archiveResult = await completeSessionRemoval(
    { ok: true, sessionId: "archived-session" },
    completion,
  );
  const deleteResult = await completeSessionRemoval(
    { ok: true, sessionId: "deleted-session" },
    completion,
  );

  assert.deepEqual(cleared, ["archived-session", "deleted-session"]);
  assert.equal(publishCalls, 2);
  assert.deepEqual(archiveResult, { ok: true });
  assert.deepEqual(deleteResult, { ok: true });
  assert.equal("sessionId" in archiveResult, false);
  assert.equal("sessionId" in deleteResult, false);
});

test("failed removal preserves its public error and does not clear an assignment", async () => {
  let cleared = false;
  let published = false;
  const completion = {
    clearAssignment: () => {
      cleared = true;
    },
    publish: () => {
      published = true;
    },
  };

  assert.deepEqual(
    await completeSessionRemoval(
      { ok: false, error: "filesystem failure" },
      completion,
    ),
    { ok: false, error: "filesystem failure" },
  );
  assert.equal(cleared, false);
  assert.equal(published, false);
});
