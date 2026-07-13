import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  remainingConfirmationSeconds,
  startThreadConfirmationTimeout,
  THREAD_CONFIRMATION_DURATION_MS,
} from "../src/renderer/src/components/thread-confirmation.ts";

test("thread confirmation counts down from five seconds without going negative", () => {
  const startedAt = 10_000;
  const deadline = startedAt + THREAD_CONFIRMATION_DURATION_MS;

  assert.equal(remainingConfirmationSeconds(deadline, startedAt), 5);
  assert.equal(remainingConfirmationSeconds(deadline, startedAt + 1), 5);
  assert.equal(remainingConfirmationSeconds(deadline, startedAt + 1_000), 4);
  assert.equal(remainingConfirmationSeconds(deadline, startedAt + 4_999), 1);
  assert.equal(remainingConfirmationSeconds(deadline, deadline), 0);
  assert.equal(remainingConfirmationSeconds(deadline, deadline + 1_000), 0);
});

test("thread confirmation automatically commits once when its timer elapses", async () => {
  let commits = 0;
  startThreadConfirmationTimeout(() => {
    commits += 1;
  }, 15);

  await delay(50);
  assert.equal(commits, 1);
});

test("thread confirmation cleanup prevents a delayed commit", async () => {
  let commits = 0;
  const cancel = startThreadConfirmationTimeout(() => {
    commits += 1;
  }, 15);

  cancel();
  cancel();
  await delay(50);
  assert.equal(commits, 0);
});
