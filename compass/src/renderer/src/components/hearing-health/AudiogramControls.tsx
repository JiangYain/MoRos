import { Calendar, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { localeFor, useI18n } from "../../i18n";
import type { AudiogramRecord, CurveType } from "./model";
import { useDropdownDismiss } from "./use-dropdown-dismiss";

const CURVES: readonly CurveType[] = ["AC", "BC", "UCL"];

interface AudiogramControlsProps {
  activeCurve: CurveType;
  activeRecordKey: string | null;
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
  onDeleteRecord: (recordKey: string) => void;
  onHistoryOpenChange: (open: boolean) => void;
  onRecordChange: (recordKey: string) => void;
  onShowPictogramsChange: (show: boolean) => void;
  onShowSpeechSpectrumChange: (show: boolean) => void;
  onShowUnaidedSiiChange: (show: boolean) => void;
  onSpLogramClientViewChange: (show: boolean) => void;
}

export function formatAudiogramDate(date: string, locale: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function CurveSymbol({ curve, ear }: { curve: CurveType; ear: "right" | "left" }): React.JSX.Element {
  const color = ear === "right" ? "var(--hh-ear-right)" : "var(--hh-ear-left)";
  const marker = curve === "BC" ? (ear === "right" ? "<" : ">") : curve === "UCL" ? "m" : null;
  return (
    <svg width="18" height="12" aria-hidden="true">
      <line x1="1" y1="6" x2="17" y2="6" stroke={color} strokeWidth={curve === "AC" ? 1.5 : 1.2} strokeDasharray={curve === "BC" ? "3 2" : curve === "UCL" ? "2 2" : undefined} />
      {curve === "AC" && ear === "right" && <circle cx="9" cy="6" r="3.2" fill="var(--color-bg)" stroke={color} strokeWidth="1.5" />}
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
  const { language, t } = useI18n();
  const historyRef = useRef<HTMLDivElement>(null);
  const activeRecord = props.records.find((record) => record.key === props.activeRecordKey)
    ?? props.records[0];
  const closeHistory = (): void => props.onHistoryOpenChange(false);
  useDropdownDismiss(props.historyOpen, historyRef, closeHistory);

  return (
    <div className="hearing-health-center-panel">
      <div className="hearing-health-history-box" ref={historyRef}>
        <button
          type="button"
          className="hearing-health-history-btn"
          aria-haspopup="listbox"
          aria-expanded={props.historyOpen}
          onClick={() => props.onHistoryOpenChange(!props.historyOpen)}
        >
          <Calendar size={12} strokeWidth={1.6} aria-hidden="true" />
          <span>
            {t("hearingHealth.historyLabel", {
              date: activeRecord ? formatAudiogramDate(activeRecord.date, localeFor(language)) : "—",
            })}
          </span>
          <ChevronDown size={12} strokeWidth={1.6} aria-hidden="true" />
        </button>
        {props.historyOpen && (
          <div className="hearing-health-history-menu" role="listbox" aria-label={t("hearingHealth.historyMenu")}>
            {props.records.map((record) => {
              const dateLabel = formatAudiogramDate(record.date, localeFor(language));
              const deleteLabel = t("hearingHealth.deleteRecord", { date: dateLabel });
              return (
                <div className="hearing-health-history-row" key={record.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={record.key === activeRecord?.key}
                    className={`hearing-health-history-option${record.key === activeRecord?.key ? " active" : ""}`}
                    onClick={() => props.onRecordChange(record.key)}
                  >
                    {dateLabel}
                  </button>
                  <button
                    type="button"
                    className="hearing-health-history-delete"
                    aria-label={deleteLabel}
                    title={deleteLabel}
                    onClick={() => props.onDeleteRecord(record.key)}
                  >
                    <Trash2 size={12} strokeWidth={1.6} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" className="hearing-health-add-history-btn" onClick={props.onAddHistory}>
          <Plus size={12} strokeWidth={1.8} aria-hidden="true" />
          <span>{t("hearingHealth.addToHistory")}</span>
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
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.showSpeechSpectrum} onChange={(event) => props.onShowSpeechSpectrumChange(event.target.checked)} /><span>{t("hearingHealth.showSpeechSpectrum")}</span></label>
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.showPictograms} onChange={(event) => props.onShowPictogramsChange(event.target.checked)} /><span>{t("hearingHealth.showPictograms")}</span></label>
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.spLogramClientView} onChange={(event) => props.onSpLogramClientViewChange(event.target.checked)} /><span>{t("hearingHealth.splClientView")}</span></label>
        <label className="hearing-health-checkbox-label"><input type="checkbox" checked={props.showUnaidedSii} onChange={(event) => props.onShowUnaidedSiiChange(event.target.checked)} /><span>{t("hearingHealth.showUnaidedSii")}</span></label>
      </div>

      {props.showUnaidedSii && (
        <div className="hearing-health-sii-score-bar">
          <span className="right">R: {props.rightSii}%</span>
          <span className="hearing-health-sii-divider">|</span>
          <span className="left">L: {props.leftSii}%</span>
        </div>
      )}
    </div>
  );
}
