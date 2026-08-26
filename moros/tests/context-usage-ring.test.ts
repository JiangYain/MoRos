import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextRingCallouts,
  CONTEXT_RING_CALLOUT_VIEWBOX,
} from "../src/renderer/src/components/composer/context-usage-ring.ts";

test("context ring callouts label every non-empty segment and ignore empty segments", () => {
  const callouts = buildContextRingCallouts([
    { key: "read", offset: 0, length: 25 },
    { key: "write", offset: 25, length: 0 },
    { key: "bash", offset: 25, length: 15 },
  ]);

  assert.deepEqual(callouts.map((callout) => callout.key).sort(), ["bash", "read"]);
});

test("context ring callouts keep only the two largest segments", () => {
  const callouts = buildContextRingCallouts([
    { key: "system-prompt", offset: 0, length: 0.5 },
    { key: "conversation", offset: 0.5, length: 0.1 },
    { key: "read", offset: 0.6, length: 37.2 },
    { key: "bash", offset: 37.8, length: 15.1 },
  ]);

  assert.deepEqual(callouts.map((callout) => callout.key).sort(), ["bash", "read"]);
});

test("context ring callout anchors follow the clockwise segment midpoint", () => {
  const [callout] = buildContextRingCallouts([{ key: "read", offset: 0, length: 25 }]);

  assert.equal(callout.side, "right");
  assert.ok(callout.anchorX > CONTEXT_RING_CALLOUT_VIEWBOX.centerX);
  assert.ok(callout.anchorY < CONTEXT_RING_CALLOUT_VIEWBOX.centerY);
});

test("context ring callout labels stay bounded and do not overlap on either side", () => {
  const segments = Array.from({ length: 12 }, (_, index) => ({
    key: `segment-${index}`,
    offset: index * 2,
    length: 2,
  }));
  const callouts = buildContextRingCallouts(segments);

  for (const side of ["left", "right"] as const) {
    const labels = callouts
      .filter((callout) => callout.side === side)
      .map((callout) => callout.labelY)
      .sort((a, b) => a - b);
    assert.ok(labels.every((labelY) => labelY >= 8 && labelY <= 158));
    for (let index = 1; index < labels.length; index += 1) {
      assert.ok(labels[index] > labels[index - 1]);
    }
  }
});
