import assert from "node:assert/strict";
import test from "node:test";
import { completeSessionRemoval } from "../src/main/session-removal-completion.ts";

test("successful archive and delete publish fresh state without exposing internal session IDs", async () => {
  let publishCalls = 0;
  const completion = {
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

  assert.equal(publishCalls, 2);
  assert.deepEqual(archiveResult, { ok: true });
  assert.deepEqual(deleteResult, { ok: true });
  assert.equal("sessionId" in archiveResult, false);
  assert.equal("sessionId" in deleteResult, false);
});

test("failed removal preserves its public error and does not publish", async () => {
  let published = false;
  const completion = {
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
  assert.equal(published, false);
});
