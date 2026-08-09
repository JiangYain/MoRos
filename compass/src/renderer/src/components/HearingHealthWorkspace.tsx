import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { AudiogramControls } from "./hearing-health/AudiogramControls";
import { AudiogramEarCard } from "./hearing-health/AudiogramEarCard";
import {
  calculateSii,
  cloneEmptyThresholds,
  createAudiogramRecord,
  INITIAL_RECORDS,
  updateThreshold,
  type AudiogramRecord,
  type CurveType,
  type EarSide,
  type TransducerType,
} from "./hearing-health/model";

export type {
  AudiogramRecord,
  CurveType,
  EarThresholds,
  TransducerType,
} from "./hearing-health/model";

export function HearingHealthWorkspace(): React.JSX.Element {
  const { t } = useI18n();
  const [records, setRecords] = useState<AudiogramRecord[]>(INITIAL_RECORDS);
  const [activeRecordId, setActiveRecordId] = useState("rec-1");
  const [activeCurve, setActiveCurve] = useState<CurveType>("AC");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showSpeechSpectrum, setShowSpeechSpectrum] = useState(false);
  const [showPictograms, setShowPictograms] = useState(false);
  const [spLogramClientView, setSpLogramClientView] = useState(false);
  const [showUnaidedSii, setShowUnaidedSii] = useState(false);

  const activeRecord = useMemo(
    () => records.find((record) => record.id === activeRecordId) ?? records[0],
    [activeRecordId, records],
  );

  const updateActiveRecord = useCallback((update: (record: AudiogramRecord) => AudiogramRecord) => {
    setRecords((current) => current.map((record) => record.id === activeRecordId ? update(record) : record));
  }, [activeRecordId]);

  const addHistory = useCallback(() => {
    const record = createAudiogramRecord();
    setRecords((current) => [record, ...current]);
    setActiveRecordId(record.id);
  }, []);

  const selectRecord = useCallback((recordId: string) => {
    setActiveRecordId(recordId);
    setHistoryOpen(false);
  }, []);

  const clearEar = useCallback((ear: EarSide) => {
    updateActiveRecord((record) => ({ ...record, [ear]: cloneEmptyThresholds() }));
  }, [updateActiveRecord]);

  const changeThreshold = useCallback((ear: EarSide, frequencyIndex: number, db: number) => {
    updateActiveRecord((record) => updateThreshold(record, ear, activeCurve, frequencyIndex, db));
  }, [activeCurve, updateActiveRecord]);

  const changeUseAudiogram = useCallback((ear: EarSide, enabled: boolean) => {
    const key = ear === "right" ? "useAudiogramRight" : "useAudiogramLeft";
    updateActiveRecord((record) => ({ ...record, [key]: enabled }));
  }, [updateActiveRecord]);

  const changeTransducer = useCallback((ear: EarSide, transducer: TransducerType) => {
    const key = ear === "right" ? "transducerRight" : "transducerLeft";
    updateActiveRecord((record) => ({ ...record, [key]: transducer }));
  }, [updateActiveRecord]);

  const changeDate = useCallback((date: string) => {
    updateActiveRecord((record) => ({ ...record, date }));
  }, [updateActiveRecord]);

  const earCard = (ear: EarSide): React.JSX.Element => (
    <AudiogramEarCard
      ear={ear}
      record={activeRecord}
      showPictograms={showPictograms}
      showSpeechSpectrum={showSpeechSpectrum}
      onClear={() => clearEar(ear)}
      onDateChange={changeDate}
      onThresholdChange={(frequencyIndex, db) => changeThreshold(ear, frequencyIndex, db)}
      onTransducerChange={(transducer) => changeTransducer(ear, transducer)}
      onUseChange={(enabled) => changeUseAudiogram(ear, enabled)}
    />
  );

  return (
    <section className="hearing-health-workspace" aria-label={t("hearingHealth.title")}>
      <div className="hearing-health-container">
        <header className="hearing-health-header">
          <h1 className="hearing-health-title">{t("hearingHealth.title")}</h1>
        </header>
        <div className="hearing-health-fitting-grid">
          {earCard("right")}
          <AudiogramControls
            activeCurve={activeCurve}
            activeRecordId={activeRecordId}
            records={records}
            historyOpen={historyOpen}
            leftSii={calculateSii(activeRecord.left.ac)}
            rightSii={calculateSii(activeRecord.right.ac)}
            showPictograms={showPictograms}
            showSpeechSpectrum={showSpeechSpectrum}
            showUnaidedSii={showUnaidedSii}
            spLogramClientView={spLogramClientView}
            onActiveCurveChange={setActiveCurve}
            onAddHistory={addHistory}
            onHistoryOpenChange={setHistoryOpen}
            onRecordChange={selectRecord}
            onShowPictogramsChange={setShowPictograms}
            onShowSpeechSpectrumChange={setShowSpeechSpectrum}
            onShowUnaidedSiiChange={setShowUnaidedSii}
            onSpLogramClientViewChange={setSpLogramClientView}
          />
          {earCard("left")}
        </div>
      </div>
    </section>
  );
}
