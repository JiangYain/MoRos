import {
  AUDIOGRAM_FREQUENCIES,
  emptyAudiogramEarThresholds,
  type AudiogramEarThresholds,
  type AudiogramMarker,
  type AudiogramPoint,
  type AudiogramTransducer,
  type ClientAudiogramDraft,
  type ClientAudiogramRecord,
} from "../../../../shared/client-audiograms.ts";

export type TransducerType = AudiogramTransducer;
export type CurveType = "AC" | "BC" | "UCL";
export type EarSide = "right" | "left";
export type EarThresholds = AudiogramEarThresholds;
export type { AudiogramMarker, AudiogramPoint };

/**
 * Renderer working copy of a client audiogram. Unsaved records carry a null
 * database id; `key` stays stable across the save round-trip so selection and
 * React identity survive the id assignment.
 */
export interface AudiogramRecord {
  key: string;
  id: number | null;
  /** ISO calendar date (yyyy-mm-dd). */
  date: string;
  useAudiogramRight: boolean;
  useAudiogramLeft: boolean;
  transducerRight: TransducerType;
  transducerLeft: TransducerType;
  right: EarThresholds;
  left: EarThresholds;
}

export const FREQUENCIES = AUDIOGRAM_FREQUENCIES;
/** Octave columns carry the solid grid lines and axis labels. */
export const OCTAVE_FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000] as const;
/** Dashed guide columns; 1.5/3/6 kHz are also plottable, 750 Hz is not. */
export const INTER_OCTAVES = [750, 1500, 3000, 6000] as const;
export const CURVE_KEYS: Record<CurveType, keyof EarThresholds> = {
  AC: "ac",
  BC: "bc",
  UCL: "ucl",
};

/** Local calendar date so "today" matches the operator's clock, not UTC. */
export function isoDateToday(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

let draftSequence = 0;

export function createAudiogramRecord(now = new Date()): AudiogramRecord {
  draftSequence += 1;
  return {
    key: `draft-${now.getTime()}-${draftSequence}`,
    id: null,
    date: isoDateToday(now),
    useAudiogramRight: true,
    useAudiogramLeft: true,
    transducerRight: "Insert earphone",
    transducerLeft: "Insert earphone",
    right: cloneEmptyThresholds(),
    left: cloneEmptyThresholds(),
  };
}

function cloneCurve(curve: (AudiogramPoint | null)[]): (AudiogramPoint | null)[] {
  return curve.map((point) => (point ? { ...point } : null));
}

function cloneThresholds(value: EarThresholds): EarThresholds {
  return { ac: cloneCurve(value.ac), bc: cloneCurve(value.bc), ucl: cloneCurve(value.ucl) };
}

export function cloneEmptyThresholds(): EarThresholds {
  return emptyAudiogramEarThresholds();
}

export function audiogramRecordFromClient(record: ClientAudiogramRecord): AudiogramRecord {
  return {
    key: `db-${record.id}`,
    id: record.id,
    date: record.date,
    useAudiogramRight: record.useAudiogramRight,
    useAudiogramLeft: record.useAudiogramLeft,
    transducerRight: record.transducerRight,
    transducerLeft: record.transducerLeft,
    right: cloneThresholds(record.right),
    left: cloneThresholds(record.left),
  };
}

export function audiogramDraftFromRecord(record: AudiogramRecord): ClientAudiogramDraft {
  return {
    id: record.id,
    date: record.date,
    useAudiogramRight: record.useAudiogramRight,
    useAudiogramLeft: record.useAudiogramLeft,
    transducerRight: record.transducerRight,
    transducerLeft: record.transducerLeft,
    right: cloneThresholds(record.right),
    left: cloneThresholds(record.left),
  };
}

export function calculateSii(thresholds: (AudiogramPoint | null)[]): number {
  const values = thresholds
    .filter((point): point is AudiogramPoint => point !== null)
    .map((point) => point.db);
  if (values.length === 0) return 0;
  const audibility = values.reduce((sum, value) => sum + Math.max(0, 100 - value), 0);
  return Math.round((audibility / (values.length * 100)) * 100);
}

function withCurve(
  record: AudiogramRecord,
  ear: EarSide,
  curve: CurveType,
  update: (values: (AudiogramPoint | null)[]) => (AudiogramPoint | null)[],
): AudiogramRecord {
  const curveKey = CURVE_KEYS[curve];
  return {
    ...record,
    [ear]: { ...record[ear], [curveKey]: update(cloneCurve(record[ear][curveKey])) },
  };
}

export function updateThreshold(
  record: AudiogramRecord,
  ear: EarSide,
  curve: CurveType,
  frequencyIndex: number,
  clickedDb: number,
): AudiogramRecord {
  return withCurve(record, ear, curve, (values) => {
    const existing = values[frequencyIndex];
    values[frequencyIndex] = existing !== null && Math.abs(existing.db - clickedDb) < 4
      ? null
      : { db: clickedDb, marker: existing?.marker ?? "unmasked" };
    return values;
  });
}

export function removeThresholdPoint(
  record: AudiogramRecord,
  ear: EarSide,
  curve: CurveType,
  frequencyIndex: number,
): AudiogramRecord {
  if (record[ear][CURVE_KEYS[curve]][frequencyIndex] === null) return record;
  return withCurve(record, ear, curve, (values) => {
    values[frequencyIndex] = null;
    return values;
  });
}

export function setThresholdMarker(
  record: AudiogramRecord,
  ear: EarSide,
  curve: CurveType,
  frequencyIndex: number,
  marker: AudiogramMarker,
): AudiogramRecord {
  const existing = record[ear][CURVE_KEYS[curve]][frequencyIndex];
  if (!existing || existing.marker === marker) return record;
  return withCurve(record, ear, curve, (values) => {
    values[frequencyIndex] = { db: existing.db, marker };
    return values;
  });
}

export function clearCurve(
  record: AudiogramRecord,
  ear: EarSide,
  curve: CurveType,
): AudiogramRecord {
  if (record[ear][CURVE_KEYS[curve]].every((point) => point === null)) return record;
  return withCurve(record, ear, curve, (values) => values.map(() => null));
}

/** Copies one ear's curve onto the other ear, replacing its points. */
export function copyCurveToOtherEar(
  record: AudiogramRecord,
  fromEar: EarSide,
  curve: CurveType,
): AudiogramRecord {
  const toEar: EarSide = fromEar === "right" ? "left" : "right";
  const curveKey = CURVE_KEYS[curve];
  return {
    ...record,
    [toEar]: { ...record[toEar], [curveKey]: cloneCurve(record[fromEar][curveKey]) },
  };
}
