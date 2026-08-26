import { ChevronDown, ChevronRight, Folder, FolderOpen, Pin, PinOff, SquarePen } from "lucide-react";
import { useI18n } from "../../i18n.ts";
import { SidebarSessionRow } from "./SidebarSessionRow.tsx";
import type { SessionTreeInteractions } from "./session-tree-interactions.ts";
import {
  WORKSPACE_COLOR_MAP,
  WORKSPACE_ICON_MAP,
  type WorkspaceAppearance,
} from "./workspace-appearance.ts";
import type { WorkspaceSessionGroup } from "./workspace-session-groups.ts";

interface WorkspaceSessionGroupProps {
  activeSessionId?: string;
  appearance?: WorkspaceAppearance;
  collapsed: boolean;
  group: WorkspaceSessionGroup;
  interactions: SessionTreeInteractions;
  menuOpen: boolean;
  onCloseWorkspaceMenu(): void;
  onCreateSession(workspacePath: string): void;
  onOpenWorkspaceMenu(group: WorkspaceSessionGroup, collapsed: boolean, x: number, y: number): void;
  onToggle(): void;
  onTogglePinned(): void;
}

export function WorkspaceSessionGroupView({
  activeSessionId,
  appearance,
  collapsed,
  group,
  interactions,
  menuOpen,
  onCloseWorkspaceMenu,
  onCreateSession,
  onOpenWorkspaceMenu,
  onToggle,
  onTogglePinned,
}: WorkspaceSessionGroupProps): React.JSX.Element {
  const { t } = useI18n();
  const Icon = (appearance?.iconId && WORKSPACE_ICON_MAP.get(appearance.iconId))
    || (collapsed ? Folder : FolderOpen);
  const customColor = appearance?.colorId
    ? WORKSPACE_COLOR_MAP.get(appearance.colorId)
    : undefined;
  const hasCustomColor = Boolean(appearance?.colorId && appearance.colorId !== "black");
  const workspacePath = group.workspacePath;

  return (
    <div className="workspace-group">
      <div
        className={`workspace-group-header-shell${group.isCurrent ? " current" : ""}${group.isPinned ? " pinned" : ""}${menuOpen ? " menu-open" : ""}`}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          interactions.menu.close();
          onOpenWorkspaceMenu(group, collapsed, event.clientX, event.clientY);
        }}
      >
        <button
          type="button"
          className={`workspace-group-header${group.isCurrent ? " current" : ""}`}
          onClick={onToggle}
          title={group.workspacePath ?? group.workspaceName}
          aria-expanded={!collapsed}
        >
          <span className="workspace-group-chevron" aria-hidden="true">
            {collapsed ? <ChevronRight size={13} strokeWidth={1.8} /> : <ChevronDown size={13} strokeWidth={1.8} />}
          </span>
          <span
            className="workspace-group-icon"
            aria-hidden="true"
            style={hasCustomColor && customColor ? { color: customColor } : undefined}
          >
            <Icon size={14} strokeWidth={1.6} />
          </span>
          <span className="workspace-group-name">{group.workspaceName}</span>
        </button>
        <button
          type="button"
          className={`workspace-group-pin-btn${group.isPinned ? " pinned" : ""}`}
          title={group.isPinned ? t("sidebar.unpinWorkspace") : t("sidebar.pinWorkspace")}
          aria-label={group.isPinned ? t("sidebar.unpinWorkspace") : t("sidebar.pinWorkspace")}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned();
          }}
        >
          {group.isPinned
            ? <PinOff size={12.5} strokeWidth={1.6} className="workspace-group-pin-icon" aria-hidden="true" />
            : <Pin size={12.5} strokeWidth={1.6} className="workspace-group-pin-icon" aria-hidden="true" />}
        </button>
        {workspacePath && (
          <button
            type="button"
            className="workspace-group-new-btn"
            title={`${t("sidebar.newInWorkspace")}: ${group.workspaceName}`}
            aria-label={`${t("sidebar.newInWorkspace")}: ${group.workspaceName}`}
            onClick={(event) => {
              event.stopPropagation();
              onCloseWorkspaceMenu();
              onCreateSession(workspacePath);
            }}
          >
            <SquarePen size={13.5} strokeWidth={1.65} aria-hidden="true" />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="file-section-content file-children workspace-group-sessions">
          {group.sessions.length === 0 ? (
            <div className="workspace-group-empty-state">{t("sidebar.noConversations")}</div>
          ) : group.sessions.map((session) => (
            <SidebarSessionRow
              key={session.path}
              activeSessionId={activeSessionId}
              interactions={interactions}
              onOpenMenu={onCloseWorkspaceMenu}
              session={session}
            />
          ))}
        </div>
      )}
    </div>
  );
}
