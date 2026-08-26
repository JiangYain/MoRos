import { useCallback, useMemo, useState } from "react";
import { useI18n } from "../../i18n.ts";
import { ignoreCommandFailure, useMoros } from "../../store.ts";
import { SessionContextMenu } from "./SessionContextMenu.tsx";
import { useSessionTreeInteractions } from "./session-tree-interactions.ts";
import { WorkspaceAppearanceDialog } from "./WorkspaceAppearanceDialog.tsx";
import {
  WorkspaceContextMenu,
  type WorkspaceContextMenuState,
} from "./WorkspaceContextMenu.tsx";
import { useWorkspacePreferences } from "./workspace-preferences.ts";
import {
  buildWorkspaceSessionGroups,
  type WorkspaceSessionGroup,
} from "./workspace-session-groups.ts";
import { WorkspaceSessionGroupView } from "./WorkspaceSessionGroup.tsx";

interface CustomizingWorkspace {
  key: string;
  x: number;
  y: number;
}

export function SidebarSessionTree(): React.JSX.Element {
  const { t } = useI18n();
  const sessions = useMoros((state) => state.sessions);
  const settings = useMoros((state) => state.settings);
  const stats = useMoros((state) => state.stats);
  const newSession = useMoros((state) => state.newSession);
  const interactions = useSessionTreeInteractions();
  const preferences = useWorkspacePreferences();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [workspaceMenu, setWorkspaceMenu] = useState<WorkspaceContextMenuState | null>(null);
  const [customizing, setCustomizing] = useState<CustomizingWorkspace | null>(null);
  const currentWorkspaceDir = stats?.workspaceDir ?? settings?.workspaceDir ?? "";

  const groups = useMemo(() => buildWorkspaceSessionGroups({
    currentWorkspaceDir,
    legacyWorkspaceName: t("sidebar.legacyWorkspace"),
    pinned: preferences.pinned,
    sessions,
  }), [currentWorkspaceDir, preferences.pinned, sessions, t]);

  const toggleCollapsed = useCallback((key: string): void => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const openWorkspaceMenu = useCallback((
    group: WorkspaceSessionGroup,
    isCollapsed: boolean,
    x: number,
    y: number,
  ): void => {
    setWorkspaceMenu({
      key: group.key,
      workspacePath: group.workspacePath,
      workspaceName: group.workspaceName,
      isPinned: group.isPinned,
      isCollapsed,
      x,
      y,
    });
  }, []);

  const hasOnlyEmptyCurrentWorkspace = groups.length === 1 && groups[0].sessions.length === 0;

  return (
    <div className="file-tree">
      <div className="file-section">
        <div className="file-section-header">
          <div className="file-section-header-main">
            <span className="file-section-title">{t("sidebar.sessions")}</span>
          </div>
        </div>
        {groups.length === 0 || hasOnlyEmptyCurrentWorkspace ? (
          <div className="empty-state">{t("sidebar.empty")}</div>
        ) : (
          <div className="workspace-groups-container">
            {groups.map((group) => (
              <WorkspaceSessionGroupView
                key={group.key}
                activeSessionId={stats?.sessionId}
                appearance={preferences.appearances[group.key]}
                collapsed={Boolean(collapsed[group.key])}
                group={group}
                interactions={interactions}
                menuOpen={workspaceMenu?.key === group.key}
                onCloseWorkspaceMenu={() => setWorkspaceMenu(null)}
                onCreateSession={(workspacePath) => {
                  ignoreCommandFailure(newSession(workspacePath));
                }}
                onOpenWorkspaceMenu={openWorkspaceMenu}
                onToggle={() => toggleCollapsed(group.key)}
                onTogglePinned={() => preferences.togglePinned(group.key)}
              />
            ))}
          </div>
        )}
      </div>

      {workspaceMenu && (
        <WorkspaceContextMenu
          menu={workspaceMenu}
          onClose={() => setWorkspaceMenu(null)}
          onCustomize={(menu) => setCustomizing({ key: menu.key, x: menu.x, y: menu.y })}
          onToggleCollapsed={toggleCollapsed}
          onTogglePinned={preferences.togglePinned}
        />
      )}
      <SessionContextMenu activeSessionId={stats?.sessionId} interactions={interactions} />
      {customizing && (
        <WorkspaceAppearanceDialog
          currentAppearance={preferences.appearances[customizing.key] ?? {
            iconId: "folder",
            colorId: "black",
          }}
          anchorPosition={{ x: customizing.x, y: customizing.y }}
          onClose={() => setCustomizing(null)}
          onChange={(appearance) => preferences.setAppearance(customizing.key, appearance)}
        />
      )}
    </div>
  );
}
