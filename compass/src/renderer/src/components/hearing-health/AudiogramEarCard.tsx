import { Trash2 } from "lucide-react";
import { AudiogramChart } from "./AudiogramChart";
import type { AudiogramRecord, EarSide, TransducerType } from "./model";

const TRANSDUCERS: TransducerType[] = [
  "Insert earphone",
  "Headphones",
  "Bone conductor",
  "Sound field",
];

interface AudiogramEarCardProps {
  ear: EarSide;
  record: AudiogramRecord;
  showPictograms: boolean;
  showSpeechSpectrum: boolean;
  onClear: () => void;
  onDateChange: (date: string) => void;
  onThresholdChange: (frequencyIndex: number, db: number) => void;
  onTransducerChange: (transducer: TransducerType) => void;
  onUseChange: (enabled: boolean) => void;
}

export function AudiogramEarCard(props: AudiogramEarCardProps): React.JSX.Element {
  const isRight = props.ear === "right";
  const label = isRight ? "R" : "L";
  const transducer = isRight ? props.record.transducerRight : props.record.transducerLeft;
  const useAudiogram = isRight ? props.record.useAudiogramRight : props.record.useAudiogramLeft;

  return (
    <div className="hearing-health-ear-card">
      <div className="hearing-health-ear-topbar">
        <span className={`hearing-health-ear-badge ${props.ear}`}>{label}</span>
        <span className="hearing-health-ear-transducer-label">{transducer}</span>
        <button
          type="button"
          className="hearing-health-ear-clear-btn"
          title={`清空${isRight ? "右" : "左"}耳数据`}
          aria-label={`清空${isRight ? "右" : "左"}耳数据`}
          onClick={props.onClear}
        >
          <Trash2 size={13} strokeWidth={1.6} />
        </button>
      </div>

      <AudiogramChart
        ear={props.ear}
        thresholds={props.record[props.ear]}
        showPictograms={props.showPictograms}
        showSpeechSpectrum={props.showSpeechSpectrum}
        onThresholdChange={props.onThresholdChange}
      />

      <div className="hearing-health-ear-footer">
        <div className="hearing-health-ear-footer-row">
          <label className="hearing-health-use-toggle">
            <input
              type="checkbox"
              style={{ display: "none" }}
              checked={useAudiogram}
              onChange={(event) => props.onUseChange(event.target.checked)}
            />
            <span className={`hearing-health-green-dot ${useAudiogram ? "" : "off"}`} />
            <span>Use audiogram</span>
          </label>

          <input
            type="text"
            className="hearing-health-date-input"
            value={props.record.date}
            aria-label="测试日期"
            onChange={(event) => props.onDateChange(event.target.value)}
          />
        </div>

        <select
          className="hearing-health-transducer-select"
          value={transducer}
          aria-label="换能器类型"
          onChange={(event) => props.onTransducerChange(event.target.value as TransducerType)}
        >
          {TRANSDUCERS.map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
      </div>
    </div>
  );
}
