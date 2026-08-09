import { Ear, Puzzle, Search, SquarePen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { ignoreCommandFailure, useCompass } from "../store";
import { SessionSearchOverlay, type SessionSearchEntry } from "./SessionSearchOverlay";
import { SidebarProfile } from "./sidebar/SidebarProfile";
import { SidebarSessionTree } from "./sidebar/SidebarSessionTree";
import { inferClient, sessionTime, sessionTitle } from "./sidebar/session-tree-model";
import { useSidebarResize } from "./sidebar/useSidebarResize";

export function Sidebar(): React.JSX.Element {
  const { language, t } = useI18n();
  const sessions = useCompass((state) => state.sessions);
  const activeSessionId = useCompass((state) => state.stats?.sessionId);
  const skills = useCompass((state) => state.skills);
  const clientRegistry = useCompass((state) => state.clientRegistry);
  const newSession = useCompass((state) => state.newSession);
  const openSession = useCompass((state) => state.openSession);
  const openSettings = useCompass((state) => state.openSettings);
  const sidebarOpen = useCompass((state) => state.sidebarOpen);
  const setSidebarOpen = useCompass((state) => state.setSidebarOpen);
  const mainView = useCompass((state) => state.mainView);
  const setMainView = useCompass((state) => state.setMainView);
  const [searchOpen, setSearchOpen] = useState(false);
  const resize = useSidebarResize();
  const closeMobileSidebar = (): void => {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
  };
  const searchEntries = useMemo<SessionSearchEntry[]>(() => sessions.map((session) => {
    const client = inferClient(session, clientRegistry);
    return {
      id: session.id,
      path: session.path,
      title: sessionTitle(session, t("common.untitledSession")),
      time: sessionTime(session, language, t),
      client: client.unassigned ? t("sidebar.unassigned") : client.name,
      active: session.id === activeSessionId,
    };
  }), [activeSessionId, clientRegistry, language, sessions, t]);
  const enabledSkills = skills.filter((skill) => skill.enabled).length;

  useEffect(() => {
    const openSearch = (): void => { setSearchOpen(true); closeMobileSidebar(); };
    window.addEventListener("compass:open-session-search", openSearch);
    return () => window.removeEventListener("compass:open-session-search", openSearch);
  }, [setSidebarOpen]);

  return (
    <aside className={`sidebar${sidebarOpen ? " mobile-open" : " collapsed"}${resize.resizing ? " resizing" : ""}`} style={{ "--sidebar-w": `${resize.width}px` } as React.CSSProperties}>
      <SessionSearchOverlay entries={searchEntries} open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={(entry) => {
        setSearchOpen(false);
        if (entry.active) setMainView("assistant");
        else ignoreCommandFailure(openSession(entry.path));
      }} />
      <nav className="sidebar-nav" aria-label="Compass">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand-name" aria-label="Compass."><span>Compass</span><span className="sidebar-brand-dot">.</span></div>
          <button type="button" className={`sidebar-brand-search${searchOpen ? " active" : ""}`} aria-label={t("sidebar.search")} title={t("sidebar.search")} aria-expanded={searchOpen} aria-controls="session-search-dialog" onClick={() => { setSearchOpen(true); closeMobileSidebar(); }}><Search size={17} strokeWidth={1.65} aria-hidden="true" /></button>
        </div>
        <button type="button" className="sidebar-nav-item" onClick={() => { closeMobileSidebar(); ignoreCommandFailure(newSession()); }}><SquarePen size={16} strokeWidth={1.65} aria-hidden="true" /><span>{t("sidebar.new")}</span></button>
        <button type="button" className={`sidebar-nav-item${mainView === "hearing-health" ? " active" : ""}`} aria-current={mainView === "hearing-health" ? "page" : undefined} onClick={() => { closeMobileSidebar(); setMainView("hearing-health"); }}><Ear size={16} strokeWidth={1.65} aria-hidden="true" /><span>{t("sidebar.hearingHealth")}</span></button>
        <button type="button" className="sidebar-nav-item" onClick={() => { closeMobileSidebar(); openSettings("skills"); }}><Puzzle size={16} strokeWidth={1.65} aria-hidden="true" /><span>{t("sidebar.skills")}</span><span className="nav-count">{enabledSkills}</span></button>
      </nav>
      <SidebarSessionTree />
      <SidebarProfile closeMobileSidebar={closeMobileSidebar} />
      {resize.resizer}
    </aside>
  );
}
