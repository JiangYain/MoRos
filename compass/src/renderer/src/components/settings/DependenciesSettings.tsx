import type { DependencyCategory, DependencyId, DependencyInstallProgress, DependencyResource } from "@shared/types";
import { Check, CircleAlert, CircleCheck, Download, ExternalLink, FolderOpen, PackageCheck, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import bashLogo from "../../assets/dependency-bash.png";
import gitLogo from "../../assets/dependency-git.svg";
import himsaLogo from "../../assets/dependency-himsa.png";
import signiaLogo from "../../assets/hearing-aid-signia.svg";
import widexLogo from "../../assets/hearing-aid-widex.svg";
import phonakTargetAppIcon from "../../assets/phonak-target-app.png";
import { type TranslationKey, useI18n } from "../../i18n";
import { ignoreCommandFailure, useCompass } from "../../store";
import { isSettingsDropdownNavigationKey, nextSettingsDropdownIndex } from "../settings-dropdown";

const PRESENTATION: Record<DependencyId, { nameKey: TranslationKey; descriptionKey: TranslationKey }> = {
  git: { nameKey: "settings.dependency.git.name", descriptionKey: "settings.dependency.git.description" },
  bash: { nameKey: "settings.dependency.bash.name", descriptionKey: "settings.dependency.bash.description" },
  "phonak-target": { nameKey: "settings.dependency.phonakTarget.name", descriptionKey: "settings.dependency.phonakTarget.description" },
  "signia-connexx": { nameKey: "settings.dependency.signiaConnexx.name", descriptionKey: "settings.dependency.signiaConnexx.description" },
  "widex-compass-gps": { nameKey: "settings.dependency.widexCompass.name", descriptionKey: "settings.dependency.widexCompass.description" },
  "noahlink-wireless-driver": { nameKey: "settings.dependency.noahlink.name", descriptionKey: "settings.dependency.noahlink.description" },
};
const SECTIONS: Array<{ category: DependencyCategory; id: string; titleKey: TranslationKey; descriptionKey: TranslationKey }> = [
  { category: "runtime", id: "settings-dependencies-runtime", titleKey: "settings.dependenciesCategory.runtime", descriptionKey: "settings.dependenciesCategory.runtimeDescription" },
  { category: "fitting-software", id: "settings-dependencies-fitting", titleKey: "settings.dependenciesCategory.fitting", descriptionKey: "settings.dependenciesCategory.fittingDescription" },
  { category: "driver", id: "settings-dependencies-driver", titleKey: "settings.dependenciesCategory.driver", descriptionKey: "settings.dependenciesCategory.driverDescription" },
];
const ACTIVE_PHASES = new Set<DependencyInstallProgress["phase"]>(["queued", "downloading", "extracting", "installing", "launching"]);
const PHASE_KEYS: Record<DependencyInstallProgress["phase"], TranslationKey> = {
  queued: "settings.dependency.phase.queued",
  downloading: "settings.dependency.phase.downloading",
  extracting: "settings.dependency.phase.extracting",
  installing: "settings.dependency.phase.installing",
  launching: "settings.dependency.phase.launching",
  "awaiting-user": "settings.dependency.phase.awaitingUser",
  completed: "settings.dependency.phase.completed",
  failed: "settings.dependency.phase.failed",
  cancelled: "settings.dependency.phase.cancelled",
};

function phaseKey(phase: DependencyInstallProgress["phase"]): TranslationKey {
  return PHASE_KEYS[phase];
}
function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}
function DependencyArtwork({ dependencyId }: { dependencyId: DependencyId }): React.JSX.Element {
  const sources: Record<DependencyId, { src: string; className?: string }> = {
    git: { src: gitLogo }, bash: { src: bashLogo, className: "bash" }, "phonak-target": { src: phonakTargetAppIcon }, "signia-connexx": { src: signiaLogo, className: "signia" }, "widex-compass-gps": { src: widexLogo, className: "wide" }, "noahlink-wireless-driver": { src: himsaLogo, className: "himsa wide" },
  };
  const source = sources[dependencyId];
  return <img className={source.className ?? ""} src={source.src} alt="" />;
}

