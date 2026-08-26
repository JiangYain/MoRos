import type { UiSessionInfo } from "@shared/types";
import { Check, LoaderCircle, MoreHorizontal, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useCallback } from "react";
import { useI18n } from "../../i18n.ts";
import { ignoreCommandFailure, useMoros } from "../../store.ts";
import { ThreadInlineConfirmation } from "../ThreadInlineConfirmation.tsx";
import { runSessionConfirmationCommand } from "./session-confirmation-command.ts";
import { sessionRowStatus } from "./session-row-status.ts";
import type { SessionTreeInteractions } from "./session-tree-interactions.ts";
import { sessionTime, sessionTitle } from "./session-tree-model.ts";

interface SidebarSessionRowProps {
  activeSessionId?: string;
  interactions: SessionTreeInteractions;
  onOpenMenu(): void;
  session: UiSessionInfo;
}

export function SidebarSessionRow({
  activeSessionId,
  interactions,
  onOpenMenu,
  session,
}: SidebarSessionRowProps): React.JSX.Element {
  const { language, t } = useI18n();
  const openSession = useMoros((state) => state.openSession);
  const renameSession = useMoros((state) => state.renameSession);
  const archiveSession = useMoros((state) => state.archiveSession);
  const deleteSession = useMoros((state) => state.deleteSession);
  const setError = useMoros((state) => state.setError);
  const setSidebarOpen = useMoros((state) => state.setSidebarOpen);
  const active = session.id === activeSessionId;
  const renaming = interactions.rename.state?.path === session.path;
  const confirmation = interactions.confirmations.items[session.path] ?? null;
  const status = sessionRowStatus(session, t("common.now"));
  const title = sessionTitle(session, t("common.untitledSession"));
  const tooltip = `${sessionTime(session, language, t)} · ${status.kind === "running" ? t("sidebar.sessionRunning") : status.relativeAge} · ${title}`;

  const open = useCallback((): void => {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
    if (!active) ignoreCommandFailure(openSession(session.path));
  }, [active, openSession, session.path, setSidebarOpen]);

  const commitRename = useCallback((): void => {
    const rename = interactions.rename.state;
    if (!rename || rename.path !== session.path) return;
    const name = rename.draft.trim();
    if (!name) {
      setError(t("sidebar.renameEmpty"));
      requestAnimationFrame(() => interactions.rename.inputRef.current?.focus());
      return;
    }
    setError(null);
    ignoreCommandFailure(
      renameSession(session.path, name).then(() => interactions.rename.complete(session.path)),
    );
  }, [interactions.rename, renameSession, session.path, setError, t]);

  return (
    <div className={`file-tree-item thread-item-shell${active ? " active" : ""}${confirmation ? " confirming" : ""}`}>
      {renaming ? (
        <div
          className="file-item thread-file-item renaming"
          onBlur={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
              interactions.rename.cancel();
            }
          }}
        >
          <input
            ref={interactions.rename.inputRef}
            className="thread-rename-input"
            value={interactions.rename.state?.draft ?? ""}
            autoFocus
            onChange={(event) => interactions.rename.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") interactions.rename.cancel();
            }}
          />
          <span className="thread-rename-actions">
            <button type="button" aria-label={t("sidebar.confirmRename")} title={t("sidebar.confirmRename")} onClick={commitRename}>
              <Check size={12} strokeWidth={1.8} />
            </button>
            <button type="button" aria-label={t("sidebar.cancelRename")} title={t("common.cancel")} onClick={interactions.rename.cancel}>
              <X size={12} strokeWidth={1.8} />
            </button>
          </span>
        </div>
      ) : (
        <>
          <button type="button" className={`file-item thread-file-item${active ? " active" : ""}`} onClick={open} title={tooltip}>
            <span className="file-name">{title}</span>
            {status.kind === "running" ? (
              <span className="thread-running-indicator" role="img" aria-label={t("sidebar.sessionRunning")} title={t("sidebar.sessionRunning")}>
                <LoaderCircle size={13} strokeWidth={1.8} aria-hidden="true" />
              </span>
            ) : (
              <time className="thread-relative-time" dateTime={status.dateTime}>{status.relativeAge}</time>
            )}
          </button>
          <button
            type="button"
            className="thread-more-button"
            aria-label={`${t("sidebar.moreActions")}: ${title}`}
            aria-expanded={interactions.menu.state?.session.path === session.path}
            title={t("sidebar.moreActions")}
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu();
              const bounds = event.currentTarget.getBoundingClientRect();
              interactions.menu.open({
                alignRight: true,
                session,
                x: bounds.right,
                y: bounds.bottom + 4,
              });
            }}
          >
            <MoreHorizontal size={14} strokeWidth={1.65} aria-hidden="true" />
          </button>
        </>
      )}
      <AnimatePresence initial={false}>
        {confirmation && (
          <ThreadInlineConfirmation
            key={`${confirmation.path}:${confirmation.action}`}
            action={confirmation.action}
            busy={confirmation.busy}
            sessionTitle={title}
            onCancel={() => interactions.confirmations.clear(confirmation)}
            onConfirm={() => ignoreCommandFailure(runSessionConfirmationCommand(
              confirmation,
              { archive: archiveSession, delete: deleteSession },
              interactions.confirmations,
            ))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
