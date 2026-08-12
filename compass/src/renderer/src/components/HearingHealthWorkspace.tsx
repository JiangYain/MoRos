import { Check, ChevronDown, CircleAlert, Clock, LoaderCircle, Pencil, Plus, User } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { localeFor, useI18n, type TranslationKey } from "../i18n";
import { ignoreCommandFailure, useCompass } from "../store";
import { ClientProfileDialog } from "./ClientProfileDialog";
import {
  clientRegistryKey,
  HEARING_AID_BRANDS,
  normalizeClientName,
  type ClientHearingAidBrand,
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
import { useDropdownDismiss } from "./hearing-health/use-dropdown-dismiss";

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
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [showSpeechSpectrum, setShowSpeechSpectrum] = useState(false);
  const [showPictograms, setShowPictograms] = useState(false);
  const [spLogramClientView, setSpLogramClientView] = useState(false);
  const [showUnaidedSii, setShowUnaidedSii] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ClientProfileDraft | null>(null);

  const clientMenuRef = useRef<HTMLDivElement>(null);
  const closeClientMenu = useCallback(() => setClientMenuOpen(false), []);
  useDropdownDismiss(clientMenuOpen, clientMenuRef, closeClientMenu);

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

  const selectClient = useCallback((name: string) => {
    setHearingHealthClient(name);
    setClientMenuOpen(false);
  }, [setHearingHealthClient]);

  const closeCreateDialog = useCallback(() => setCreateDialogOpen(false), []);
  const saveCreateDialog = useCallback((profile: ClientProfileDraft) => {
    ignoreCommandFailure(saveClientProfile(profile).then(() => {
      setHearingHealthClient(profile.name);
      setCreateDialogOpen(false);
    }));
  }, [saveClientProfile, setHearingHealthClient]);

  // Inline profile editor. The draft re-seeds whenever the panel opens or the
  // selected client (or their stored profile) changes.
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

  useEffect(() => {
    setProfileDraft(profileOpen && profileBaseline ? { ...profileBaseline } : null);
  }, [profileBaseline, profileOpen]);

  const updateProfileDraft = useCallback(<Key extends keyof ClientProfileDraft>(
    field: Key,
    value: ClientProfileDraft[Key],
  ): void => {
    setProfileDraft((current) => (current ? { ...current, [field]: value } : current));
  }, []);

  const profileName = normalizeClientName(profileDraft?.name ?? "");
  const profileDuplicate = useMemo(() => {
    if (!profileName || !selectedClient) return false;
    const selfKey = clientRegistryKey(selectedClient);
    const nameKey = clientRegistryKey(profileName);
    return clients.some(
      (client) => clientRegistryKey(client) === nameKey && clientRegistryKey(client) !== selfKey,
    );
  }, [clients, profileName, selectedClient]);
  const profileDirty = Boolean(
    profileDraft
    && profileBaseline
    && JSON.stringify({ ...profileDraft, name: profileName })
      !== JSON.stringify(profileBaseline),
  );
  const canSaveProfile = Boolean(profileName) && !profileDuplicate && profileDirty;

  const saveProfilePanel = useCallback(() => {
    if (!selectedClient || !profileDraft || !profileName || profileDuplicate) return;
    ignoreCommandFailure(
      updateClientProfile(selectedClient, { ...profileDraft, name: profileName })
        .then(() => setProfileOpen(false)),
    );
  }, [profileDraft, profileDuplicate, profileName, selectedClient, setProfileOpen, updateClientProfile]);

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
                    className={`hearing-health-client-edit-btn${profileOpen ? " active" : ""}`}
                    aria-expanded={profileOpen}
                    aria-controls="hearing-health-profile-panel"
                    onClick={() => setProfileOpen(!profileOpen)}
                  >
                    <Pencil size={11} strokeWidth={1.6} aria-hidden="true" />
                    {t("client.editAction")}
                  </button>
                </span>
              )}
              <div className="hearing-health-client-select" ref={clientMenuRef}>
                <button
                  type="button"
                  className="hearing-health-client-btn"
                  aria-haspopup="listbox"
                  aria-expanded={clientMenuOpen}
                  onClick={() => setClientMenuOpen((open) => !open)}
                >
                  <User size={13} strokeWidth={1.6} aria-hidden="true" />
                  <span className="hearing-health-client-btn-name">
                    {selectedClient ?? t("hearingHealth.selectClient")}
                  </span>
                  <ChevronDown size={12} strokeWidth={1.6} aria-hidden="true" />
                </button>
                {clientMenuOpen && (
                  <div
                    className="hearing-health-client-menu"
                    role="listbox"
                    aria-label={t("hearingHealth.selectClient")}
                  >
                    {clients.map((name) => (
                      <button
                        key={name}
                        type="button"
                        role="option"
                        aria-selected={name === selectedClient}
                        className={`hearing-health-client-option${name === selectedClient ? " active" : ""}`}
                        onClick={() => selectClient(name)}
                      >
                        {name}
                      </button>
                    ))}
                    {clients.length > 0 && <div className="hearing-health-client-menu-rule" />}
                    <button
                      type="button"
                      className="hearing-health-client-option new-client"
                      onClick={() => {
                        setClientMenuOpen(false);
                        setCreateDialogOpen(true);
                      }}
                    >
                      <Plus size={12} strokeWidth={1.6} aria-hidden="true" />
                      {t("sidebar.newClient")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {selectedClient && profileOpen && profileDraft && (
          <section
            id="hearing-health-profile-panel"
            className="hearing-health-profile-panel"
            aria-label={t("client.editAction")}
          >
            <div className="hearing-health-profile-grid">
              <label className="hearing-health-profile-field">
                <span>{t("client.name")}</span>
                <input
                  value={profileDraft.name}
                  placeholder={t("client.namePlaceholder")}
                  onChange={(event) => updateProfileDraft("name", event.target.value)}
                />
              </label>
              <div className="hearing-health-profile-field">
                <span>{t("client.gender")}</span>
                <div className="hearing-health-profile-gender" role="group" aria-label={t("client.gender")}>
                  {(["female", "male"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={profileDraft.gender === option ? "active" : ""}
                      aria-pressed={profileDraft.gender === option}
                      onClick={() => updateProfileDraft(
                        "gender",
                        profileDraft.gender === option ? null : option,
                      )}
                    >
                      {t(option === "female" ? "client.female" : "client.male")}
                    </button>
                  ))}
                </div>
              </div>
              <label className="hearing-health-profile-field">
                <span>{t("client.age")}</span>
                <input
                  type="number"
                  min={0}
                  max={130}
                  inputMode="numeric"
                  value={profileDraft.age ?? ""}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    updateProfileDraft(
                      "age",
                      Number.isFinite(value) ? Math.min(130, Math.max(0, Math.round(value))) : null,
                    );
                  }}
                />
              </label>
              <label className="hearing-health-profile-field">
                <span>{t("client.brand")}</span>
                <select
                  value={profileDraft.hearingAidBrands[0] ?? ""}
                  onChange={(event) => updateProfileDraft(
                    "hearingAidBrands",
                    event.target.value ? [event.target.value as ClientHearingAidBrand] : [],
                  )}
                >
                  <option value="">{t("client.brandNone")}</option>
                  {HEARING_AID_BRANDS.map((brand) => (
                    <option value={brand.value} key={brand.value}>{brand.label}</option>
                  ))}
                </select>
              </label>
              <label className="hearing-health-profile-field hearing-health-profile-span2">
                <span>{t("client.contact")}</span>
                <input
                  value={profileDraft.contact}
                  placeholder={t("client.contactPlaceholder")}
                  onChange={(event) => updateProfileDraft("contact", event.target.value)}
                />
              </label>
              <label className="hearing-health-profile-field hearing-health-profile-span2">
                <span>{t("client.notes")}</span>
                <input
                  value={profileDraft.notes}
                  placeholder={t("client.notesPlaceholder")}
                  onChange={(event) => updateProfileDraft("notes", event.target.value)}
                />
              </label>
            </div>
            <div className="hearing-health-profile-actions">
              <span
                className={`hearing-health-profile-status${profileDuplicate ? " error" : ""}`}
                aria-live="polite"
              >
                {profileDuplicate
                  ? t("client.exists", { name: profileName })
                  : !profileName
                    ? t("client.nameRequired")
                    : ""}
              </span>
              <button
                type="button"
                className="hearing-health-profile-save"
                disabled={!canSaveProfile}
                onClick={saveProfilePanel}
              >
                {t("common.save")}
              </button>
            </div>
          </section>
        )}
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
    </section>
  );
}
