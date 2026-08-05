import { useState, useMemo, useCallback } from "react";
import { Trash2, ChevronDown, Plus, Calendar } from "lucide-react";
import { useI18n } from "../i18n";

export type TransducerType =
  | "Insert earphone"
  | "Headphones"
  | "Bone conductor"
  | "Sound field";

export type CurveType = "AC" | "BC" | "UCL";

export interface EarThresholds {
  ac: (number | null)[];
  bc: (number | null)[];
  ucl: (number | null)[];
}

export interface AudiogramRecord {
  id: string;
  date: string; // YYYY/MM/DD
  useAudiogramRight: boolean;
  useAudiogramLeft: boolean;
  transducerRight: TransducerType;
  transducerLeft: TransducerType;
  right: EarThresholds;
  left: EarThresholds;
}

const FREQUENCIES = [125, 250, 500, 1000, 2000, 4000, 8000];
const INTER_OCTAVES = [750, 1500, 3000, 6000];

// Default clinical audiogram records bound to dates
const INITIAL_RECORDS: AudiogramRecord[] = [
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

export function HearingHealthWorkspace(): React.JSX.Element {
  const { t } = useI18n();

  // State Management
  const [records, setRecords] = useState<AudiogramRecord[]>(INITIAL_RECORDS);
  const [activeRecordId, setActiveRecordId] = useState<string>("rec-1");
  const [activeCurve, setActiveCurve] = useState<CurveType>("AC");
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);

  // Checkbox Display Toggles
  const [showSpeechSpectrum, setShowSpeechSpectrum] = useState(false);
  const [showPictograms, setShowPictograms] = useState(false);
  const [spLogramClientView, setSpLogramClientView] = useState(false);
  const [showUnaidedSII, setShowUnaidedSII] = useState(false);

  // Current Active Record
  const activeRecord = useMemo(
    () => records.find((r) => r.id === activeRecordId) ?? records[0],
    [records, activeRecordId],
  );

  // Add new history entry
  const handleAddHistory = useCallback(() => {
    const todayStr = new Date().toISOString().split("T")[0].replace(/-/g, "/");
    const newRec: AudiogramRecord = {
      id: `rec-${Date.now()}`,
      date: todayStr,
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
    setRecords((prev) => [newRec, ...prev]);
    setActiveRecordId(newRec.id);
  }, []);

  // Clear Audiogram for specific ear
  const handleClearEar = useCallback((ear: "right" | "left") => {
    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id !== activeRecordId) return rec;
        return {
          ...rec,
          [ear]: {
            ac: [null, null, null, null, null, null, null],
            bc: [null, null, null, null, null, null, null],
            ucl: [null, null, null, null, null, null, null],
          },
        };
      }),
    );
  }, [activeRecordId]);

  // Handle Chart Click to edit/plot threshold point
  const handleChartClick = useCallback(
    (ear: "right" | "left", freqIndex: number, clickedDb: number) => {
      setRecords((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeRecordId) return rec;
          const curveKey = activeCurve.toLowerCase() as "ac" | "bc" | "ucl";
          const currentList = [...rec[ear][curveKey]];
          // If existing point is close, toggle/clear it; otherwise set snapped dB HL value
          const existing = currentList[freqIndex];
          if (existing !== null && Math.abs(existing - clickedDb) < 4) {
            currentList[freqIndex] = null;
          } else {
            currentList[freqIndex] = clickedDb;
          }

          return {
            ...rec,
            [ear]: {
              ...rec[ear],
              [curveKey]: currentList,
            },
          };
        }),
      );
    },
    [activeRecordId, activeCurve],
  );

  // SVG Dimension Calculations
  const chartWidth = 360;
  const chartHeight = 320;
  const padLeft = 36;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 28;
  const innerW = chartWidth - padLeft - padRight;
  const innerH = chartHeight - padTop - padBottom;

  const dbMin = -10;
  const dbMax = 120;
  const getX = (freqIdx: number) => padLeft + (freqIdx / (FREQUENCIES.length - 1)) * innerW;
  const getXByFreq = (freq: number) => {
    const idx = FREQUENCIES.indexOf(freq);
    if (idx !== -1) return getX(idx);
    if (freq === 750) return getX(1) + (getX(2) - getX(1)) * 0.58;
    if (freq === 1500) return getX(3) + (getX(4) - getX(3)) * 0.58;
    if (freq === 3000) return getX(4) + (getX(5) - getX(4)) * 0.58;
    if (freq === 6000) return getX(5) + (getX(6) - getX(5)) * 0.58;
    return padLeft;
  };
  const getY = (db: number) => padTop + ((db - dbMin) / (dbMax - dbMin)) * innerH;

  // Build SVG Path helper
  const buildSvgPath = (points: (number | null)[]) => {
    let path = "";
    let isDrawing = false;
    points.forEach((db, i) => {
      if (db !== null) {
        const x = getX(i).toFixed(1);
        const y = getY(db).toFixed(1);
        path += `${isDrawing ? " L" : "M"} ${x} ${y}`;
        isDrawing = true;
      } else {
        isDrawing = false;
      }
    });
    return path;
  };

  // SII calculation approximation
  const calculateSii = (ac: (number | null)[]) => {
    let count = 0;
    let sum = 0;
    ac.forEach((val) => {
      if (val !== null) {
        sum += Math.max(0, 100 - val);
        count += 1;
      }
    });
    return count > 0 ? Math.round((sum / (count * 100)) * 100) : 0;
  };

  const rightSii = calculateSii(activeRecord.right.ac);
  const leftSii = calculateSii(activeRecord.left.ac);

  return (
    <section className="hearing-health-workspace" aria-label={t("hearingHealth.title")}>
      <div className="hearing-health-container">
        {/* Title Header */}
        <header className="hearing-health-header">
          <h1 className="hearing-health-title">{t("hearingHealth.title")}</h1>
        </header>

        {/* 3-Panel Main Audiometry Workspace Grid */}
        <div className="hearing-health-fitting-grid">
          {/* ================= LEFT PANEL: RIGHT EAR (R) ================= */}
          <div className="hearing-health-ear-card">
            <div className="hearing-health-ear-topbar">
              <span className="hearing-health-ear-badge right">R</span>
              <span className="hearing-health-ear-transducer-label">
                {activeRecord.transducerRight}
              </span>
              <button
                type="button"
                className="hearing-health-ear-clear-btn"
                title="清空右耳数据"
                aria-label="清空右耳数据"
                onClick={() => handleClearEar("right")}
              >
                <Trash2 size={13} strokeWidth={1.6} />
              </button>
            </div>

            {/* Audiogram SVG Canvas */}
            <div className="hearing-health-chart-container">
              <svg
                className="hearing-health-chart-svg"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Speech Banana Overlay */}
                {showSpeechSpectrum && (
                  <polygon
                    points={`
                      ${getXByFreq(250)},${getY(15)}
                      ${getXByFreq(1000)},${getY(20)}
                      ${getXByFreq(4000)},${getY(25)}
                      ${getXByFreq(4000)},${getY(55)}
                      ${getXByFreq(1000)},${getY(50)}
                      ${getXByFreq(250)},${getY(40)}
                    `}
                    className="hearing-health-speech-banana"
                  />
                )}

                {/* Pictograms Overlay */}
                {showPictograms && (
                  <g>
                    <text x={getXByFreq(250)} y={getY(15)} className="hearing-health-pictogram-item">🍃</text>
                    <text x={getXByFreq(4000)} y={getY(15)} className="hearing-health-pictogram-item">🐦</text>
                    <text x={getXByFreq(500)} y={getY(30)} className="hearing-health-pictogram-item">💧</text>
                    <text x={getXByFreq(1000)} y={getY(45)} className="hearing-health-pictogram-item">🗣️</text>
                    <text x={getXByFreq(500)} y={getY(65)} className="hearing-health-pictogram-item">🎸</text>
                    <text x={getXByFreq(250)} y={getY(95)} className="hearing-health-pictogram-item">🚜</text>
                    <text x={getXByFreq(1000)} y={getY(110)} className="hearing-health-pictogram-item">✈️</text>
                  </g>
                )}

                {/* Horizontal Gridlines (dB HL) */}
                {[0, 20, 40, 60, 80, 100, 120].map((db) => {
                  const y = getY(db);
                  return (
                    <g key={db}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={chartWidth - padRight}
                        y2={y}
                        className="hearing-health-grid-line"
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 3}
                        fontSize={9}
                        fill="#8e8e93"
                        fontFamily="var(--font-sans)"
                        textAnchor="end"
                      >
                        {db}
                      </text>
                    </g>
                  );
                })}

                {/* Vertical Inter-Octave Lines */}
                {INTER_OCTAVES.map((freq) => {
                  const x = getXByFreq(freq);
                  return (
                    <line
                      key={freq}
                      x1={x}
                      y1={padTop}
                      x2={x}
                      y2={chartHeight - padBottom}
                      className="hearing-health-grid-line-inter"
                    />
                  );
                })}

                {/* Vertical Main Frequency Gridlines */}
                {FREQUENCIES.map((freq, i) => {
                  const x = getX(i);
                  return (
                    <g key={freq}>
                      <line
                        x1={x}
                        y1={padTop}
                        x2={x}
                        y2={chartHeight - padBottom}
                        className="hearing-health-grid-line"
                      />
                      <text
                        x={x}
                        y={chartHeight - padBottom + 15}
                        fontSize={9}
                        fill="#8e8e93"
                        fontFamily="var(--font-sans)"
                        textAnchor="middle"
                      >
                        {freq >= 1000 ? `${freq / 1000}k` : freq}
                      </text>
                    </g>
                  );
                })}

                {/* Curves Rendering for Right Ear (Red) */}
                {/* AC Curve */}
                {buildSvgPath(activeRecord.right.ac) && (
                  <path d={buildSvgPath(activeRecord.right.ac)} className="hearing-health-path-ac-right" />
                )}
                {activeRecord.right.ac.map((db, i) =>
                  db !== null ? (
                    <circle key={`rac-${i}`} cx={getX(i)} cy={getY(db)} r={3.8} fill="#ffffff" stroke="#dc2626" strokeWidth={1.8} />
                  ) : null,
                )}

                {/* BC Curve */}
                {buildSvgPath(activeRecord.right.bc) && (
                  <path d={buildSvgPath(activeRecord.right.bc)} className="hearing-health-path-bc-right" />
                )}
                {activeRecord.right.bc.map((db, i) =>
                  db !== null ? (
                    <text key={`rbc-${i}`} x={getX(i)} y={getY(db) + 3.5} fill="#dc2626" fontSize={11} fontWeight={600} textAnchor="middle">
                      &lt;
                    </text>
                  ) : null,
                )}

                {/* UCL Curve */}
                {buildSvgPath(activeRecord.right.ucl) && (
                  <path d={buildSvgPath(activeRecord.right.ucl)} className="hearing-health-path-ucl-right" />
                )}
                {activeRecord.right.ucl.map((db, i) =>
                  db !== null ? (
                    <text key={`rucl-${i}`} x={getX(i)} y={getY(db) + 3.5} fill="#dc2626" fontSize={10} fontWeight={600} textAnchor="middle">
                      m
                    </text>
                  ) : null,
                )}

                {/* Interactive Click Columns */}
                {FREQUENCIES.map((_, i) => (
                  <line
                    key={`hit-r-${i}`}
                    x1={getX(i)}
                    y1={padTop}
                    x2={getX(i)}
                    y2={chartHeight - padBottom}
                    stroke="transparent"
                    strokeWidth={20}
                    className="hearing-health-freq-hitarea"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickY = e.clientY - rect.top;
                      const ratio = (clickY - padTop) / innerH;
                      const rawDb = dbMin + ratio * (dbMax - dbMin);
                      const snappedDb = Math.max(-10, Math.min(120, Math.round(rawDb / 5) * 5));
                      handleChartClick("right", i, snappedDb);
                    }}
                  />
                ))}
              </svg>
            </div>

            {/* Audiogram Bottom Bar - Clean 2-Row Structured Layout */}
            <div className="hearing-health-ear-footer">
              <div className="hearing-health-ear-footer-row">
                <label className="hearing-health-use-toggle">
                  <input
                    type="checkbox"
                    style={{ display: "none" }}
                    checked={activeRecord.useAudiogramRight}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRecords((prev) =>
                        prev.map((r) =>
                          r.id === activeRecordId ? { ...r, useAudiogramRight: checked } : r,
                        ),
                      );
                    }}
                  />
                  <span
                    className={`hearing-health-green-dot ${
                      activeRecord.useAudiogramRight ? "" : "off"
                    }`}
                  />
                  <span>Use audiogram</span>
                </label>

                <input
                  type="text"
                  className="hearing-health-date-input"
                  value={activeRecord.date}
                  aria-label="测试日期"
                  onChange={(e) => {
                    const val = e.target.value;
                    setRecords((prev) =>
                      prev.map((r) => (r.id === activeRecordId ? { ...r, date: val } : r)),
                    );
                  }}
                />
              </div>

              <select
                className="hearing-health-transducer-select"
                value={activeRecord.transducerRight}
                aria-label="换能器类型"
                onChange={(e) => {
                  const val = e.target.value as TransducerType;
                  setRecords((prev) =>
                    prev.map((r) => (r.id === activeRecordId ? { ...r, transducerRight: val } : r)),
                  );
                }}
              >
                <option value="Insert earphone">Insert earphone</option>
                <option value="Headphones">Headphones</option>
                <option value="Bone conductor">Bone conductor</option>
                <option value="Sound field">Sound field</option>
              </select>
            </div>
          </div>

          {/* ================= CENTER PANEL: CONTROLS & LEGEND ================= */}
          <div className="hearing-health-center-panel">
            {/* History Selector */}
            <div className="hearing-health-history-box" style={{ position: "relative" }}>
              <button
                type="button"
                className="hearing-health-history-btn"
                onClick={() => setShowHistoryMenu((v) => !v)}
              >
                <Calendar size={12} strokeWidth={1.6} />
                <span>History: {activeRecord.date}</span>
                <ChevronDown size={12} strokeWidth={1.6} />
              </button>

              {showHistoryMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    marginTop: 4,
                    background: "var(--color-bg)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: "var(--border-radius-xs)",
                    boxShadow: "var(--shadow-popover)",
                    overflow: "hidden",
                  }}
                >
                  {records.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        border: "none",
                        background: r.id === activeRecordId ? "var(--color-surface)" : "transparent",
                        textAlign: "left",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setActiveRecordId(r.id);
                        setShowHistoryMenu(false);
                      }}
                    >
                      {r.date}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="hearing-health-add-history-btn"
                onClick={handleAddHistory}
              >
                <Plus size={12} strokeWidth={1.8} />
                <span>Add to history</span>
              </button>
            </div>

            {/* Curve Type Selector (AC / BC / UCL) - Frameless Control */}
            <div className="hearing-health-curve-selector">
              {/* AC Row */}
              <div className="hearing-health-curve-row">
                <span className="hearing-health-curve-symbol-left">
                  <svg width="18" height="12">
                    <line x1="1" y1="6" x2="17" y2="6" stroke="#dc2626" strokeWidth="1.5" />
                    <circle cx="9" cy="6" r="3.2" fill="#ffffff" stroke="#dc2626" strokeWidth="1.5" />
                  </svg>
                </span>
                <button
                  type="button"
                  className={`hearing-health-curve-badge ${activeCurve === "AC" ? "active" : ""}`}
                  onClick={() => setActiveCurve("AC")}
                >
                  AC
                </button>
                <span className="hearing-health-curve-symbol-right">
                  <svg width="18" height="12">
                    <line x1="1" y1="6" x2="17" y2="6" stroke="#2563eb" strokeWidth="1.5" />
                    <line x1="5" y1="2" x2="13" y2="10" stroke="#2563eb" strokeWidth="1.5" />
                    <line x1="13" y1="2" x2="5" y2="10" stroke="#2563eb" strokeWidth="1.5" />
                  </svg>
                </span>
              </div>

              {/* BC Row */}
              <div className="hearing-health-curve-row">
                <span className="hearing-health-curve-symbol-left">
                  <svg width="18" height="12">
                    <line x1="1" y1="6" x2="17" y2="6" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="3 2" />
                    <text x="9" y="9" fill="#dc2626" fontSize={11} fontWeight={600} textAnchor="middle">&lt;</text>
                  </svg>
                </span>
                <button
                  type="button"
                  className={`hearing-health-curve-badge ${activeCurve === "BC" ? "active" : ""}`}
                  onClick={() => setActiveCurve("BC")}
                >
                  BC
                </button>
                <span className="hearing-health-curve-symbol-right">
                  <svg width="18" height="12">
                    <line x1="1" y1="6" x2="17" y2="6" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="3 2" />
                    <text x="9" y="9" fill="#2563eb" fontSize={11} fontWeight={600} textAnchor="middle">&gt;</text>
                  </svg>
                </span>
              </div>

              {/* UCL Row */}
              <div className="hearing-health-curve-row">
                <span className="hearing-health-curve-symbol-left">
                  <svg width="18" height="12">
                    <line x1="1" y1="6" x2="17" y2="6" stroke="#dc2626" strokeWidth="1.2" strokeDasharray="2 2" />
                    <text x="9" y="9" fill="#dc2626" fontSize={10} fontWeight={600} textAnchor="middle">m</text>
                  </svg>
                </span>
                <button
                  type="button"
                  className={`hearing-health-curve-badge ${activeCurve === "UCL" ? "active" : ""}`}
                  onClick={() => setActiveCurve("UCL")}
                >
                  UCL
                </button>
                <span className="hearing-health-curve-symbol-right">
                  <svg width="18" height="12">
                    <line x1="1" y1="6" x2="17" y2="6" stroke="#2563eb" strokeWidth="1.2" strokeDasharray="2 2" />
                    <text x="9" y="9" fill="#2563eb" fontSize={10} fontWeight={600} textAnchor="middle">m</text>
                  </svg>
                </span>
              </div>
            </div>

            {/* Display Options Checkboxes */}
            <div className="hearing-health-options-box">
              <label className="hearing-health-checkbox-label">
                <input
                  type="checkbox"
                  checked={showSpeechSpectrum}
                  onChange={(e) => setShowSpeechSpectrum(e.target.checked)}
                />
                <span>Show speech spectrum</span>
              </label>

              <label className="hearing-health-checkbox-label">
                <input
                  type="checkbox"
                  checked={showPictograms}
                  onChange={(e) => setShowPictograms(e.target.checked)}
                />
                <span>Show pictograms</span>
              </label>

              <label className="hearing-health-checkbox-label">
                <input
                  type="checkbox"
                  checked={spLogramClientView}
                  onChange={(e) => setSpLogramClientView(e.target.checked)}
                />
                <span>SPLogram in client view</span>
              </label>

              <label className="hearing-health-checkbox-label">
                <input
                  type="checkbox"
                  checked={showUnaidedSII}
                  onChange={(e) => setShowUnaidedSII(e.target.checked)}
                />
                <span>Show unaided SII</span>
              </label>
            </div>

            {/* Unaided SII Indicator Badge */}
            {showUnaidedSII && (
              <div className="hearing-health-sii-score-bar">
                <span className="right">R: {rightSii}%</span>
                <span style={{ color: "var(--color-text-tertiary)" }}>|</span>
                <span className="left">L: {leftSii}%</span>
              </div>
            )}
          </div>

          {/* ================= RIGHT PANEL: LEFT EAR (L) ================= */}
          <div className="hearing-health-ear-card">
            <div className="hearing-health-ear-topbar">
              <span className="hearing-health-ear-badge left">L</span>
              <span className="hearing-health-ear-transducer-label">
                {activeRecord.transducerLeft}
              </span>
              <button
                type="button"
                className="hearing-health-ear-clear-btn"
                title="清空左耳数据"
                aria-label="清空左耳数据"
                onClick={() => handleClearEar("left")}
              >
                <Trash2 size={13} strokeWidth={1.6} />
              </button>
            </div>

            {/* Audiogram SVG Canvas */}
            <div className="hearing-health-chart-container">
              <svg
                className="hearing-health-chart-svg"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Speech Banana Overlay */}
                {showSpeechSpectrum && (
                  <polygon
                    points={`
                      ${getXByFreq(250)},${getY(15)}
                      ${getXByFreq(1000)},${getY(20)}
                      ${getXByFreq(4000)},${getY(25)}
                      ${getXByFreq(4000)},${getY(55)}
                      ${getXByFreq(1000)},${getY(50)}
                      ${getXByFreq(250)},${getY(40)}
                    `}
                    className="hearing-health-speech-banana"
                  />
                )}

                {/* Pictograms Overlay */}
                {showPictograms && (
                  <g>
                    <text x={getXByFreq(250)} y={getY(15)} className="hearing-health-pictogram-item">🍃</text>
                    <text x={getXByFreq(4000)} y={getY(15)} className="hearing-health-pictogram-item">🐦</text>
                    <text x={getXByFreq(500)} y={getY(30)} className="hearing-health-pictogram-item">💧</text>
                    <text x={getXByFreq(1000)} y={getY(45)} className="hearing-health-pictogram-item">🗣️</text>
                    <text x={getXByFreq(500)} y={getY(65)} className="hearing-health-pictogram-item">🎸</text>
                    <text x={getXByFreq(250)} y={getY(95)} className="hearing-health-pictogram-item">🚜</text>
                    <text x={getXByFreq(1000)} y={getY(110)} className="hearing-health-pictogram-item">✈️</text>
                  </g>
                )}

                {/* Horizontal Gridlines (dB HL) */}
                {[0, 20, 40, 60, 80, 100, 120].map((db) => {
                  const y = getY(db);
                  return (
                    <g key={db}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={chartWidth - padRight}
                        y2={y}
                        className="hearing-health-grid-line"
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 3}
                        fontSize={9}
                        fill="#8e8e93"
                        fontFamily="var(--font-sans)"
                        textAnchor="end"
                      >
                        {db}
                      </text>
                    </g>
                  );
                })}

                {/* Vertical Inter-Octave Lines */}
                {INTER_OCTAVES.map((freq) => {
                  const x = getXByFreq(freq);
                  return (
                    <line
                      key={freq}
                      x1={x}
                      y1={padTop}
                      x2={x}
                      y2={chartHeight - padBottom}
                      className="hearing-health-grid-line-inter"
                    />
                  );
                })}

                {/* Vertical Main Frequency Gridlines */}
                {FREQUENCIES.map((freq, i) => {
                  const x = getX(i);
                  return (
                    <g key={freq}>
                      <line
                        x1={x}
                        y1={padTop}
                        x2={x}
                        y2={chartHeight - padBottom}
                        className="hearing-health-grid-line"
                      />
                      <text
                        x={x}
                        y={chartHeight - padBottom + 15}
                        fontSize={9}
                        fill="#8e8e93"
                        fontFamily="var(--font-sans)"
                        textAnchor="middle"
                      >
                        {freq >= 1000 ? `${freq / 1000}k` : freq}
                      </text>
                    </g>
                  );
                })}

                {/* Curves Rendering for Left Ear (Blue) */}
                {/* AC Curve */}
                {buildSvgPath(activeRecord.left.ac) && (
                  <path d={buildSvgPath(activeRecord.left.ac)} className="hearing-health-path-ac-left" />
                )}
                {activeRecord.left.ac.map((db, i) =>
                  db !== null ? (
                    <g key={`lac-${i}`}>
                      <line x1={getX(i) - 3.8} y1={getY(db) - 3.8} x2={getX(i) + 3.8} y2={getY(db) + 3.8} stroke="#2563eb" strokeWidth={1.8} />
                      <line x1={getX(i) + 3.8} y1={getY(db) - 3.8} x2={getX(i) - 3.8} y2={getY(db) + 3.8} stroke="#2563eb" strokeWidth={1.8} />
                    </g>
                  ) : null,
                )}

                {/* BC Curve */}
                {buildSvgPath(activeRecord.left.bc) && (
                  <path d={buildSvgPath(activeRecord.left.bc)} className="hearing-health-path-bc-left" />
                )}
                {activeRecord.left.bc.map((db, i) =>
                  db !== null ? (
                    <text key={`lbc-${i}`} x={getX(i)} y={getY(db) + 3.5} fill="#2563eb" fontSize={11} fontWeight={600} textAnchor="middle">
                      &gt;
                    </text>
                  ) : null,
                )}

                {/* UCL Curve */}
                {buildSvgPath(activeRecord.left.ucl) && (
                  <path d={buildSvgPath(activeRecord.left.ucl)} className="hearing-health-path-ucl-left" />
                )}
                {activeRecord.left.ucl.map((db, i) =>
                  db !== null ? (
                    <text key={`lucl-${i}`} x={getX(i)} y={getY(db) + 3.5} fill="#2563eb" fontSize={10} fontWeight={600} textAnchor="middle">
                      m
                    </text>
                  ) : null,
                )}

                {/* Interactive Click Columns */}
                {FREQUENCIES.map((_, i) => (
                  <line
                    key={`hit-l-${i}`}
                    x1={getX(i)}
                    y1={padTop}
                    x2={getX(i)}
                    y2={chartHeight - padBottom}
                    stroke="transparent"
                    strokeWidth={20}
                    className="hearing-health-freq-hitarea"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickY = e.clientY - rect.top;
                      const ratio = (clickY - padTop) / innerH;
                      const rawDb = dbMin + ratio * (dbMax - dbMin);
                      const snappedDb = Math.max(-10, Math.min(120, Math.round(rawDb / 5) * 5));
                      handleChartClick("left", i, snappedDb);
                    }}
                  />
                ))}
              </svg>
            </div>

            {/* Audiogram Bottom Bar - Clean 2-Row Structured Layout */}
            <div className="hearing-health-ear-footer">
              <div className="hearing-health-ear-footer-row">
                <label className="hearing-health-use-toggle">
                  <input
                    type="checkbox"
                    style={{ display: "none" }}
                    checked={activeRecord.useAudiogramLeft}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRecords((prev) =>
                        prev.map((r) =>
                          r.id === activeRecordId ? { ...r, useAudiogramLeft: checked } : r,
                        ),
                      );
                    }}
                  />
                  <span
                    className={`hearing-health-green-dot ${
                      activeRecord.useAudiogramLeft ? "" : "off"
                    }`}
                  />
                  <span>Use audiogram</span>
                </label>

                <input
                  type="text"
                  className="hearing-health-date-input"
                  value={activeRecord.date}
                  aria-label="测试日期"
                  onChange={(e) => {
                    const val = e.target.value;
                    setRecords((prev) =>
                      prev.map((r) => (r.id === activeRecordId ? { ...r, date: val } : r)),
                    );
                  }}
                />
              </div>

              <select
                className="hearing-health-transducer-select"
                value={activeRecord.transducerLeft}
                aria-label="换能器类型"
                onChange={(e) => {
                  const val = e.target.value as TransducerType;
                  setRecords((prev) =>
                    prev.map((r) => (r.id === activeRecordId ? { ...r, transducerLeft: val } : r)),
                  );
                }}
              >
                <option value="Insert earphone">Insert earphone</option>
                <option value="Headphones">Headphones</option>
                <option value="Bone conductor">Bone conductor</option>
                <option value="Sound field">Sound field</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
