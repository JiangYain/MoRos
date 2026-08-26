import assert from "node:assert/strict";
import test from "node:test";
import {
  distanceFromThreadBottom,
  shouldStickToLatest,
  THREAD_SCROLL_RELEASE_DISTANCE,
} from "../src/renderer/src/components/thread-scroll.ts";

test("thread scroll stays locked only within the 30px bottom threshold", () => {
  assert.equal(THREAD_SCROLL_RELEASE_DISTANCE, 30);
  assert.equal(shouldStickToLatest({ scrollHeight: 1000, scrollTop: 570, clientHeight: 400 }), true);
  assert.equal(shouldStickToLatest({ scrollHeight: 1000, scrollTop: 569, clientHeight: 400 }), false);
});

test("thread scroll distance is safe during browser overscroll", () => {
  assert.equal(distanceFromThreadBottom({ scrollHeight: 500, scrollTop: 140, clientHeight: 400 }), 0);
  assert.equal(shouldStickToLatest({ scrollHeight: 500, scrollTop: 140, clientHeight: 400 }), true);
});