function DependencyProgress({ progress, external }: { progress: DependencyInstallProgress; external: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const percent = typeof progress.progress === "number" ? Math.round(progress.progress * 100) : undefined;
  const label = external && progress.phase === "launching"
    ? t("settings.dependency.externalLaunching")
    : external && progress.phase === "awaiting-user"
      ? t("settings.dependency.externalAwaitingUser")
      : t(phaseKey(progress.phase));
  return (
    <div className={`settings-dependency-progress phase-${progress.phase}`} aria-live="polite">
      <div className="settings-dependency-progress-copy"><span>{label}</span>{percent !== undefined && progress.phase === "downloading" && <strong>{percent}%</strong>}</div>
      {ACTIVE_PHASES.has(progress.phase) && <div className={`settings-dependency-progress-track${percent === undefined ? " indeterminate" : ""}`} role="progressbar" aria-label={label} aria-valuemin={percent === undefined ? undefined : 0} aria-valuemax={percent === undefined ? undefined : 100} aria-valuenow={percent}><span style={percent === undefined ? undefined : { width: `${percent}%` }} /></div>}
      {progress.downloadedBytes !== undefined && progress.phase === "downloading" && <small>{formatBytes(progress.downloadedBytes)}{progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}</small>}
      {progress.error && <small className="error">{progress.error}</small>}
    </div>
  );
}

function TargetExecutableSelector({ item, onClose }: { item: DependencyResource; onClose: () => void }): React.JSX.Element | null {
  const { t } = useI18n();
  const selectExecutable = useCompass((state) => state.selectDependencyExecutable);
  const resetExecutable = useCompass((state) => state.resetDependencyExecutable);
  const selection = item.executableSelection;
  const titleId = useId();
  const descriptionId = useId();
  const candidateListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent): void => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", escape, { capture: true });
    return () => window.removeEventListener("keydown", escape, { capture: true });
  }, [onClose]);
  if (!selection) return null;
  const unavailable = Boolean(selection.configuredPath && !selection.selectedPath);
  const description = unavailable ? t("settings.dependency.targetSelectionUnavailable") : selection.multipleDetected ? t("settings.dependency.targetMultipleDetected", { count: selection.candidates.length }) : selection.selectedPath ? t("settings.dependency.targetSingleDetected") : t("settings.dependency.targetNotDetected");
  const navigate = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (!isSettingsDropdownNavigationKey(event.key) || !candidateListRef.current) return;
    const options = Array.from(candidateListRef.current.querySelectorAll<HTMLElement>('[role="option"]'));
    if (!options.length) return;
    event.preventDefault();
    options[nextSettingsDropdownIndex(options.indexOf(document.activeElement as HTMLElement), options.length, event.key)]?.focus();
  };
  return (
    <section className={`settings-target-selector${unavailable ? " unavailable" : ""}`} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <div className="settings-target-selector-head"><div><h2 id={titleId}>{t("settings.dependency.targetExecutableLabel")}</h2><span id={descriptionId}>{description}</span></div><button type="button" className="settings-target-selector-close" aria-label={t("common.close")} onClick={onClose}><X size={13} strokeWidth={1.65} aria-hidden="true" /></button></div>
      {selection.candidates.length > 0 && (
        <div ref={candidateListRef} className="settings-target-selector-candidates" role="listbox" aria-label={t("settings.dependency.targetDetectedVersions")} onKeyDown={navigate}>
          {selection.candidates.map((candidate) => {
            const directoryName = candidate.path.split(/[\\/]/).at(-2) ?? "Target.exe";
            const selected = candidate.path === selection.selectedPath;
            return <button type="button" role="option" aria-selected={selected} className={`settings-target-selector-option${selected ? " selected" : ""}`} title={candidate.path} key={candidate.path} onClick={() => { ignoreCommandFailure(selectExecutable(item.id, candidate.path).then(onClose)); }}><span><strong>{candidate.version ? `Target ${candidate.version}` : directoryName}</strong><small>{directoryName}</small></span>{selected && <Check size={13} strokeWidth={1.8} aria-hidden="true" />}</button>;
          })}
        </div>
      )}
      <div className="settings-target-selector-actions">
        <button type="button" onClick={() => { ignoreCommandFailure(selectExecutable(item.id).then(onClose)); }}><FolderOpen size={12} strokeWidth={1.65} aria-hidden="true" />{t(selection.configuredPath ? "settings.dependency.targetChangeExecutable" : "settings.dependency.targetChooseExecutable")}</button>
        {selection.configuredPath && <button type="button" className="muted" onClick={() => { ignoreCommandFailure(resetExecutable(item.id).then(onClose)); }}>{t("settings.dependency.targetResetExecutable")}</button>}
      </div>
    </section>
  );
}

