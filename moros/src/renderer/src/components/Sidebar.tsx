import { Puzzle, Search, Settings, SquarePen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { ignoreCommandFailure, useMoros } from "../store";
import { MorosAsciiWordmark } from "./MorosAsciiWordmark";
import { SessionSearchOverlay, type SessionSearchEntry } from "./SessionSearchOverlay";
import { SidebarProfile } from "./sidebar/SidebarProfile";
import { SidebarSessionTree } from "./sidebar/SidebarSessionTree";
import { sessionTime, sessionTitle } from "./sidebar/session-tree-model";
import { useSidebarResize } from "./sidebar/useSidebarResize";

export function Sidebar(): React.JSX.Element {
  const { language, t } = useI18n();
  const sessions = useMoros((state) => state.sessions);
  const activeSessionId = useMoros((state) => state.stats?.sessionId);
  const newSession = useMoros((state) => state.newSession);
  const openSession = useMoros((state) => state.openSession);
  const openSettings = useMoros((state) => state.openSettings);
  const sidebarOpen = useMoros((state) => state.sidebarOpen);
  const setSidebarOpen = useMoros((state) => state.setSidebarOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const resize = useSidebarResize();
  const closeMobileSidebar = (): void => {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
  };
  const searchEntries = useMemo<SessionSearchEntry[]>(() => sessions.map((session) => {
    return {
      id: session.id,
      path: session.path,
      title: sessionTitle(session, t("common.untitledSession")),
      time: sessionTime(session, language, t),
      subtitle: session.name ? session.firstMessage.trim() : undefined,
      active: session.id === activeSessionId,
    };
  }), [activeSessionId, language, sessions, t]);

  useEffect(() => {
    const openSearch = (): void => { setSearchOpen(true); closeMobileSidebar(); };
    window.addEventListener("moros:open-session-search", openSearch);
    return () => window.removeEventListener("moros:open-session-search", openSearch);
  }, [setSidebarOpen]);

  return (
    <aside className={`sidebar${sidebarOpen ? " mobile-open" : " collapsed"}${resize.resizing ? " resizing" : ""}`} style={{ "--sidebar-w": `${resize.width}px` } as React.CSSProperties}>
      <SessionSearchOverlay entries={searchEntries} open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={(entry) => {
        setSearchOpen(false);
        if (!entry.active) ignoreCommandFailure(openSession(entry.path));
      }} />
      <div className="sidebar-rail">
        <button type="button" className="sidebar-rail-button" aria-label={t("sidebar.new")} title={t("sidebar.new")} onClick={() => { ignoreCommandFailure(newSession()); }}><SquarePen size={16} strokeWidth={1.65} aria-hidden="true" /></button>
        <button type="button" className="sidebar-rail-button" aria-label={t("sidebar.search")} title={t("sidebar.search")} aria-expanded={searchOpen} aria-controls="session-search-dialog" onClick={() => setSearchOpen(true)}><Search size={16} strokeWidth={1.65} aria-hidden="true" /></button>
        <button type="button" className="sidebar-rail-button" aria-label={t("sidebar.settings")} title={t("sidebar.settings")} onClick={() => openSettings()}><Settings size={16} strokeWidth={1.65} aria-hidden="true" /></button>
      </div>
      <nav className="sidebar-nav" aria-label="Moros">
        <div className="sidebar-brand-row">
          <MorosAsciiWordmark className="sidebar-brand-name moros-brand-name" />
          <button type="button" className={`sidebar-brand-search${searchOpen ? " active" : ""}`} aria-label={t("sidebar.search")} title={t("sidebar.search")} aria-expanded={searchOpen} aria-controls="session-search-dialog" onClick={() => { setSearchOpen(true); closeMobileSidebar(); }}><Search size={17} strokeWidth={1.65} aria-hidden="true" /></button>
        </div>
        <button type="button" className="sidebar-nav-item" onClick={() => { closeMobileSidebar(); ignoreCommandFailure(newSession()); }}><SquarePen size={16} strokeWidth={1.65} aria-hidden="true" /><span>{t("sidebar.new")}</span></button>
        <button type="button" className="sidebar-nav-item" onClick={() => { closeMobileSidebar(); openSettings("skills"); }}><Puzzle size={16} strokeWidth={1.65} aria-hidden="true" /><span>{t("sidebar.skills")}</span></button>
      </nav>
      <SidebarSessionTree />
      <SidebarProfile closeMobileSidebar={closeMobileSidebar} />
      {resize.resizer}
    </aside>
  );
}
