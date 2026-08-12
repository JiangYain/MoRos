import { ChevronDown, Pencil, Plus, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { ignoreCommandFailure, useCompass } from "../store";
import { ClientProfileDialog } from "./ClientProfileDialog";
import {
  clientRegistryKey,
  HEARING_AID_BRANDS,
  normalizeClientName,
  type ClientHearingAidBrand,
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
import { useDropdownDismiss } from "./hearing-health/use-dropdown-dismiss";

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
    </section>
  );
}
