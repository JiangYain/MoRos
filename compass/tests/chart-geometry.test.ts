import assert from "node:assert/strict";
import test from "node:test";
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  DB_MAX,
  DB_MIN,
  INNER_HEIGHT,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  chartPointFromClient,
  getX,
  getXByFrequency,
  getY,
  thresholdFromClick,
} from "../src/renderer/src/components/hearing-health/chart-geometry.ts";
import { FREQUENCIES } from "../src/renderer/src/components/hearing-health/model.ts";

const UNSCALED = { top: 0, height: CHART_HEIGHT };
const UNSCALED_BOX = { top: 0, left: 0, width: CHART_WIDTH, height: CHART_HEIGHT };

test("clicks on the padding edges map to the dB range bounds", () => {
  assert.equal(thresholdFromClick(UNSCALED, PAD_TOP), DB_MIN);
  assert.equal(thresholdFromClick(UNSCALED, CHART_HEIGHT - PAD_BOTTOM), DB_MAX);
  assert.equal(thresholdFromClick(UNSCALED, PAD_TOP + INNER_HEIGHT / 2), 55);
});

test("clicking the rendered position of a value returns that value", () => {
  for (const db of [-10, 0, 40, 75, 120]) {
    assert.equal(thresholdFromClick(UNSCALED, getY(db)), db);
  }
});

test("screen pixels are converted through the rendered rect scale", () => {
  // The chart rendered at half size, offset 100 px from the viewport top.
  const scaled = { top: 100, height: CHART_HEIGHT / 2 };
  assert.equal(thresholdFromClick(scaled, 100 + PAD_TOP / 2), DB_MIN);
  assert.equal(thresholdFromClick(scaled, 100 + getY(55) / 2), 55);
  assert.equal(thresholdFromClick(scaled, 100 + (CHART_HEIGHT - PAD_BOTTOM) / 2), DB_MAX);

  // Double size, as on a wide monitor.
  const doubled = { top: 12, height: CHART_HEIGHT * 2 };
  assert.equal(thresholdFromClick(doubled, 12 + getY(40) * 2), 40);
});

test("values snap to 5 dB steps and clamp to the audiogram range", () => {
  // 53.09 dB raw → snapped to 55.
  assert.equal(thresholdFromClick(UNSCALED, 152), 55);
  // Above the top padding clamps to DB_MIN, below the bottom padding to DB_MAX.
  assert.equal(thresholdFromClick(UNSCALED, 0), DB_MIN);
  assert.equal(thresholdFromClick(UNSCALED, CHART_HEIGHT), DB_MAX);
});

test("a degenerate zero-height rect does not divide by zero", () => {
  const collapsed = { top: 0, height: 0 };
  const value = thresholdFromClick(collapsed, PAD_TOP);
  assert.ok(value >= DB_MIN && value <= DB_MAX);
});

test("frequency columns sit on a logarithmic axis inset from the frame", () => {
  // Half an octave of breathing room keeps the outer columns off the frame.
  const octave = getXByFrequency(500) - getXByFrequency(250);
  assert.ok(Math.abs(getXByFrequency(125) - (PAD_LEFT + octave / 2)) < 1e-9);
  assert.ok(Math.abs(getXByFrequency(8000) - (CHART_WIDTH - PAD_RIGHT - octave / 2)) < 1e-9);
  // Doubling the frequency advances by a constant octave width.
  assert.ok(Math.abs((getXByFrequency(2000) - getXByFrequency(1000)) - octave) < 1e-9);
  // 1.5 kHz sits between 1 kHz and 2 kHz, past the midpoint (log2 1.5 ≈ 0.585).
  const midpoint = (getXByFrequency(1000) + getXByFrequency(2000)) / 2;
  assert.ok(getXByFrequency(1500) > midpoint);
  assert.ok(getXByFrequency(1500) < getXByFrequency(2000));
  // Every plottable column resolves through its index too.
  FREQUENCIES.forEach((frequency, index) => {
    assert.equal(getX(index), getXByFrequency(frequency));
  });
});

test("chartPointFromClient snaps the cursor to the nearest column and 5 dB step", () => {
  const index1500 = FREQUENCIES.indexOf(1500);
  const exact = chartPointFromClient(UNSCALED_BOX, getXByFrequency(1500), getY(45));
  assert.deepEqual(exact, { frequencyIndex: index1500, db: 45 });

  // A cursor slightly off the 1.5 kHz column still resolves to it.
  const nearby = chartPointFromClient(UNSCALED_BOX, getXByFrequency(1500) + 4, getY(45));
  assert.equal(nearby.frequencyIndex, index1500);

  // Horizontal overshoot clamps to the outermost columns.
  assert.equal(chartPointFromClient(UNSCALED_BOX, 0, getY(20)).frequencyIndex, 0);
  assert.equal(
    chartPointFromClient(UNSCALED_BOX, CHART_WIDTH, getY(20)).frequencyIndex,
    FREQUENCIES.length - 1,
  );

  // Screen coordinates convert through the rendered rect scale.
  const scaled = { top: 50, left: 30, width: CHART_WIDTH / 2, height: CHART_HEIGHT / 2 };
  const scaledPoint = chartPointFromClient(
    scaled,
    30 + getXByFrequency(3000) / 2,
    50 + getY(70) / 2,
  );
  assert.deepEqual(scaledPoint, { frequencyIndex: FREQUENCIES.indexOf(3000), db: 70 });
});
