import { AUDIOGRAM_DB_MAX, AUDIOGRAM_DB_MIN } from "../../../../shared/client-audiograms.ts";
import { FREQUENCIES } from "./model.ts";

/**
 * Pure viewBox geometry for the audiogram chart. The SVG scales with its
 * container while keeping the viewBox aspect ratio, so pointer coordinates
 * must be converted from screen pixels into viewBox units before a dB value
 * can be derived.
 */

export const CHART_WIDTH = 360;
export const CHART_HEIGHT = 320;
export const PAD_LEFT = 36;
export const PAD_RIGHT = 18;
export const PAD_TOP = 20;
export const PAD_BOTTOM = 28;
export const INNER_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
export const INNER_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
export const DB_MIN = AUDIOGRAM_DB_MIN;
export const DB_MAX = AUDIOGRAM_DB_MAX;
export const DB_STEP = 5;

/** Octave span of the axis: log2(8000 / 125). */
const OCTAVE_SPAN = Math.log2(8000 / 125);

/**
 * Half an octave of breathing room on each side, so the 125 Hz and 8 kHz
 * columns sit inside the frame instead of on it and the corner labels
 * (120 dB / 125 Hz) stay apart.
 */
const AXIS_INSET_OCTAVES = 0.5;
const AXIS_SPAN = OCTAVE_SPAN + AXIS_INSET_OCTAVES * 2;

/** Logarithmic axis position (0..OCTAVE_SPAN) of a frequency in Hz. */
function octavePosition(frequency: number): number {
  return Math.log2(frequency / 125);
}

/** X position (viewBox units) of any frequency on the log axis. */
export function getXByFrequency(frequency: number): number {
  return PAD_LEFT + ((octavePosition(frequency) + AXIS_INSET_OCTAVES) / AXIS_SPAN) * INNER_WIDTH;
}

/** X position (viewBox units) of a plottable frequency column. */
export function getX(frequencyIndex: number): number {
  return getXByFrequency(FREQUENCIES[frequencyIndex]);
}

/** Y position (viewBox units) of a dB hearing level. */
export function getY(db: number): number {
  return PAD_TOP + ((db - DB_MIN) / (DB_MAX - DB_MIN)) * INNER_HEIGHT;
}

/** The subset of the rendered SVG's DOMRect the conversion needs. */
export interface ChartClientRect {
  top: number;
  height: number;
}

/** Full rect needed to invert both axes for hover and context-menu targets. */
export interface ChartClientBox extends ChartClientRect {
  left: number;
  width: number;
}

export interface ChartCursorPoint {
  frequencyIndex: number;
  db: number;
}

/**
 * Convert a cursor position into the nearest plottable frequency column and
 * the 5 dB-snapped hearing level under the cursor.
 */
export function chartPointFromClient(
  rect: ChartClientBox,
  clientX: number,
  clientY: number,
): ChartCursorPoint {
  const scaleX = rect.width > 0 ? CHART_WIDTH / rect.width : 1;
  const viewX = (clientX - rect.left) * scaleX;
  let frequencyIndex = 0;
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < FREQUENCIES.length; index += 1) {
    const distance = Math.abs(getX(index) - viewX);
    if (distance < closest) {
      closest = distance;
      frequencyIndex = index;
    }
  }
  return { frequencyIndex, db: thresholdFromClick(rect, clientY) };
}

/**
 * Convert a click's clientY into a dB value snapped to 5 dB steps.
 *
 * `svgRect` must be the bounding rect of the SVG root element (not of an
 * inner hit line, whose own rect would collapse to the drawn geometry). The
 * screen-to-viewBox scale comes from the rendered height, which tracks the
 * viewBox ratio because the chart renders with width 100 % and height auto.
 */
export function thresholdFromClick(svgRect: ChartClientRect, clientY: number): number {
  const scale = svgRect.height > 0 ? CHART_HEIGHT / svgRect.height : 1;
  const viewY = (clientY - svgRect.top) * scale;
  const raw = DB_MIN + ((viewY - PAD_TOP) / INNER_HEIGHT) * (DB_MAX - DB_MIN);
  const snapped = Math.round(raw / DB_STEP) * DB_STEP;
  const clamped = Math.min(DB_MAX, Math.max(DB_MIN, snapped));
  // Rounding a tiny negative float yields -0; normalize for strict consumers.
  return clamped === 0 ? 0 : clamped;
}
