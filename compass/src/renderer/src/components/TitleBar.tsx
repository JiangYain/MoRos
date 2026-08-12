import { ArrowLeft, ArrowRight } from "lucide-react";
import type { DeveloperContextSnapshot } from "@shared/types";
import { useEffect, useRef, useState } from "react";
import { api, isDesktop } from "../ipc";
import { useI18n } from "../i18n";
import { ignoreCommandFailure, useCompass } from "../store";
import { CompassLogo } from "./CompassLogo";
import { DeveloperContextDialog } from "./DeveloperContextDialog";

type GlobalMenuName = "file" | "edit" | "view" | "help";

interface TitleBarProps {
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onNavigateBack(): void;
  onNavigateForward(): void;
}

export function TitleBar({
  canNavigateBack,
  canNavigateForward,
  onNavigateBack,
  onNavigateForward,
}: TitleBarProps): React.JSX.Element {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<GlobalMenuName | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextSnapshot, setContextSnapshot] = useState<DeveloperContextSnapshot | null>(null);
  const menuBarRef = useRef<HTMLElement>(null);
  const settings = useCompass((state) => state.settings);
  const newSession = useCompass((state) => state.newSession);
  const openPath = useCompass((state) => state.openPath);
  const openSettings = useCompass((state) => state.openSettings);
  const closeSettings = useCompass((state) => state.closeSettings);
  const armSettingsNavigation = useCompass((state) => state.armSettingsNavigation);
  const sidebarOpen = useCompass((state) => state.sidebarOpen);
  const setSidebarOpen = useCompass((state) => state.setSidebarOpen);

  useEffect(() => api.onMaximizeChange(setMaximized), []);

  useEffect(() => {
    const closeOnOutsidePointer = (event: MouseEvent): void => {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const runMenuAction = (action: () => void): void => {
    setOpenMenu(null);
    action();
  };

  // Composite menu actions leave Settings first; the leave-guard may hold the
  // follow-up until the user resolves unsaved quick-prompt changes.
  const leaveSettingsThen = (action: () => void): void => {
    if (armSettingsNavigation(action)) return;
    closeSettings();
    action();
  };

  const startNewSession = (): void => {
    leaveSettingsThen(() => ignoreCommandFailure(newSession()));
  };

  const focusComposer = (): void => {
    leaveSettingsThen(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
      }));
    });
  };

  const openSessionSearch = (): void => {
    leaveSettingsThen(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new Event("compass:open-session-search"));
      }));
    });
  };

  const refreshDeveloperContext = (): void => {
    setContextLoading(true);
    setContextError(null);
    void api.getDeveloperContext()
      .then(setContextSnapshot)
      .catch((error: unknown) => setContextError(error instanceof Error ? error.message : String(error)))
      .finally(() => setContextLoading(false));
  };

  const openDeveloperContext = (): void => {
    setOpenMenu(null);
    setContextOpen(true);
    refreshDeveloperContext();
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand" role="img" aria-label="Compass">
        <CompassLogo size={15} />
      </div>
      <div className="titlebar-navigation-controls" aria-label={t("titlebar.navigation")}>
        <button
          type="button"
          className={`sidebar-toggle titlebar-sidebar-toggle${sidebarOpen ? " active" : ""}`}
          aria-label={sidebarOpen ? t("titlebar.collapseSidebar") : t("titlebar.expandSidebar")}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? t("titlebar.collapseSidebar") : t("titlebar.expandSidebar")}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <rect x="1.25" y="1.75" width="12.5" height="11.5" rx="2.6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5.25 2.1V12.9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-navigation-button"
          aria-label={t("titlebar.back")}
          title={t("titlebar.back")}
          disabled={!canNavigateBack}
          onClick={onNavigateBack}
        >
          <ArrowLeft size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="titlebar-navigation-button"
          aria-label={t("titlebar.forward")}
          title={t("titlebar.forward")}
          disabled={!canNavigateForward}
          onClick={onNavigateForward}
        >
          <ArrowRight size={14} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>

      <nav ref={menuBarRef} className="global-menu" aria-label={t("titlebar.globalMenu")}>
        <div className="global-menu-group">
          <button
            type="button"
            className={`global-menu-trigger${openMenu === "file" ? " active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === "file"}
            onClick={() => setOpenMenu((current) => current === "file" ? null : "file")}
          >
            {t("titlebar.file")}
          </button>
          {openMenu === "file" && (
            <div className="global-menu-popover" role="menu" aria-label={t("titlebar.file")}>
              <button type="button" role="menuitem" onClick={() => runMenuAction(startNewSession)}>
                <span>{t("titlebar.newConversation")}</span><kbd>Ctrl+N</kbd>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!settings?.workspaceDir}
                onClick={() => runMenuAction(() => {
                  if (settings?.workspaceDir) {
                    ignoreCommandFailure(openPath(settings.workspaceDir));
                  }
                })}
              >
                <span>{t("titlebar.openWorkspace")}</span>
              </button>
              <div className="global-menu-separator" />
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings())}>
                <span>{t("titlebar.settings")}</span><kbd>Ctrl+,</kbd>
              </button>
              {isDesktop && (
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => api.windowControl("close"))}>
                  <span>{t("titlebar.exit")}</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="global-menu-group">
          <button
            type="button"
            className={`global-menu-trigger${openMenu === "edit" ? " active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === "edit"}
            onClick={() => setOpenMenu((current) => current === "edit" ? null : "edit")}
          >
            {t("titlebar.edit")}
          </button>
          {openMenu === "edit" && (
            <div className="global-menu-popover" role="menu" aria-label={t("titlebar.edit")}>
              <button type="button" role="menuitem" onClick={() => runMenuAction(focusComposer)}>
                <span>{t("titlebar.focusComposer")}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(openSessionSearch)}>
                <span>{t("titlebar.searchConversations")}</span><kbd>Ctrl+K</kbd>
              </button>
            </div>
          )}
        </div>

        <div className="global-menu-group">
          <button
            type="button"
            className={`global-menu-trigger${openMenu === "view" ? " active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === "view"}
            onClick={() => setOpenMenu((current) => current === "view" ? null : "view")}
          >
            {t("titlebar.view")}
          </button>
          {openMenu === "view" && (
            <div className="global-menu-popover" role="menu" aria-label={t("titlebar.view")}>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => setSidebarOpen(!sidebarOpen))}>
                <span>{sidebarOpen ? t("titlebar.collapseSidebar") : t("titlebar.expandSidebar")}</span>
              </button>
              <div className="global-menu-separator" />
              <button type="button" role="menuitem" onClick={openDeveloperContext}>
                <span>{t("titlebar.developerContext")}</span>
              </button>
              <div className="global-menu-separator" />
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("models"))}>
                <span>{t("titlebar.providersModels")}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("skills"))}>
                <span>{t("titlebar.skills")}</span>
              </button>
            </div>
          )}
        </div>

        <div className="global-menu-group">
          <button
            type="button"
            className={`global-menu-trigger${openMenu === "help" ? " active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === "help"}
            onClick={() => setOpenMenu((current) => current === "help" ? null : "help")}
          >
            {t("titlebar.help")}
          </button>
          {openMenu === "help" && (
            <div className="global-menu-popover" role="menu" aria-label={t("titlebar.help")}>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("general"))}>
                <span>{t("titlebar.about")}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("profile"))}>
                <span>{t("titlebar.profile")}</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="titlebar-drag-space" />
      {isDesktop && (
        <div className="win-controls">
          <button className="win-btn" aria-label={t("titlebar.minimize")} onClick={() => api.windowControl("minimize")}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button className="win-btn" aria-label={t("titlebar.maximize")} onClick={() => api.windowControl("maximize")}>
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
                <path d="M 2.5 2.5 v -2 h 7 v 7 h -2" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10">
                <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>
          <button className="win-btn close" aria-label={t("common.close")} onClick={() => api.windowControl("close")}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      )}
      <DeveloperContextDialog
        open={contextOpen}
        loading={contextLoading}
        error={contextError}
        snapshot={contextSnapshot}
        onClose={() => setContextOpen(false)}
        onRefresh={refreshDeveloperContext}
      />
    </header>
  );
}
