import { Check, CircleAlert, Clock, LoaderCircle, Pencil, Plus, User } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { localeFor, useI18n, type TranslationKey } from "../i18n";
import { ignoreCommandFailure, useCompass } from "../store";
import { ClientProfileDialog } from "./ClientProfileDialog";
import {
  clientRegistryKey,
  HEARING_AID_BRANDS,
  type ClientProfileDraft,
} from "./client-registry";
import { AudiogramControls, formatAudiogramDate } from "./hearing-health/AudiogramControls";
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
const SAVED_RESET_MS = 2000;

type LoadStatus = "idle" | "loading" | "ready";
type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_STATUS_KEYS: Record<Exclude<SaveStatus, "idle">, TranslationKey> = {
  pending: "hearingHealth.save.pending",
  saving: "hearingHealth.save.saving",
  saved: "hearingHealth.save.saved",
  error: "hearingHealth.save.error",
};

type PendingDestructive =
  | { kind: "ear"; ear: EarSide }
  | { kind: "curve"; ear: EarSide; curve: CurveType }
  | { kind: "record"; recordKey: string };

interface PendingSave {
  clientName: string;
  record: AudiogramRecord;
}

function SaveStatusIndicator({ status }: { status: SaveStatus }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <span className="hearing-health-save-indicator" aria-live="polite" data-status={status}>
      {status !== "idle" && (
        <>
          {status === "pending" && <Clock size={11} strokeWidth={1.6} aria-hidden="true" />}
          {status === "saving" && (
            <LoaderCircle
              size={11}
              strokeWidth={1.6}
              aria-hidden="true"
              className="hearing-health-save-spinner"
            />
          )}
          {status === "saved" && <Check size={11} strokeWidth={1.8} aria-hidden="true" />}
          {status === "error" && <CircleAlert size={11} strokeWidth={1.6} aria-hidden="true" />}
          <span>{t(SAVE_STATUS_KEYS[status])}</span>
        </>
      )}
    </span>
  );
}

/** Loading placeholder mirroring the three-column fitting grid. */
function HearingHealthSkeleton(): React.JSX.Element {
  const earCard = (
    <div className="hearing-health-ear-card">
      <div className="hearing-health-skeleton-block hearing-health-skeleton-topbar" />
      <div className="hearing-health-skeleton-block hearing-health-skeleton-chart" />
      <div className="hearing-health-skeleton-block hearing-health-skeleton-footer" />
    </div>
  );
  return (
    <div className="hearing-health-fitting-grid" aria-hidden="true">
      {earCard}
      <div className="hearing-health-center-panel">
        <div className="hearing-health-skeleton-block hearing-health-skeleton-control" />
        <div className="hearing-health-skeleton-block hearing-health-skeleton-panel" />
        <div className="hearing-health-skeleton-block hearing-health-skeleton-panel" />
      </div>
      {earCard}
    </div>
  );
}

