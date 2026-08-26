import { Archive, Copy, Pencil, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n.ts";
import { useMoros } from "../../store.ts";
import type { SessionTreeInteractions } from "./session-tree-interactions.ts";
import { sessionTitle } from "./session-tree-model.ts";

interface SessionContextMenuProps {
  activeSessionId?: string;
  interactions: SessionTreeInteractions;
}

export function SessionContextMenu({
  activeSessionId,
  interactions,
}: SessionContextMenuProps): React.JSX.Element | null {
  const { t } = useI18n();
  const setError = useMoros((state) => state.setError);
  const menu = interactions.menu.state;
  if (!menu) return null;
  const title = sessionTitle(menu.session, t("common.untitledSession"));
  const backgroundRunning = Boolean(
    menu.session.isRunning && menu.session.id !== activeSessionId,
  );

  return createPortal(
    <div
      ref={interactions.menu.ref}
      className="context-menu sidebar-context-menu"
      role="menu"
      style={{
        left: interactions.menu.position?.left ?? menu.x,
        top: interactions.menu.position?.top ?? menu.y,
        visibility: interactions.menu.position ? "visible" : "hidden",
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => {
        interactions.rename.start(menu.session.path, title);
        interactions.menu.close();
      }}>
        <Pencil size={14} strokeWidth={1.55} />{t("sidebar.rename")}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={backgroundRunning}
        title={backgroundRunning ? t("sidebar.openRunningBeforeRemove") : undefined}
        onClick={() => {
          interactions.menu.close();
          interactions.confirmations.request(menu.session.path, "archive");
        }}
      >
        <Archive size={14} strokeWidth={1.55} />{t("sidebar.archive")}
      </button>
      <button type="button" role="menuitem" onClick={() => {
        void navigator.clipboard.writeText(menu.session.id)
          .catch(() => setError(t("sidebar.copyIdFailed")))
          .finally(interactions.menu.close);
      }}>
        <Copy size={14} strokeWidth={1.55} />{t("sidebar.copySessionId")}
      </button>
      <button
        type="button"
        className="context-menu-delete"
        role="menuitem"
        disabled={backgroundRunning}
        title={backgroundRunning ? t("sidebar.openRunningBeforeRemove") : undefined}
        onClick={() => {
          interactions.menu.close();
          interactions.confirmations.request(menu.session.path, "delete");
        }}
      >
        <Trash2 size={14} strokeWidth={1.55} />{t("sidebar.delete")}
      </button>
    </div>,
    document.body,
  );
}
