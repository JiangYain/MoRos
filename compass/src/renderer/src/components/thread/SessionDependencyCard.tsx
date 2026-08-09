import type { DependencyInstallProgress } from "@shared/types";
import { CheckCircle2, ExternalLink, RotateCw } from "lucide-react";
import { motion } from "motion/react";
import phonakTargetAppIcon from "../../assets/phonak-target-app.png";
import { type TranslationKey, useI18n } from "../../i18n";
import { ignoreCommandFailure, useCompass } from "../../store";

const DEPENDENCY_ENTRANCE = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
};

const ACTIVE_DEPENDENCY_PHASES = new Set<DependencyInstallProgress["phase"]>([
  "queued",
  "downloading",
  "extracting",
  "installing",
  "launching",
]);

const DEPENDENCY_PHASE_KEYS: Record<DependencyInstallProgress["phase"], TranslationKey> = {
  queued: "settings.dependency.externalLaunching",
  downloading: "settings.dependency.phase.downloading",
  extracting: "settings.dependency.phase.extracting",
  installing: "settings.dependency.phase.installing",
  launching: "settings.dependency.externalLaunching",
  "awaiting-user": "settings.dependency.externalAwaitingUser",
  completed: "settings.dependency.phase.completed",
  failed: "settings.dependency.phase.failed",
  cancelled: "settings.dependency.phase.cancelled",
};

function dependencyBytes(bytes: number): string {
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export function SessionDependencyCard({
  sessionId,
  progress,
}: {
  sessionId: string;
  progress?: DependencyInstallProgress;
}): React.JSX.Element {
  const { t } = useI18n();
  const installDependency = useCompass((state) => state.installDependency);
  const cancelDependencyInstall = useCompass((state) => state.cancelDependencyInstall);
  const refreshDependencies = useCompass((state) => state.refreshDependencies);
  const dismissDependencyPrompt = useCompass((state) => state.dismissDependencyPrompt);
  const openSettings = useCompass((state) => state.openSettings);
  const active = progress ? ACTIVE_DEPENDENCY_PHASES.has(progress.phase) : false;
  const percent = typeof progress?.progress === "number" ? Math.round(progress.progress * 100) : undefined;
  const terminalFailure = progress?.phase === "failed" || progress?.phase === "cancelled";
  const showProgress = Boolean(progress);

  return (
    <motion.section className={`thread-dependency-card${showProgress ? " has-progress" : ""}`} {...DEPENDENCY_ENTRANCE}>
      <div className="thread-dependency-card-accent" aria-hidden="true" />
      <div className="thread-dependency-card-icon">
        <img src={phonakTargetAppIcon} alt="" />
      </div>
      <div className="thread-dependency-card-content">
        <div className="thread-dependency-card-heading">
          <div>
            <span>PHONAK · TARGET</span>
            <strong>{t(showProgress ? "thread.dependency.progressTitle" : "thread.dependency.phonakTitle")}</strong>
          </div>
          {progress?.phase === "completed" && <CheckCircle2 size={17} strokeWidth={1.7} aria-hidden="true" />}
        </div>
        {!showProgress && <p>{t("thread.dependency.phonakDescription")}</p>}
        {progress && (
          <div className={`thread-dependency-progress phase-${progress.phase}`} aria-live="polite">
            <div>
              <span>{t(DEPENDENCY_PHASE_KEYS[progress.phase])}</span>
              {progress.phase === "downloading" && percent !== undefined && <strong>{percent}%</strong>}
            </div>
            {active && (
              <div
                className={`thread-dependency-progress-track${percent === undefined ? " indeterminate" : ""}`}
                role="progressbar"
                aria-label={t(DEPENDENCY_PHASE_KEYS[progress.phase])}
                aria-valuemin={percent === undefined ? undefined : 0}
                aria-valuemax={percent === undefined ? undefined : 100}
                aria-valuenow={percent}
              >
                <span style={percent === undefined ? undefined : { width: `${percent}%` }} />
              </div>
            )}
            {progress.downloadedBytes !== undefined && progress.phase === "downloading" && (
              <small>
                {t("thread.dependency.downloaded", {
                  downloaded: dependencyBytes(progress.downloadedBytes),
                  total: progress.totalBytes ? ` / ${dependencyBytes(progress.totalBytes)}` : "",
                })}
              </small>
            )}
            {progress.error && <small className="error">{progress.error}</small>}
          </div>
        )}
        <div className="thread-dependency-card-actions">
          {!progress || terminalFailure ? (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() => dismissDependencyPrompt(sessionId, "phonak-target")}
              >
                {t("thread.dependency.later")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => ignoreCommandFailure(installDependency("phonak-target", sessionId))}
              >
                <ExternalLink size={13} strokeWidth={1.7} aria-hidden="true" />
                {t("thread.dependency.install")}
              </button>
            </>
          ) : active ? (
            progress.phase !== "launching" ? (
              <button
                type="button"
                className="secondary"
                onClick={() => ignoreCommandFailure(cancelDependencyInstall("phonak-target"))}
              >
                {t("common.cancel")}
              </button>
            ) : null
          ) : (
            <>
              {progress.phase === "awaiting-user" && (
                <button type="button" className="secondary" onClick={() => ignoreCommandFailure(refreshDependencies())}>
                  <RotateCw size={12} strokeWidth={1.7} aria-hidden="true" />
                  {t("settings.dependenciesRefresh")}
                </button>
              )}
              <button type="button" className="secondary" onClick={() => openSettings("dependencies")}>
                <ExternalLink size={12} strokeWidth={1.7} aria-hidden="true" />
                {t("thread.dependency.openDependencies")}
              </button>
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}
