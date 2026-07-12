import { PanelLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, isDesktop } from "../ipc";
import { useCompass } from "../store";
import { CompassLogo } from "./CompassLogo";

type GlobalMenuName = "file" | "edit" | "view" | "help";

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<GlobalMenuName | null>(null);
  const menuBarRef = useRef<HTMLElement>(null);
  const settings = useCompass((state) => state.settings);
  const newSession = useCompass((state) => state.newSession);
  const openSettings = useCompass((state) => state.openSettings);
  const closeSettings = useCompass((state) => state.closeSettings);
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

  const startNewSession = (): void => {
    closeSettings();
    void newSession();
  };

  const focusComposer = (): void => {
    closeSettings();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
    }));
  };

  const openSessionSearch = (): void => {
    closeSettings();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.dispatchEvent(new Event("compass:open-session-search"));
    }));
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand" role="img" aria-label="Compass">
        <CompassLogo size={17} />
      </div>
      <button
        type="button"
        className={`sidebar-toggle titlebar-sidebar-toggle${sidebarOpen ? " active" : ""}`}
        aria-label={sidebarOpen ? "关闭导航" : "打开导航"}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <PanelLeft size={15} strokeWidth={1.6} />
      </button>

      <nav ref={menuBarRef} className="global-menu" aria-label="Global menu">
        <div className="global-menu-group">
          <button
            type="button"
            className={`global-menu-trigger${openMenu === "file" ? " active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === "file"}
            onClick={() => setOpenMenu((current) => current === "file" ? null : "file")}
          >
            File
          </button>
          {openMenu === "file" && (
            <div className="global-menu-popover" role="menu" aria-label="File menu">
              <button type="button" role="menuitem" onClick={() => runMenuAction(startNewSession)}>
                <span>New conversation</span><kbd>Ctrl+N</kbd>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!settings?.workspaceDir}
                onClick={() => runMenuAction(() => {
                  if (settings?.workspaceDir) void api.openPath(settings.workspaceDir);
                })}
              >
                <span>Open workspace</span>
              </button>
              <div className="global-menu-separator" />
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings())}>
                <span>Settings</span><kbd>Ctrl+,</kbd>
              </button>
              {isDesktop && (
                <button type="button" role="menuitem" onClick={() => runMenuAction(() => api.windowControl("close"))}>
                  <span>Exit</span>
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
            Edit
          </button>
          {openMenu === "edit" && (
            <div className="global-menu-popover" role="menu" aria-label="Edit menu">
              <button type="button" role="menuitem" onClick={() => runMenuAction(focusComposer)}>
                <span>Focus composer</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(openSessionSearch)}>
                <span>Search conversations</span><kbd>Ctrl+K</kbd>
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
            View
          </button>
          {openMenu === "view" && (
            <div className="global-menu-popover" role="menu" aria-label="View menu">
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => setSidebarOpen(!sidebarOpen))}>
                <span>{sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}</span>
              </button>
              <div className="global-menu-separator" />
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("models"))}>
                <span>Provider &amp; Model</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("skills"))}>
                <span>Skills</span>
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
            Help
          </button>
          {openMenu === "help" && (
            <div className="global-menu-popover" role="menu" aria-label="Help menu">
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("general"))}>
                <span>About Compass</span>
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(() => openSettings("profile"))}>
                <span>Profile</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="titlebar-drag-space" />
      {isDesktop && (
        <div className="win-controls">
          <button className="win-btn" aria-label="最小化" onClick={() => api.windowControl("minimize")}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button className="win-btn" aria-label="最大化" onClick={() => api.windowControl("maximize")}>
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
          <button className="win-btn close" aria-label="关闭" onClick={() => api.windowControl("close")}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
}
