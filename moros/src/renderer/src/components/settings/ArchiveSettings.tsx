import type { AppLanguage, UiArchivedSessionInfo } from "@shared/types";
import { Archive, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { localeFor, useI18n } from "../../i18n";
import { ignoreCommandFailure, useMoros } from "../../store";

function archivedSessionTime(
  timestamp: number,
  language: AppLanguage,
  unknownLabel: string,
): string {
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return unknownLabel;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(localeFor(language), {
    ...(sameYear ? {} : { year: "numeric" as const }),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ArchiveSettings(): React.JSX.Element {
  const { t, language } = useI18n();
  const listArchivedSessions = useMoros((state) => state.listArchivedSessions);
  const restoreArchivedSession = useMoros((state) => state.restoreArchivedSession);
  const [items, setItems] = useState<UiArchivedSessionInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      setItems(await listArchivedSessions());
      setLoaded(true);
    } finally {
      setRefreshing(false);
    }
  }, [listArchivedSessions]);

  useEffect(() => {
    ignoreCommandFailure(refresh());
  }, [refresh]);

  const restore = (path: string): void => {
    setRestoringPath(path);
    ignoreCommandFailure(
      restoreArchivedSession(path)
        .then(() => {
          // The main process refreshes the sidebar session list via
          // sessions-changed; only the local archive listing needs updating.
          setItems((current) => current.filter((item) => item.path !== path));
        })
        .finally(() => setRestoringPath(null)),
    );
  };

  return (
    <div className="settings-page settings-archive-page" id="settings-page-archive">
      <header className="settings-page-head">
        <div>
          <span className="settings-eyebrow">{t("settings.archiveEyebrow")}</span>
          <div className="settings-title-with-refresh">
            <h1>{t("settings.nav.archive")}</h1>
            <button
              type="button"
              className="settings-dependencies-refresh-inline-title"
              disabled={refreshing}
              onClick={() => ignoreCommandFailure(refresh())}
              title={t("settings.archiveRefresh")}
              aria-label={t("settings.archiveRefresh")}
            >
              <RotateCw size={15} className={refreshing ? "spin" : ""} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <p>{t("settings.archiveDescription")}</p>
        </div>
      </header>
      {loaded && (items.length === 0 ? (
        <div className="settings-archive-empty">
          <Archive size={20} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("settings.archiveEmpty")}</span>
        </div>
      ) : (
        <section className="settings-section-block">
          <div className="settings-card settings-archive-list" role="list" aria-label={t("settings.nav.archive")}>
            {items.map((item) => {
              const title = item.name?.trim() || item.firstMessage.trim() || t("common.untitledSession");
              const restoring = restoringPath === item.path;
              return (
                <div className="settings-archive-row" role="listitem" key={item.path}>
                  <div className="settings-archive-row-copy">
                    <strong>{title}</strong>
                    <span>{archivedSessionTime(item.archivedAt, language, t("common.unknown"))}</span>
                  </div>
                  <button
                    type="button"
                    className="settings-small-btn"
                    disabled={restoring}
                    aria-label={t("settings.archiveRestoreLabel", { name: title })}
                    onClick={() => restore(item.path)}
                  >
                    {restoring ? t("common.working") : t("settings.archiveRestore")}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
