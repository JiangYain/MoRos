export const CONTEXT_RING_CALLOUT_VIEWBOX = {
  width: 236,
  height: 166,
  centerX: 118,
  centerY: 83,
} as const;

export const CONTEXT_RING_CALLOUT_LIMIT = 2;

export interface ContextRingSegmentGeometry {
  key: string;
  length: number;
  offset: number;
}

export interface ContextRingCalloutGeometry {
  anchorX: number;
  anchorY: number;
  elbowX: number;
  elbowY: number;
  labelX: number;
  labelY: number;
  lineEndX: number;
  side: "left" | "right";
}

const ANCHOR_RADIUS = 59;
const ELBOW_RADIUS = 67;
const LABEL_MIN_Y = 8;
const LABEL_MAX_Y = 158;
const PREFERRED_LABEL_GAP = 18;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distributeLabelYs<T extends { naturalY: number }>(items: T[]): Array<T & { labelY: number }> {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.naturalY - b.naturalY);
  if (sorted.length === 1) {
    return [{ ...sorted[0], labelY: clamp(sorted[0].naturalY, LABEL_MIN_Y, LABEL_MAX_Y) }];
  }

  const gap = Math.min(PREFERRED_LABEL_GAP, (LABEL_MAX_Y - LABEL_MIN_Y) / (sorted.length - 1));
  const placed = sorted.map((item, index) => ({
    ...item,
    labelY: index === 0
      ? clamp(item.naturalY, LABEL_MIN_Y, LABEL_MAX_Y)
      : 0,
  }));

  for (let index = 1; index < placed.length; index += 1) {
    placed[index].labelY = Math.max(
      clamp(placed[index].naturalY, LABEL_MIN_Y, LABEL_MAX_Y),
      placed[index - 1].labelY + gap,
    );
  }

  if (placed.at(-1)!.labelY > LABEL_MAX_Y) {
    placed[placed.length - 1].labelY = LABEL_MAX_Y;
    for (let index = placed.length - 2; index >= 0; index -= 1) {
      placed[index].labelY = Math.min(placed[index].labelY, placed[index + 1].labelY - gap);
    }
  }

  if (placed[0].labelY < LABEL_MIN_Y) {
    placed[0].labelY = LABEL_MIN_Y;
    for (let index = 1; index < placed.length; index += 1) {
      placed[index].labelY = Math.max(placed[index].labelY, placed[index - 1].labelY + gap);
    }
  }

  return placed;
}

export function buildContextRingCallouts<T extends ContextRingSegmentGeometry>(
  segments: readonly T[],
): Array<T & ContextRingCalloutGeometry> {
  const dominantSegments = [...segments]
    .filter((segment) => segment.length > 0)
    .sort((first, second) => second.length - first.length)
    .slice(0, CONTEXT_RING_CALLOUT_LIMIT);
  const callouts = dominantSegments
    .map((segment) => {
      const midpointDegrees = -90 + (segment.offset + segment.length / 2) * 3.6;
      const midpointRadians = midpointDegrees * Math.PI / 180;
      const cosine = Math.cos(midpointRadians);
      const sine = Math.sin(midpointRadians);
      return {
        ...segment,
        anchorX: CONTEXT_RING_CALLOUT_VIEWBOX.centerX + cosine * ANCHOR_RADIUS,
        anchorY: CONTEXT_RING_CALLOUT_VIEWBOX.centerY + sine * ANCHOR_RADIUS,
        elbowX: CONTEXT_RING_CALLOUT_VIEWBOX.centerX + cosine * ELBOW_RADIUS,
        elbowY: CONTEXT_RING_CALLOUT_VIEWBOX.centerY + sine * ELBOW_RADIUS,
        naturalY: CONTEXT_RING_CALLOUT_VIEWBOX.centerY + sine * ELBOW_RADIUS,
        side: cosine < 0 ? "left" as const : "right" as const,
      };
    });

  return (["left", "right"] as const).flatMap((side) =>
    distributeLabelYs(callouts.filter((callout) => callout.side === side)).map((callout) => ({
      ...callout,
      labelX: side === "left" ? 50 : 186,
      lineEndX: side === "left" ? 54 : 182,
    })),
  );
}
