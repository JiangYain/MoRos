import { ChevronDown, ChevronRight, Copy, FolderOpen, Paintbrush, Pin, PinOff } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n.ts";
import { ignoreCommandFailure, useMoros } from "../../store.ts";

export interface WorkspaceContextMenuState {
  key: string;
  workspacePath: string | null;
  workspaceName: string;
  isPinned: boolean;
  isCollapsed: boolean;
  x: number;
  y: number;
}

interface WorkspaceContextMenuProps {
  menu: WorkspaceContextMenuState;
  onClose(): void;
  onCustomize(menu: WorkspaceContextMenuState): void;
  onToggleCollapsed(key: string): void;
  onTogglePinned(key: string): void;
}

export function WorkspaceContextMenu({
  menu,
  onClose,
  onCustomize,
  onToggleCollapsed,
  onTogglePinned,
}: WorkspaceContextMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const openPath = useMoros((state) => state.openPath);
  const setError = useMoros((state) => state.setError);
  const workspacePath = menu.workspacePath;
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const padding = 8;
    const bounds = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(padding, Math.min(menu.x, window.innerWidth - bounds.width - padding)),
      top: Math.max(padding, Math.min(menu.y, window.innerHeight - bounds.height - padding)),
    });
  }, [menu]);

  useEffect(() => {
    const close = (): void => onClose();
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="context-menu sidebar-context-menu"
      role="menu"
      style={{
        left: position?.left ?? menu.x,
        top: position?.top ?? menu.y,
        visibility: position ? "visible" : "hidden",
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={() => { onTogglePinned(menu.key); onClose(); }}>
        {menu.isPinned ? <PinOff size={14} strokeWidth={1.55} /> : <Pin size={14} strokeWidth={1.55} />}
        {menu.isPinned ? t("sidebar.unpinWorkspace") : t("sidebar.pinWorkspace")}
      </button>
      <button type="button" role="menuitem" onClick={() => { onToggleCollapsed(menu.key); onClose(); }}>
        {menu.isCollapsed ? <ChevronDown size={14} strokeWidth={1.55} /> : <ChevronRight size={14} strokeWidth={1.55} />}
        {menu.isCollapsed ? t("sidebar.expandWorkspace") : t("sidebar.collapseWorkspace")}
      </button>
      <button type="button" role="menuitem" onClick={() => { onCustomize(menu); onClose(); }}>
        <Paintbrush size={14} strokeWidth={1.55} />
        {t("sidebar.customizeWorkspace")}
      </button>
      {workspacePath && (
        <>
          <div className="context-menu-rule" role="separator" />
          <button type="button" role="menuitem" onClick={() => { ignoreCommandFailure(openPath(workspacePath)); onClose(); }}>
            <FolderOpen size={14} strokeWidth={1.55} />
            {t("sidebar.revealInExplorer")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void navigator.clipboard.writeText(workspacePath)
                .catch(() => setError(t("sidebar.copyIdFailed")))
                .finally(onClose);
            }}
          >
            <Copy size={14} strokeWidth={1.55} />
            {t("sidebar.copyWorkspacePath")}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
