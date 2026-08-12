/**
 * Client-bound audiogram records shared between the SQLite-backed main
 * process and the hearing health workspace renderer. Everything here must
 * stay structured-clone safe.
 */

/** Plottable frequency columns; 750 Hz stays a visual guide only. */
export const AUDIOGRAM_FREQUENCIES = [
  125, 250, 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000,
] as const;
export const AUDIOGRAM_FREQUENCY_COUNT = AUDIOGRAM_FREQUENCIES.length;
export const AUDIOGRAM_DB_MIN = -10;
export const AUDIOGRAM_DB_MAX = 120;

/** Older records stored the seven octave columns only. */
const LEGACY_FREQUENCY_COUNT = 7;
const LEGACY_INDEX_MAP = [0, 1, 2, 3, 5, 7, 9] as const;

/** Clinical point symbol variants, mirroring the fitting-software menu. */
export const AUDIOGRAM_MARKERS = [
  "unmasked",
  "no-response",
  "unmeasurable",
  "masked",
  "masked-no-response",
  "masked-unmeasurable",
  "always-response",
  "masked-always-response",
] as const;

export type AudiogramMarker = (typeof AUDIOGRAM_MARKERS)[number];

export function isAudiogramMarker(value: unknown): value is AudiogramMarker {
  return typeof value === "string" && (AUDIOGRAM_MARKERS as readonly string[]).includes(value);
}

export interface AudiogramPoint {
  db: number;
  marker: AudiogramMarker;
}

export const AUDIOGRAM_TRANSDUCERS = [
  "Insert earphone",
  "Headphones",
  "Bone conductor",
  "Sound field",
] as const;

export type AudiogramTransducer = (typeof AUDIOGRAM_TRANSDUCERS)[number];

export function isAudiogramTransducer(value: unknown): value is AudiogramTransducer {
  return typeof value === "string" && (AUDIOGRAM_TRANSDUCERS as readonly string[]).includes(value);
}

/** One slot per plottable frequency; null marks an unmeasured point. */
export type AudiogramCurve = (AudiogramPoint | null)[];

export interface AudiogramEarThresholds {
  ac: AudiogramCurve;
  bc: AudiogramCurve;
  ucl: AudiogramCurve;
}

export interface ClientAudiogramDraft {
  /** Database id for updates; null inserts a new record. */
  id: number | null;
  /** Measurement date as an ISO calendar date (yyyy-mm-dd). */
  date: string;
  useAudiogramRight: boolean;
  useAudiogramLeft: boolean;
  transducerRight: AudiogramTransducer;
  transducerLeft: AudiogramTransducer;
  right: AudiogramEarThresholds;
  left: AudiogramEarThresholds;
}

export interface ClientAudiogramRecord extends ClientAudiogramDraft {
  id: number;
  /** Display name of the owning client at read time. */
  clientName: string;
  createdAt: number;
  updatedAt: number;
}

export function emptyAudiogramCurve(): AudiogramCurve {
  return Array.from({ length: AUDIOGRAM_FREQUENCY_COUNT }, () => null);
}

export function emptyAudiogramEarThresholds(): AudiogramEarThresholds {
  return { ac: emptyAudiogramCurve(), bc: emptyAudiogramCurve(), ucl: emptyAudiogramCurve() };
}

export function isIsoAudiogramDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function normalizeAudiogramPoint(entry: unknown): AudiogramPoint | null | undefined {
  if (entry === null) return null;
  // Legacy storage kept plain numbers; they mean an unmasked point.
  if (typeof entry === "number") {
    if (!Number.isFinite(entry)) return undefined;
    const db = Math.round(entry);
    if (db < AUDIOGRAM_DB_MIN || db > AUDIOGRAM_DB_MAX) return undefined;
    return { db, marker: "unmasked" };
  }
  if (!entry || typeof entry !== "object") return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record.db !== "number" || !Number.isFinite(record.db)) return undefined;
  const db = Math.round(record.db);
  if (db < AUDIOGRAM_DB_MIN || db > AUDIOGRAM_DB_MAX) return undefined;
  const marker = record.marker === undefined ? "unmasked" : record.marker;
  if (!isAudiogramMarker(marker)) return undefined;
  return { db, marker };
}

export function normalizeAudiogramCurve(value: unknown): AudiogramCurve | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.length !== AUDIOGRAM_FREQUENCY_COUNT && value.length !== LEGACY_FREQUENCY_COUNT) {
    return undefined;
  }
  const points: (AudiogramPoint | null)[] = [];
  for (const entry of value) {
    const point = normalizeAudiogramPoint(entry);
    if (point === undefined) return undefined;
    points.push(point);
  }
  if (points.length === AUDIOGRAM_FREQUENCY_COUNT) return points;
  // Legacy seven-octave curves spread onto the ten-column grid; the added
  // 1.5/3/6 kHz slots start unmeasured.
  const curve = emptyAudiogramCurve();
  LEGACY_INDEX_MAP.forEach((target, source) => {
    curve[target] = points[source];
  });
  return curve;
}

function normalizeEarThresholds(value: unknown): AudiogramEarThresholds | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const ac = normalizeAudiogramCurve(record.ac);
  const bc = normalizeAudiogramCurve(record.bc);
  const ucl = normalizeAudiogramCurve(record.ucl);
  if (!ac || !bc || !ucl) return undefined;
  return { ac, bc, ucl };
}

export function normalizeClientAudiogramDraft(value: unknown): ClientAudiogramDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const id = record.id === null || record.id === undefined
    ? null
    : typeof record.id === "number" && Number.isInteger(record.id) && record.id > 0
      ? record.id
      : undefined;
  if (id === undefined) return undefined;
  if (!isIsoAudiogramDate(record.date)) return undefined;
  if (typeof record.useAudiogramRight !== "boolean" || typeof record.useAudiogramLeft !== "boolean") {
    return undefined;
  }
  if (!isAudiogramTransducer(record.transducerRight) || !isAudiogramTransducer(record.transducerLeft)) {
    return undefined;
  }
  const right = normalizeEarThresholds(record.right);
  const left = normalizeEarThresholds(record.left);
  if (!right || !left) return undefined;
  return {
    id,
    date: record.date,
    useAudiogramRight: record.useAudiogramRight,
    useAudiogramLeft: record.useAudiogramLeft,
    transducerRight: record.transducerRight,
    transducerLeft: record.transducerLeft,
    right,
    left,
  };
}