function DestructiveConfirmation({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel(): void;
  onConfirm(): void;
}): React.JSX.Element {
  const { t } = useI18n();
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);
  return (
    <div
      className="client-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel();
      }}
    >
      <div
        className="client-delete-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={bodyId}>{body}</p>
        <div className="client-delete-actions">
          <button type="button" className="client-profile-cancel" autoFocus onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="client-delete-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HearingHealthWorkspace(): React.JSX.Element {
  const { language, t } = useI18n();
  const clientRegistry = useCompass((state) => state.clientRegistry);
  const activeSessionId = useCompass((state) => state.stats?.sessionId);
  const hearingHealthClient = useCompass((state) => state.hearingHealthClient);
  const setHearingHealthClient = useCompass((state) => state.setHearingHealthClient);
  const profileOpen = useCompass((state) => state.hearingHealthProfileOpen);
  const setProfileOpen = useCompass((state) => state.setHearingHealthProfileOpen);
  const listClientAudiograms = useCompass((state) => state.listClientAudiograms);
  const saveClientAudiogram = useCompass((state) => state.saveClientAudiogram);
  const deleteClientAudiogram = useCompass((state) => state.deleteClientAudiogram);
  const saveClientProfile = useCompass((state) => state.saveClientProfile);
  const updateClientProfile = useCompass((state) => state.updateClientProfile);

  const [records, setRecords] = useState<AudiogramRecord[]>([]);
  const [activeRecordKey, setActiveRecordKey] = useState<string | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [pendingDestructive, setPendingDestructive] = useState<PendingDestructive | null>(null);
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
  const activeSaveCount = useRef(0);
  const savedResetTimer = useRef<number | null>(null);

  const clearSavedResetTimer = useCallback((): void => {
    if (savedResetTimer.current !== null) {
      window.clearTimeout(savedResetTimer.current);
      savedResetTimer.current = null;
    }
  }, []);

  const flushPendingSave = useCallback((): void => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingSave.current;
    if (!pending) return;
    pendingSave.current = null;
    activeSaveCount.current += 1;
    clearSavedResetTimer();
    setSaveStatus("saving");
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
        activeSaveCount.current -= 1;
        // Report "saved" only once nothing is queued or in flight anymore.
        if (activeSaveCount.current === 0 && pendingSave.current === null) {
          setSaveStatus("saved");
          clearSavedResetTimer();
          savedResetTimer.current = window.setTimeout(() => {
            savedResetTimer.current = null;
            setSaveStatus((current) => (current === "saved" ? "idle" : current));
          }, SAVED_RESET_MS);
        }
      })
      // Failures already reached the global error banner via the store command.
      .catch(() => {
        activeSaveCount.current -= 1;
        setSaveStatus("error");
      });
  }, [clearSavedResetTimer, saveClientAudiogram]);

  const scheduleSave = useCallback((clientName: string, record: AudiogramRecord): void => {
    const pending = pendingSave.current;
    if (pending && (pending.record.key !== record.key || pending.clientName !== clientName)) {
      flushPendingSave();
    }
    pendingSave.current = { clientName, record };
    clearSavedResetTimer();
    setSaveStatus("pending");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS);
  }, [clearSavedResetTimer, flushPendingSave]);

  useEffect(() => () => {
    flushPendingSave();
    clearSavedResetTimer();
  }, [clearSavedResetTimer, flushPendingSave]);

  const requestToken = useRef(0);
  useEffect(() => {
    flushPendingSave();
    // A switch-triggered flush keeps reporting saving/saved through the
    // indicator; with nothing in flight, stale saved/error state from the
    // previous client resets instead.
    if (activeSaveCount.current === 0) {
      clearSavedResetTimer();
      setSaveStatus("idle");
    }
    savedIds.current.clear();
    setRecords([]);
    setActiveRecordKey(null);
    setHistoryOpen(false);
    // A confirmation captured for the previous client must not run against
    // the newly selected client's records.
    setPendingDestructive(null);
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
  }, [clearSavedResetTimer, flushPendingSave, listClientAudiograms, selectedClient]);

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

  const deleteRecord = useCallback((recordKey: string) => {
    if (!selectedClient || status !== "ready") return;
    const target = records.find((record) => record.key === recordKey);
    if (!target) return;
    // Drop any queued debounce save so it cannot re-insert the deleted record.
    if (pendingSave.current?.record.key === recordKey) {
      pendingSave.current = null;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (activeSaveCount.current === 0) {
        setSaveStatus((current) => (current === "pending" ? "idle" : current));
      }
    }
    const remaining = records.filter((record) => record.key !== recordKey);
    if (remaining.length === 0) {
      const fresh = createAudiogramRecord();
      setRecords([fresh]);
      setActiveRecordKey(fresh.key);
    } else {
      setRecords(remaining);
      if (activeRecordKey === recordKey) setActiveRecordKey(remaining[0].key);
    }
    const clientName = selectedClient;
    const knownId = target.id ?? savedIds.current.get(recordKey);
    // The delete queues behind in-flight saves, so an insert that is still
    // assigning this record's database id completes (and publishes the id
    // into savedIds) before the row is removed again.
    saveChain.current = saveChain.current
      .then(async () => {
        const persistedId = savedIds.current.get(recordKey) ?? knownId;
        savedIds.current.delete(recordKey);
        if (persistedId === undefined) return;
        await deleteClientAudiogram(clientName, persistedId);
      })
      // Failures already reached the global error banner via the store command.
      .catch(() => undefined);
  }, [activeRecordKey, deleteClientAudiogram, records, selectedClient, status]);

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

  // Destructive operations ask for confirmation first. The ear card and chart
  // keep plain callbacks; the workspace owns the pending request and runs the
  // original action only after the dialog is confirmed.
  const requestClearEar = useCallback((ear: EarSide) => {
    setPendingDestructive({ kind: "ear", ear });
  }, []);

  const requestClearCurve = useCallback((ear: EarSide, curve: CurveType) => {
    setPendingDestructive({ kind: "curve", ear, curve });
  }, []);

  const requestDeleteRecord = useCallback((recordKey: string) => {
    setPendingDestructive({ kind: "record", recordKey });
  }, []);

  const cancelDestructive = useCallback(() => setPendingDestructive(null), []);

  const confirmDestructive = useCallback(() => {
    const pending = pendingDestructive;
    setPendingDestructive(null);
    if (!pending) return;
    if (pending.kind === "ear") clearEar(pending.ear);
    else if (pending.kind === "curve") clearEarCurve(pending.ear, pending.curve);
    else deleteRecord(pending.recordKey);
  }, [clearEar, clearEarCurve, deleteRecord, pendingDestructive]);

  const destructiveCopy = useMemo(() => {
    if (!pendingDestructive) return null;
    if (pendingDestructive.kind === "ear" || pendingDestructive.kind === "curve") {
      const ear = t(
        pendingDestructive.ear === "right" ? "hearingHealth.earRight" : "hearingHealth.earLeft",
      );
      if (pendingDestructive.kind === "ear") {
        return {
          title: t("hearingHealth.confirmClearEarTitle", { ear }),
          body: t("hearingHealth.confirmClearEarBody", { ear }),
          confirm: t("hearingHealth.confirmClearEarAction"),
        };
      }
      const curve = pendingDestructive.curve;
      return {
        title: t("hearingHealth.confirmClearCurveTitle", { curve, ear }),
        body: t("hearingHealth.confirmClearCurveBody", { curve, ear }),
        confirm: t("hearingHealth.confirmClearCurveAction"),
      };
    }
    const record = records.find((candidate) => candidate.key === pendingDestructive.recordKey);
    const date = record ? formatAudiogramDate(record.date, localeFor(language)) : "";
    return {
      title: t("hearingHealth.confirmDeleteRecordTitle", { date }),
      body: t("hearingHealth.confirmDeleteRecordBody", { date }),
      confirm: t("hearingHealth.confirmDeleteRecordAction"),
    };
  }, [language, pendingDestructive, records, t]);

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
      onClear={() => requestClearEar(ear)}
      onClearCurve={(curve) => requestClearCurve(ear, curve)}
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
              {selectedClient && <SaveStatusIndicator status={saveStatus} />}
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
              onDeleteRecord={requestDeleteRecord}
              onHistoryOpenChange={setHistoryOpen}
              onRecordChange={selectRecord}
              onShowPictogramsChange={setShowPictograms}
              onShowSpeechSpectrumChange={setShowSpeechSpectrum}
              onShowUnaidedSiiChange={setShowUnaidedSii}
              onSpLogramClientViewChange={setSpLogramClientView}
            />
            {earCard("left")}
          </div>
        ) : selectedClient && status === "loading" ? (
          <HearingHealthSkeleton />
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
      {destructiveCopy && createPortal(
        <DestructiveConfirmation
          title={destructiveCopy.title}
          body={destructiveCopy.body}
          confirmLabel={destructiveCopy.confirm}
          onCancel={cancelDestructive}
          onConfirm={confirmDestructive}
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
