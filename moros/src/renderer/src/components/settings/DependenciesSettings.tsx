import type {
  DependencyId,
  DependencyInstallProgress,
  DependencyResource,
} from "@shared/types";
import {
  CircleAlert,
  CircleCheck,
  Download,
  ExternalLink,
  PackageCheck,
  RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import bashLogo from "../../assets/dependency-bash.png";
import gitLogo from "../../assets/dependency-git.svg";
import { type TranslationKey, useI18n } from "../../i18n";
import { ignoreCommandFailure, useMoros } from "../../store";

const PRESENTATION: Record<DependencyId, {
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = {
  git: {
    nameKey: "settings.dependency.git.name",
    descriptionKey: "settings.dependency.git.description",
  },
  bash: {
    nameKey: "settings.dependency.bash.name",
    descriptionKey: "settings.dependency.bash.description",
  },
};

const ACTIVE_PHASES = new Set<DependencyInstallProgress["phase"]>([
  "queued",
  "downloading",
  "extracting",
  "installing",
  "launching",
]);

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

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function DependencyArtwork({ dependencyId }: { dependencyId: DependencyId }): React.JSX.Element {
  const source = dependencyId === "git"
    ? { src: gitLogo, className: "" }
    : { src: bashLogo, className: "bash" };
  return <img className={source.className} src={source.src} alt="" />;
}

function DependencyProgress({ progress }: { progress: DependencyInstallProgress }): React.JSX.Element {
  const { t } = useI18n();
  const percent = typeof progress.progress === "number"
    ? Math.round(progress.progress * 100)
    : undefined;
  const label = t(PHASE_KEYS[progress.phase]);
  return (
    <div className={`settings-dependency-progress phase-${progress.phase}`} aria-live="polite">
      <div className="settings-dependency-progress-copy">
        <span>{label}</span>
        {percent !== undefined && progress.phase === "downloading" && <strong>{percent}%</strong>}
      </div>
      {ACTIVE_PHASES.has(progress.phase) && (
        <div
          className={`settings-dependency-progress-track${percent === undefined ? " indeterminate" : ""}`}
          role="progressbar"
          aria-label={label}
          aria-valuemin={percent === undefined ? undefined : 0}
          aria-valuemax={percent === undefined ? undefined : 100}
          aria-valuenow={percent}
        >
          <span style={percent === undefined ? undefined : { width: `${percent}%` }} />
        </div>
      )}
      {progress.downloadedBytes !== undefined && progress.phase === "downloading" && (
        <small>
          {formatBytes(progress.downloadedBytes)}
          {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}
        </small>
      )}
      {progress.error && <small className="error">{progress.error}</small>}
    </div>
  );
}

function DependencyCard({
  item,
  progress,
  confirming,
  onConfirm,
  onCancelConfirm,
}: {
  item: DependencyResource;
  progress?: DependencyInstallProgress;
  confirming: boolean;
  onConfirm(): void;
  onCancelConfirm(): void;
}): React.JSX.Element {
  const { t } = useI18n();
  const installDependency = useMoros((state) => state.installDependency);
  const cancelInstall = useMoros((state) => state.cancelDependencyInstall);
  const openPath = useMoros((state) => state.openPath);
  const installed = item.availability === "installed" || progress?.phase === "completed";
  const active = progress ? ACTIVE_PHASES.has(progress.phase) : false;
  const unavailable = item.availability === "unsupported";
  const presentation = PRESENTATION[item.id];
  const statusKey: TranslationKey = unavailable
    ? "settings.dependency.unsupported"
    : installed
      ? "settings.dependency.installed"
      : "settings.dependency.missing";

  return (
    <article className={`settings-dependency-card${installed ? " installed" : ""}${active ? " active" : ""}`}>
      <div className={`settings-dependency-artwork dependency-${item.id}`}>
        <DependencyArtwork dependencyId={item.id} />
      </div>
      <div className="settings-dependency-card-main">
        <div className="settings-dependency-card-title">
          <div><strong>{t(presentation.nameKey)}</strong><span>{item.vendor}</span></div>
          <span className={`settings-dependency-status status-${item.availability}`}>
            {installed
              ? <CircleCheck size={12} strokeWidth={1.8} aria-hidden="true" />
              : <CircleAlert size={12} strokeWidth={1.7} aria-hidden="true" />}
            {t(statusKey)}
          </span>
        </div>
        <p>{t(presentation.descriptionKey)}</p>
        <div className="settings-dependency-meta">
          <span>{t(item.required ? "settings.dependency.required" : "settings.dependency.optional")}</span>
          {item.installedVersion && <span>{t("settings.dependency.version", { version: item.installedVersion })}</span>}
        </div>
        {progress && <DependencyProgress progress={progress} />}
        {confirming ? (
          <div className="settings-dependency-confirm">
            <span>{t("settings.dependency.confirmInstall")}</span>
            <div>
              <button type="button" onClick={onCancelConfirm}>{t("common.cancel")}</button>
              <button type="button" className="primary" onClick={() => ignoreCommandFailure(installDependency(item.id).then(onCancelConfirm))}>{t("settings.dependency.confirm")}</button>
            </div>
          </div>
        ) : (
          <div className="settings-dependency-actions">
            <button type="button" className="settings-dependency-source" onClick={() => ignoreCommandFailure(useMoros.getState().openDependencySource(item.id))}>
              <ExternalLink size={13} strokeWidth={1.6} aria-hidden="true" />
              <span>{t("settings.dependency.officialSource")}</span>
            </button>
            {active ? (
              <button type="button" className="settings-dependency-install muted" onClick={() => ignoreCommandFailure(cancelInstall(item.id))}>{t("settings.dependency.cancelDownload")}</button>
            ) : installed && item.installedPath ? (
              <button type="button" className="settings-dependency-install" onClick={() => ignoreCommandFailure(openPath(item.installedPath!))}>{t("settings.dependency.openLocation")}</button>
            ) : !unavailable ? (
              <button type="button" className="settings-dependency-install" onClick={onConfirm}>
                <Download size={12} strokeWidth={1.7} aria-hidden="true" />
                {t(progress?.phase === "failed" || progress?.phase === "cancelled" ? "settings.dependency.retry" : "settings.dependency.install")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

export function DependenciesSettings(): React.JSX.Element {
  const { t } = useI18n();
  const dependencies = useMoros((state) => state.dependencies);
  const refreshDependencies = useMoros((state) => state.refreshDependencies);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingId, setConfirmingId] = useState<DependencyId | null>(null);
  const installs = new Map(dependencies.installs.map((progress) => [progress.dependencyId, progress]));
  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try { await refreshDependencies(); } finally { setRefreshing(false); }
  }, [refreshDependencies]);
  useEffect(() => {
    if (dependencies.checkedAt === 0) ignoreCommandFailure(refresh());
  }, [dependencies.checkedAt, refresh]);

  return (
    <div className="settings-page settings-dependencies-page" id="settings-page-dependencies">
      <header className="settings-page-head">
        <div>
          <span className="settings-eyebrow">{t("settings.dependenciesEyebrow")}</span>
          <div className="settings-title-with-refresh">
            <h1>{t("settings.nav.dependencies")}</h1>
            <button type="button" className="settings-dependencies-refresh-inline-title" disabled={refreshing} onClick={() => ignoreCommandFailure(refresh())} title={t("settings.dependenciesRefresh")} aria-label={t("settings.dependenciesRefresh")}>
              <RotateCw size={15} className={refreshing ? "spin" : ""} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <p>{t("settings.dependenciesDescription")}</p>
        </div>
      </header>
      {dependencies.items.length === 0 ? (
        <div className="settings-dependencies-empty">
          <PackageCheck size={20} strokeWidth={1.5} />
          <span>{t("settings.dependency.noItems")}</span>
        </div>
      ) : (
        <section className="settings-dependency-section" id="settings-dependencies-runtime">
          <div className="settings-dependency-section-head">
            <div>
              <h2>{t("settings.dependenciesCategory.runtime")}</h2>
              <p>{t("settings.dependenciesCategory.runtimeDescription")}</p>
            </div>
            <span>{dependencies.items.filter((item) => item.availability === "installed").length}/{dependencies.items.length}</span>
          </div>
          <div className="settings-dependency-grid">
            {dependencies.items.map((item) => (
              <DependencyCard
                item={item}
                progress={installs.get(item.id)}
                confirming={confirmingId === item.id}
                key={item.id}
                onConfirm={() => setConfirmingId(item.id)}
                onCancelConfirm={() => setConfirmingId(null)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