interface DependencyCardProps {
  item: DependencyResource;
  progress?: DependencyInstallProgress;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onInstall: () => void;
  onCancelInstall: () => void;
  onRefresh: () => void;
}

function DependencyCard(props: DependencyCardProps): React.JSX.Element {
  const { t } = useI18n();
  const openPath = useCompass((state) => state.openPath);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectorTriggerRef = useRef<HTMLButtonElement>(null);
  const selectorAreaRef = useRef<HTMLDivElement>(null);
  const { item, progress } = props;
  const presentation = PRESENTATION[item.id];
  const installed = item.availability === "installed" || progress?.phase === "completed";
  const installedPath = item.installedPath;
  const active = progress ? ACTIVE_PHASES.has(progress.phase) : false;
  const external = item.installKind === "external";
  const unavailable = item.availability === "unsupported";
  const selection = item.id === "phonak-target" ? item.executableSelection : undefined;
  const selectedCandidate = selection?.selectedPath ? selection.candidates.find((candidate) => candidate.path === selection.selectedPath) : undefined;
  const version = item.installedVersion ?? selectedCandidate?.version ?? selectedCandidate?.fileVersion;
  const versionCount = selection ? Math.max(selection.candidates.length, installed ? 1 : 0) : 0;
  const selectorLabel = selection ? installed ? version ? t("settings.dependency.version", { version }) : t("settings.dependency.targetManageVersions") : item.recommendedVersion ? t("settings.dependency.recommended", { version: item.recommendedVersion }) : t("settings.dependency.targetChooseExecutable") : undefined;
  const statusKey: TranslationKey = unavailable ? "settings.dependency.unsupported" : installed ? "settings.dependency.installed" : "settings.dependency.missing";
  const closeSelector = useCallback(() => { setSelectorOpen(false); window.requestAnimationFrame(() => selectorTriggerRef.current?.focus({ preventScroll: true })); }, []);
  useEffect(() => {
    if (!selectorOpen) return;
    const outside = (event: PointerEvent): void => { if (event.target instanceof Node && !selectorAreaRef.current?.contains(event.target)) setSelectorOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [selectorOpen]);
  return (
    <article className={`settings-dependency-card${installed ? " installed" : ""}${active ? " active" : ""}`}>
      <div className={`settings-dependency-artwork dependency-${item.id}`}><DependencyArtwork dependencyId={item.id} /></div>
      <div className="settings-dependency-card-main">
        <div className="settings-dependency-card-title"><div><strong>{t(presentation.nameKey)}</strong><span>{item.vendor}</span></div><span className={`settings-dependency-status status-${item.availability}`}>{installed ? <CircleCheck size={12} strokeWidth={1.8} aria-hidden="true" /> : <CircleAlert size={12} strokeWidth={1.7} aria-hidden="true" />}{t(statusKey)}</span></div>
        <p>{t(presentation.descriptionKey)}</p>
        <div ref={selection ? selectorAreaRef : undefined} className="settings-dependency-meta">
          <span>{selection && installed ? t("settings.dependency.targetVersionCount", { count: versionCount }) : t(item.required ? "settings.dependency.required" : "settings.dependency.optional")}</span>
          {selection && selectorLabel ? <div className="settings-target-selector-anchor"><button ref={selectorTriggerRef} type="button" className="settings-dependency-meta-action" aria-haspopup="listbox" aria-expanded={selectorOpen} aria-label={`${selectorLabel} — ${t("settings.dependency.targetOpenSelector")}`} onClick={() => setSelectorOpen((open) => !open)}>{selectorLabel}</button>{selectorOpen && <TargetExecutableSelector item={item} onClose={closeSelector} />}</div> : item.installedVersion ? <span>{t("settings.dependency.version", { version: item.installedVersion })}</span> : item.recommendedVersion ? <span>{t("settings.dependency.recommended", { version: item.recommendedVersion })}</span> : null}
        </div>
        {progress && <DependencyProgress progress={progress} external={external} />}
        {props.confirming ? <div className="settings-dependency-confirm"><span>{t(external ? "settings.dependency.externalConfirm" : "settings.dependency.confirmInstall")}</span><div><button type="button" onClick={props.onCancelConfirm}>{t("common.cancel")}</button><button type="button" className="primary" onClick={props.onInstall}>{t(external ? "settings.dependency.externalConfirmAction" : "settings.dependency.confirm")}</button></div></div> : (
          <div className="settings-dependency-actions">
            <button type="button" className="settings-dependency-source" title={t("settings.dependency.officialSource")} aria-label={`${t("settings.dependency.officialSource")} — ${t(presentation.nameKey)}`} onClick={() => ignoreCommandFailure(useCompass.getState().openDependencySource(item.id))}><ExternalLink size={13} strokeWidth={1.6} aria-hidden="true" /><span>{t("settings.dependency.officialSource")}</span></button>
            {active ? progress?.phase !== "launching" ? <button type="button" className="settings-dependency-install muted" onClick={props.onCancelInstall}>{t("settings.dependency.cancelDownload")}</button> : null : progress?.phase === "awaiting-user" ? <button type="button" className="settings-dependency-install" onClick={props.onRefresh}>{t("settings.dependenciesRefresh")}</button> : installed && installedPath ? <button type="button" className="settings-dependency-install" onClick={() => ignoreCommandFailure(openPath(installedPath))}>{t("settings.dependency.openLocation")}</button> : !unavailable ? <button type="button" className="settings-dependency-install" onClick={props.onConfirm}>{external ? <ExternalLink size={12} strokeWidth={1.7} aria-hidden="true" /> : <Download size={12} strokeWidth={1.7} aria-hidden="true" />}{t(external ? "settings.dependency.externalAction" : progress?.phase === "failed" || progress?.phase === "cancelled" ? "settings.dependency.retry" : installed ? "settings.dependency.reinstall" : "settings.dependency.install")}</button> : null}
          </div>
        )}
      </div>
    </article>
  );
}

export function DependenciesSettings(): React.JSX.Element {
  const { t } = useI18n();
  const dependencies = useCompass((state) => state.dependencies);
  const refreshDependencies = useCompass((state) => state.refreshDependencies);
  const installDependency = useCompass((state) => state.installDependency);
  const cancelInstall = useCompass((state) => state.cancelDependencyInstall);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingId, setConfirmingId] = useState<DependencyId | null>(null);
  const installs = new Map(dependencies.installs.map((progress) => [progress.dependencyId, progress]));
  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try { await refreshDependencies(); } finally { setRefreshing(false); }
  }, [refreshDependencies]);
  useEffect(() => { if (dependencies.checkedAt === 0) ignoreCommandFailure(refresh()); }, [dependencies.checkedAt, refresh]);
  return (
    <div className="settings-page settings-dependencies-page" id="settings-page-dependencies">
      <header className="settings-page-head"><div><span className="settings-eyebrow">{t("settings.dependenciesEyebrow")}</span><div className="settings-title-with-refresh"><h1>{t("settings.nav.dependencies")}</h1><button type="button" className="settings-dependencies-refresh-inline-title" disabled={refreshing} onClick={() => ignoreCommandFailure(refresh())} title={t("settings.dependenciesRefresh")} aria-label={t("settings.dependenciesRefresh")}><RotateCw size={15} className={refreshing ? "spin" : ""} strokeWidth={2} aria-hidden="true" /></button></div><p>{t("settings.dependenciesDescription")}</p></div></header>
      {dependencies.items.length === 0 ? <div className="settings-dependencies-empty"><PackageCheck size={20} strokeWidth={1.5} /><span>{t("settings.dependency.noItems")}</span></div> : SECTIONS.map((section) => {
        const items = dependencies.items.filter((item) => item.category === section.category);
        if (!items.length) return null;
        return <section className="settings-dependency-section" id={section.id} key={section.category}><div className="settings-dependency-section-head"><div><h2>{t(section.titleKey)}</h2><p>{t(section.descriptionKey)}</p></div><span>{items.filter((item) => item.availability === "installed").length}/{items.length}</span></div><div className="settings-dependency-grid">{items.map((item) => <DependencyCard item={item} progress={installs.get(item.id)} confirming={confirmingId === item.id} key={item.id} onConfirm={() => setConfirmingId(item.id)} onCancelConfirm={() => setConfirmingId(null)} onInstall={() => ignoreCommandFailure(installDependency(item.id).then(() => setConfirmingId(null)))} onCancelInstall={() => ignoreCommandFailure(cancelInstall(item.id))} onRefresh={() => ignoreCommandFailure(refresh())} />)}</div></section>;
      })}
    </div>
  );
}
