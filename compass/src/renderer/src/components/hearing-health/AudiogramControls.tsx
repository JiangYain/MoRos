import { Calendar, ChevronDown, Plus } from "lucide-react";
import type { AudiogramRecord, CurveType } from "./model";

const CURVES: readonly CurveType[] = ["AC", "BC", "UCL"];

interface AudiogramControlsProps {
  activeCurve: CurveType;
  activeRecordId: string;
  records: AudiogramRecord[];
  historyOpen: boolean;
  leftSii: number;
  rightSii: number;
  showPictograms: boolean;
  showSpeechSpectrum: boolean;
  showUnaidedSii: boolean;
  spLogramClientView: boolean;
  onActiveCurveChange: (curve: CurveType) => void;
  onAddHistory: () => void;
  onHistoryOpenChange: (open: boolean) => void;
  onRecordChange: (recordId: string) => void;
  onShowPictogramsChange: (show: boolean) => void;
  onShowSpeechSpectrumChange: (show: boolean) => void;
  onShowUnaidedSiiChange: (show: boolean) => void;
  onSpLogramClientViewChange: (show: boolean) => void;
}

function CurveSymbol({ curve, ear }: { curve: CurveType; ear: "right" | "left" }): React.JSX.Element {
  const color = ear === "right" ? "#dc2626" : "#2563eb";
  const marker = curve === "BC" ? (ear === "right" ? "<" : ">") : curve === "UCL" ? "m" : null;
  return (
    <svg width="18" height="12">
      <line x1="1" y1="6" x2="17" y2="6" stroke={color} strokeWidth={curve === "AC" ? 1.5 : 1.2} strokeDasharray={curve === "BC" ? "3 2" : curve === "UCL" ? "2 2" : undefined} />
      {curve === "AC" && ear === "right" && <circle cx="9" cy="6" r="3.2" fill="#ffffff" stroke={color} strokeWidth="1.5" />}
      {curve === "AC" && ear === "left" && (
        <>
          <line x1="5" y1="2" x2="13" y2="10" stroke={color} strokeWidth="1.5" />
          <line x1="13" y1="2" x2="5" y2="10" stroke={color} strokeWidth="1.5" />
        </>
      )}
      {marker && <text x="9" y="9" fill={color} fontSize={curve === "BC" ? 11 : 10} fontWeight={600} textAnchor="middle">{marker}</text>}
    </svg>
  );
}

export function AudiogramControls(props: AudiogramControlsProps): React.JSX.Element {
  const activeRecord = props.records.find((record) => record.id === props.activeRecordId) ?? props.records[0];
  return (
    <div className="hearing-health-center-panel">
      <div className="hearing-health-history-box" style={{ position: "relative" }}>
        <button type="button" className="hearing-health-history-btn" onClick={() => props.onHistoryOpenChange(!props.historyOpen)}>
          <Calendar size={12} strokeWidth={1.6} />
          <span>History: {activeRecord.date}</span>
          <ChevronDown size={12} strokeWidth={1.6} />
        </button>
        {props.historyOpen && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, marginTop: 4, background: "var(--color-bg)", border: "0.5px solid var(--color-border)", borderRadius: "var(--border-radius-xs)", boxShadow: "var(--shadow-popover)", overflow: "hidden" }}>
            {props.records.map((record) => (
              <button
                key={record.id}
                type="button"
                style={{ width: "100%", padding: "6px 10px", border: "none", background: record.id === props.activeRecordId ? "var(--color-surface)" : "transparent", textAlign: "left", fontSize: "11px", cursor: "pointer" }}
                onClick={() => props.onRecordChange(record.id)}
              >
                {record.date}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="hearing-health-add-history-btn" onClick={props.onAddHistory}>
          <Plus size={12} strokeWidth={1.8} />
          <span>Add to history</span>
        </button>
      </div>

      <div className="hearing-health-curve-selector">
        {CURVES.map((curve) => (
          <div className="hearing-health-curve-row" key={curve}>
            <span className="hearing-health-curve-symbol-left"><CurveSymbol curve={curve} ear="right" /></span>
            <button type="button" className={`hearing-health-curve-badge ${props.activeCurve === curve ? "active" : ""}`} onClick={() => props.onActiveCurveChange(curve)}>{curve}</button>
            <span className="hearing-health-curve-symbol-right"><CurveSymbol curve={curve} ear="left" /></span>
          </div>
        ))}
      </div>

      <div className="hearing-health-options-box">
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.showSpeechSpectrum} onChange={(event) => props.onShowSpeechSpectrumChange(event.target.checked)} /><span>Show speech spectrum</span></label>
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.showPictograms} onChange={(event) => props.onShowPictogramsChange(event.target.checked)} /><span>Show pictograms</span></label>
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.spLogramClientView} onChange={(event) => props.onSpLogramClientViewChange(event.target.checked)} /><span>SPLogram in client view</span></label>
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.showUnaidedSii} onChange={(event) => props.onShowUnaidedSiiChange(event.target.checked)} /><span>Show unaided SII</span></label>
      </div>

      {props.showUnaidedSii && (
        <div className="hearing-health-sii-score-bar">
          <span className="right">R: {props.rightSii}%</span>
          <span style={{ color: "var(--color-text-tertiary)" }}>|</span>
          <span className="left">L: {props.leftSii}%</span>
        </div>
      )}
    </div>
  );
}
