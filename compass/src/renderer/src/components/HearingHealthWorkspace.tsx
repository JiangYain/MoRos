import { Pencil, Plus, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { ignoreCommandFailure, useCompass } from "../store";
import { ClientProfileDialog } from "./ClientProfileDialog";
import {
  clientRegistryKey,
  HEARING_AID_BRANDS,
  type ClientProfileDraft,
} from "./client-registry";
import { AudiogramControls } from "./hearing-health/AudiogramControls";
import { AudiogramEarCard } from "./hearing-health/AudiogramEarCard";
import {
  audiogramDraftFromRecord,
  audiogramRecordFromClient,
  calculateSii,
  clearCurve,
  cloneEmptyThresholds,
  copyCurveToOtherEar,
  createAudiogramRecord,
  removeThresholdPoint,
  setThresholdMarker,
  updateThreshold,
  type AudiogramMarker,
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

const SAVE_DEBOUNCE_MS = 500;

type LoadStatus = "idle" | "loading" | "ready";

interface PendingSave {
  clientName: string;
  record: AudiogramRecord;
}

export function HearingHealthWorkspace(): React.JSX.Element {
  const { t } = useI18n();
  const clientRegistry = useCompass((state) => state.clientRegistry);
  const activeSessionId = useCompass((state) => state.stats?.sessionId);
  const hearingHealthClient = useCompass((state) => state.hearingHealthClient);
  const setHearingHealthClient = useCompass((state) => state.setHearingHealthClient);
  const profileOpen = useCompass((state) => state.hearingHealthProfileOpen);
  const setProfileOpen = useCompass((state) => state.setHearingHealthProfileOpen);
  const listClientAudiograms = useCompass((state) => state.listClientAudiograms);
  const saveClientAudiogram = useCompass((state) => state.saveClientAudiogram);
  const saveClientProfile = useCompass((state) => state.saveClientProfile);
  const updateClientProfile = useCompass((state) => state.updateClientProfile);

  const [records, setRecords] = useState<AudiogramRecord[]>([]);
  const [activeRecordKey, setActiveRecordKey] = useState<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [activeCurve, setActiveCurve] = useState<CurveType>("AC");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showSpeechSpectrum, setShowSpeechSpectrum] = useState(false);
  const [showPictograms, setShowPictograms] = useState(false);
  const [spLogramClientView, setSpLogramClientView] = useState(false);
  const [showUnaidedSii, setShowUnaidedSii] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const clients = clientRegistry.clients;
  const selectedClient = useMemo(() => {
    const byKey = new Map(clients.map((name) => [clientRegistryKey(name), name]));
    if (hearingHealthClient) {
      const existing = byKey.get(clientRegistryKey(hearingHealthClient));
      if (existing) return existing;
    }
    const assigned = activeSessionId ? clientRegistry.assignments[activeSessionId] : undefined;
    if (assigned) {
      const existing = byKey.get(clientRegistryKey(assigned));
      if (existing) return existing;
    }
    return null;
  }, [activeSessionId, clientRegistry.assignments, clients, hearingHealthClient]);
  const selectedProfile = selectedClient
    ? clientRegistry.profiles[clientRegistryKey(selectedClient)]
    : undefined;

  // Debounced persistence. The pending slot always holds the latest snapshot
  // of one record together with the client it belongs to, so late timers stay
  // correct across record and client switches. Saves run on a promise chain,
  // which lets an update that follows a still-in-flight insert adopt the
  // freshly assigned database id.
  const saveTimer = useRef<number | null>(null);
  const pendingSave = useRef<PendingSave | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const savedIds = useRef(new Map<string, number>());

  const flushPendingSave = useCallback((): void => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    saveChain.current = saveChain.current
      .then(async () => {
        const draft = audiogramDraftFromRecord(pending.record);
        const assignedId = savedIds.current.get(pending.record.key);
        if (draft.id === null && assignedId !== undefined) draft.id = assignedId;
        const saved = await saveClientAudiogram(pending.clientName, draft);
        savedIds.current.set(pending.record.key, saved.id);
        setRecords((current) => current.map((record) =>
          record.key === pending.record.key && record.id === null
            ? { ...record, id: saved.id }
            : record));
      })
      // Failures already reached the global error banner via the store command.
      .catch(() => undefined);
  }, [saveClientAudiogram]);

  const scheduleSave = useCallback((clientName: string, record: AudiogramRecord): void => {
    const pending = pendingSave.current;
    if (pending && (pending.record.key !== record.key || pending.clientName !== clientName)) {
      flushPendingSave();
    }
    pendingSave.current = { clientName, record };
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS);
  }, [flushPendingSave]);

  useEffect(() => () => flushPendingSave(), [flushPendingSave]);

  const requestToken = useRef(0);
  useEffect(() => {
    flushPendingSave();
    savedIds.current.clear();
    setRecords([]);
    setActiveRecordKey(null);
    setHistoryOpen(false);
    if (!selectedClient) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    const token = ++requestToken.current;
    const adopt = (loaded: AudiogramRecord[]): void => {
      if (requestToken.current !== token) return;
      const initial = loaded.length > 0 ? loaded : [createAudiogramRecord()];
      setRecords(initial);
      setActiveRecordKey(initial[0].key);
      setStatus("ready");
    };
    listClientAudiograms(selectedClient)
      .then((list) => adopt(list.map(audiogramRecordFromClient)))
      // The load failure is already on the global banner; an empty working
      // record keeps the chart usable without touching stored data.
      .catch(() => adopt([]));
  }, [flushPendingSave, listClientAudiograms, selectedClient]);

  const activeRecord = useMemo(
    () => records.find((record) => record.key === activeRecordKey) ?? records[0],
    [activeRecordKey, records],
  );

  const applyRecordUpdate = useCallback((update: (record: AudiogramRecord) => AudiogramRecord) => {
    if (!selectedClient || status !== "ready" || !activeRecord) return;
    const updated = update(activeRecord);
    if (updated === activeRecord) return;
    setRecords((current) => current.map(
      (record) => record.key === activeRecord.key ? updated : record,
    ));
    scheduleSave(selectedClient, updated);
  }, [activeRecord, scheduleSave, selectedClient, status]);

  const addHistory = useCallback(() => {
    if (!selectedClient || status !== "ready") return;
    const record = createAudiogramRecord();
    setRecords((current) => [record, ...current]);
    setActiveRecordKey(record.key);
    scheduleSave(selectedClient, record);
  }, [scheduleSave, selectedClient, status]);

  const selectRecord = useCallback((recordKey: string) => {
    setActiveRecordKey(recordKey);
    setHistoryOpen(false);
  }, []);

  const clearEar = useCallback((ear: EarSide) => {
    applyRecordUpdate((record) => ({ ...record, [ear]: cloneEmptyThresholds() }));
  }, [applyRecordUpdate]);

  const changeThreshold = useCallback((ear: EarSide, frequencyIndex: number, db: number) => {
    applyRecordUpdate((record) => updateThreshold(record, ear, activeCurve, frequencyIndex, db));
  }, [activeCurve, applyRecordUpdate]);

  const removePoint = useCallback((ear: EarSide, curve: CurveType, frequencyIndex: number) => {
    applyRecordUpdate((record) => removeThresholdPoint(record, ear, curve, frequencyIndex));
  }, [applyRecordUpdate]);

  const setMarker = useCallback((
    ear: EarSide,
    curve: CurveType,
    frequencyIndex: number,
    marker: AudiogramMarker,
  ) => {
    applyRecordUpdate((record) => setThresholdMarker(record, ear, curve, frequencyIndex, marker));
  }, [applyRecordUpdate]);

  const clearEarCurve = useCallback((ear: EarSide, curve: CurveType) => {
    applyRecordUpdate((record) => clearCurve(record, ear, curve));
  }, [applyRecordUpdate]);

  const copyCurve = useCallback((ear: EarSide, curve: CurveType) => {
    applyRecordUpdate((record) => copyCurveToOtherEar(record, ear, curve));
  }, [applyRecordUpdate]);

  const changeTransducer = useCallback((ear: EarSide, transducer: TransducerType) => {
    const key = ear === "right" ? "transducerRight" : "transducerLeft";
    applyRecordUpdate((record) => ({ ...record, [key]: transducer }));
  }, [applyRecordUpdate]);

  const changeDate = useCallback((date: string) => {
    applyRecordUpdate((record) => ({ ...record, date }));
  }, [applyRecordUpdate]);

  const closeCreateDialog = useCallback(() => setCreateDialogOpen(false), []);
  const saveCreateDialog = useCallback((profile: ClientProfileDraft) => {
    ignoreCommandFailure(saveClientProfile(profile).then(() => {
      setHearingHealthClient(profile.name);
      setCreateDialogOpen(false);
    }));
  }, [saveClientProfile, setHearingHealthClient]);

  // Baseline that seeds the profile edit dialog whenever it opens.
  const profileBaseline = useMemo<ClientProfileDraft | null>(() => {
    if (!selectedClient) return null;
    return {
      name: selectedProfile?.displayName ?? selectedClient,
      gender: selectedProfile?.gender ?? null,
      age: selectedProfile?.age ?? null,
      contact: selectedProfile?.contact ?? "",
      notes: selectedProfile?.notes ?? "",
      hearingAidBrands: selectedProfile ? [...selectedProfile.hearingAidBrands] : [],
    };
  }, [selectedClient, selectedProfile]);

  const closeProfileDialog = useCallback(() => setProfileOpen(false), [setProfileOpen]);
  const saveProfileDialog = useCallback((profile: ClientProfileDraft) => {
    if (!selectedClient) return;
    ignoreCommandFailure(
      updateClientProfile(selectedClient, profile).then(() => setProfileOpen(false)),
    );
  }, [selectedClient, setProfileOpen, updateClientProfile]);

  const clientMeta = useMemo(() => {
    if (!selectedProfile) return "";
    const parts: string[] = [];
    if (selectedProfile.age !== null) parts.push(t("hearingHealth.ageValue", { age: selectedProfile.age }));
    const brand = HEARING_AID_BRANDS.find(
      (candidate) => candidate.value === selectedProfile.hearingAidBrands[0],
    );
    if (brand) parts.push(brand.label);
    return parts.join(" · ");
  }, [selectedProfile, t]);

  const earCard = (ear: EarSide): React.JSX.Element | null => activeRecord ? (
    <AudiogramEarCard
      ear={ear}
      record={activeRecord}
      activeCurve={activeCurve}
      showPictograms={showPictograms}
      showSpeechSpectrum={showSpeechSpectrum}
      onClear={() => clearEar(ear)}
      onClearCurve={(curve) => clearEarCurve(ear, curve)}
      onCopyCurve={(curve) => copyCurve(ear, curve)}
      onDateChange={changeDate}
      onRemovePoint={(curve, frequencyIndex) => removePoint(ear, curve, frequencyIndex)}
      onSetMarker={(curve, frequencyIndex, marker) => setMarker(ear, curve, frequencyIndex, marker)}
      onThresholdChange={(frequencyIndex, db) => changeThreshold(ear, frequencyIndex, db)}
      onTransducerChange={(transducer) => changeTransducer(ear, transducer)}
    />
  ) : null;

  return (
    <section className="hearing-health-workspace" aria-label={t("hearingHealth.title")}>
      <div className="hearing-health-container">
        <header className="hearing-health-header">
          <div className="hearing-health-header-row">
            <h1 className="hearing-health-title">{t("hearingHealth.title")}</h1>
            <div className="hearing-health-clientbar">
              {selectedClient && (
                <span className="hearing-health-client-meta">
                  {clientMeta && <span className="hearing-health-client-meta-text">{clientMeta}</span>}
                  <button
                    type="button"
                    className="hearing-health-client-edit-btn"
                    aria-haspopup="dialog"
                    onClick={() => setProfileOpen(true)}
                  >
                    <Pencil size={11} strokeWidth={1.6} aria-hidden="true" />
                    {t("client.editAction")}
                  </button>
                </span>
              )}
              {selectedClient && (
                <span className="hearing-health-client-name">
                  <User size={13} strokeWidth={1.6} aria-hidden="true" />
                  <span className="hearing-health-client-name-text">{selectedClient}</span>
                </span>
              )}
            </div>
          </div>
        </header>
        {selectedClient && activeRecord && status === "ready" ? (
          <div className="hearing-health-fitting-grid">
            {earCard("right")}
            <AudiogramControls
              activeCurve={activeCurve}
              activeRecordKey={activeRecord.key}
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
        ) : !selectedClient ? (
          <div className="hearing-health-empty">
            <p className="hearing-health-empty-title">{t("hearingHealth.noClient")}</p>
            <p className="hearing-health-empty-hint">{t("hearingHealth.noClientHint")}</p>
            <button
              type="button"
              className="hearing-health-empty-new"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus size={13} strokeWidth={1.6} aria-hidden="true" />
              {t("sidebar.newClient")}
            </button>
          </div>
        ) : null}
      </div>
      {createDialogOpen && createPortal(
        <ClientProfileDialog
          key="hh-new-client"
          existingClients={clients}
          onClose={closeCreateDialog}
          onSave={saveCreateDialog}
        />,
        document.body,
      )}
      {profileOpen && selectedClient && profileBaseline && createPortal(
        <ClientProfileDialog
          key={`hh-edit-${clientRegistryKey(selectedClient)}`}
          existingClients={clients}
          initialProfile={profileBaseline}
          onClose={closeProfileDialog}
          onSave={saveProfileDialog}
        />,
        document.body,
      )}
    </section>
  );
}
