export type TransducerType =
  | "Insert earphone"
  | "Headphones"
  | "Bone conductor"
  | "Sound field";

export type CurveType = "AC" | "BC" | "UCL";
export type EarSide = "right" | "left";

export interface EarThresholds {
  ac: (number | null)[];
  bc: (number | null)[];
  ucl: (number | null)[];
}

export interface AudiogramRecord {
  id: string;
  date: string;
  useAudiogramRight: boolean;
  useAudiogramLeft: boolean;
  transducerRight: TransducerType;
  transducerLeft: TransducerType;
  right: EarThresholds;
  left: EarThresholds;
}

export const FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000] as const;
export const INTER_OCTAVES = [750, 1500, 3000, 6000] as const;
const CURVE_KEYS: Record<CurveType, keyof EarThresholds> = {
  AC: "ac",
  BC: "bc",
  UCL: "ucl",
};
export const EMPTY_THRESHOLDS: EarThresholds = {
  ac: [null, null, null, null, null, null, null],
  bc: [null, null, null, null, null, null, null],
  ucl: [null, null, null, null, null, null, null],
};

export const INITIAL_RECORDS: AudiogramRecord[] = [
  {
    id: "rec-1",
    date: "2026/07/29",
    useAudiogramRight: true,
    useAudiogramLeft: true,
    transducerRight: "Insert earphone",
    transducerLeft: "Insert earphone",
    right: {
      ac: [15, 20, 25, 35, 45, 60, 75],
      bc: [10, 15, 20, 30, 40, 55, null],
      ucl: [90, 95, 100, 100, 105, 110, 110],
    },
    left: {
      ac: [20, 20, 30, 35, 50, 65, 80],
      bc: [15, 15, 25, 30, 45, 60, null],
      ucl: [95, 95, 100, 105, 105, 110, 115],
    },
  },
  {
    id: "rec-2",
    date: "2025/11/15",
    useAudiogramRight: true,
    useAudiogramLeft: true,
    transducerRight: "Insert earphone",
    transducerLeft: "Insert earphone",
    right: {
      ac: [15, 15, 20, 30, 40, 55, 70],
      bc: [10, 10, 15, 25, 35, 50, null],
      ucl: [90, 90, 95, 100, 100, 105, 110],
    },
    left: {
      ac: [15, 20, 25, 30, 45, 60, 75],
      bc: [10, 15, 20, 25, 40, 55, null],
      ucl: [90, 95, 95, 100, 105, 105, 110],
    },
  },
];

export function createAudiogramRecord(now = new Date()): AudiogramRecord {
  return {
    id: `rec-${now.getTime()}`,
    date: now.toISOString().split("T")[0].replace(/-/g, "/"),
    useAudiogramRight: true,
    useAudiogramLeft: true,
    transducerRight: "Insert earphone",
    transducerLeft: "Insert earphone",
    right: {
      ac: [10, 10, 15, 20, 25, 30, 35],
      bc: [5, 5, 10, 15, 20, 25, null],
      ucl: [90, 90, 95, 100, 105, 105, 110],
    },
    left: {
      ac: [10, 15, 15, 20, 25, 35, 40],
      bc: [5, 10, 10, 15, 20, 30, null],
      ucl: [90, 95, 95, 100, 105, 110, 110],
    },
  };
}

export function calculateSii(thresholds: (number | null)[]): number {
  const values = thresholds.filter((value): value is number => value !== null);
  if (values.length === 0) return 0;
  const audibility = values.reduce((sum, value) => sum + Math.max(0, 100 - value), 0);
  return Math.round((audibility / (values.length * 100)) * 100);
}

export function updateThreshold(
  record: AudiogramRecord,
  ear: EarSide,
  curve: CurveType,
  frequencyIndex: number,
  clickedDb: number,
): AudiogramRecord {
  const curveKey = CURVE_KEYS[curve];
  const values = [...record[ear][curveKey]];
  const existing = values[frequencyIndex];
  values[frequencyIndex] = existing !== null && Math.abs(existing - clickedDb) < 4
    ? null
    : clickedDb;
  return {
    ...record,
    [ear]: { ...record[ear], [curveKey]: values },
  };
}

export function cloneEmptyThresholds(): EarThresholds {
  return {
    ac: [...EMPTY_THRESHOLDS.ac],
    bc: [...EMPTY_THRESHOLDS.bc],
    ucl: [...EMPTY_THRESHOLDS.ucl],
  };
}
