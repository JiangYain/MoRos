import { Trash2 } from "lucide-react";
import { useI18n, type TranslationKey } from "../../i18n";
import { AudiogramChart } from "./AudiogramChart";
import type {
  AudiogramMarker,
  AudiogramRecord,
  CurveType,
  EarSide,
  TransducerType,
} from "./model";

const TRANSDUCER_LABEL_KEYS: Record<TransducerType, TranslationKey> = {
  "Insert earphone": "hearingHealth.transducer.insert",
  "Headphones": "hearingHealth.transducer.headphones",
  "Bone conductor": "hearingHealth.transducer.bone",
  "Sound field": "hearingHealth.transducer.soundField",
};

const TRANSDUCERS = Object.keys(TRANSDUCER_LABEL_KEYS) as TransducerType[];

interface AudiogramEarCardProps {
  ear: EarSide;
  record: AudiogramRecord;
  activeCurve: CurveType;
  showPictograms: boolean;
  showSpeechSpectrum: boolean;
  onClear: () => void;
  onClearCurve: (curve: CurveType) => void;
  onCopyCurve: (curve: CurveType) => void;
  onDateChange: (date: string) => void;
  onRemovePoint: (curve: CurveType, frequencyIndex: number) => void;
  onSetMarker: (curve: CurveType, frequencyIndex: number, marker: AudiogramMarker) => void;
  onThresholdChange: (frequencyIndex: number, db: number) => void;
  onTransducerChange: (transducer: TransducerType) => void;
}

export function AudiogramEarCard(props: AudiogramEarCardProps): React.JSX.Element {
  const { t } = useI18n();
  const isRight = props.ear === "right";
  const label = isRight ? "R" : "L";
  const transducer = isRight ? props.record.transducerRight : props.record.transducerLeft;
  const clearLabel = t(isRight ? "hearingHealth.clearRight" : "hearingHealth.clearLeft");

  return (
    <div className="hearing-health-ear-card">
      <div className="hearing-health-ear-topbar">
        <span className={`hearing-health-ear-badge ${props.ear}`}>{label}</span>
        <span className="hearing-health-ear-transducer-label">{t(TRANSDUCER_LABEL_KEYS[transducer])}</span>
        <button
          type="button"
          className="hearing-health-ear-clear-btn"
          title={clearLabel}
          aria-label={clearLabel}
          onClick={props.onClear}
        >
          <Trash2 size={13} strokeWidth={1.6} />
        </button>
      </div>

      <AudiogramChart
        ear={props.ear}
        thresholds={props.record[props.ear]}
        activeCurve={props.activeCurve}
        showPictograms={props.showPictograms}
        showSpeechSpectrum={props.showSpeechSpectrum}
        onThresholdChange={props.onThresholdChange}
        onRemovePoint={props.onRemovePoint}
        onSetMarker={props.onSetMarker}
        onCopyCurve={props.onCopyCurve}
        onClearCurve={props.onClearCurve}
      />

      <div className="hearing-health-ear-footer">
        <select
          className="hearing-health-transducer-select"
          value={transducer}
          aria-label={t("hearingHealth.transducerType")}
          onChange={(event) => props.onTransducerChange(event.target.value as TransducerType)}
        >
          {TRANSDUCERS.map((option) => (
            <option value={option} key={option}>{t(TRANSDUCER_LABEL_KEYS[option])}</option>
          ))}
        </select>
        <input
          type="date"
          className="hearing-health-date-input"
          value={props.record.date}
          aria-label={t("hearingHealth.testDate")}
          onChange={(event) => {
            // An empty value means the picker was cleared; keep the last valid date.
            if (event.target.value) props.onDateChange(event.target.value);
          }}
        />
      </div>
    </div>
  );
}
