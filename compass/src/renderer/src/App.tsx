import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { Hero } from "./components/Hero";
import { SettingsWorkspace } from "./components/SettingsWorkspace";
import { Sidebar } from "./components/Sidebar";
import { Thread } from "./components/Thread";
import { TitleBar } from "./components/TitleBar";
import { api, isDesktop } from "./ipc";
import { type SettingsSection, useCompass } from "./store";
import { useThemePreference } from "./theme";

type NavigationTarget =
  | { key: "workspace"; kind: "workspace" }
  | { key: `session:${string}`; kind: "session"; path: string }
  | { key: `settings:${SettingsSection}`; kind: "settings"; section: SettingsSection };

interface NavigationAvailability {
  canGoBack: boolean;
  canGoForward: boolean;
}

export default function App(): React.JSX.Element {
  useThemePreference();
  const ready = useCompass((s) => s.ready);
  const thread = useCompass((s) => s.thread);
  const approvals = useCompass((s) => s.approvals);
  const sessions = useCompass((s) => s.sessions);
  const stats = useCompass((s) => s.stats);
  const boot = useCompass((s) => s.boot);
  const applyEvent = useCompass((s) => s.applyEvent);
  const newSession = useCompass((s) => s.newSession);
  const openSession = useCompass((s) => s.openSession);
  const openSettings = useCompass((s) => s.openSettings);
  const closeSettings = useCompass((s) => s.closeSettings);
  const settingsSection = useCompass((s) => s.settingsSection);
  const sidebarOpen = useCompass((s) => s.sidebarOpen);
  const setSidebarOpen = useCompass((s) => s.setSidebarOpen);
  const historyRef = useRef<NavigationTarget[]>([]);
  const historyIndexRef = useRef(-1);
  const pendingNavigationKeyRef = useRef<NavigationTarget["key"] | null>(null);
  const [navigationAvailability, setNavigationAvailability] = useState<NavigationAvailability>({
    canGoBack: false,
    canGoForward: false,
  });

  const activeSessionPath = useMemo(
    () => sessions.find((session) => session.id === stats?.sessionId)?.path,
    [sessions, stats?.sessionId],
  );
  const currentNavigationTarget = useMemo<NavigationTarget>(() => {
    if (settingsSection) {
      return {
        key: `settings:${settingsSection}`,
        kind: "settings",
        section: settingsSection,
      };
    }
    if (activeSessionPath) {
      return {
        key: `session:${activeSessionPath}`,
        kind: "session",
        path: activeSessionPath,
      };
    }
    return { key: "workspace", kind: "workspace" };
  }, [activeSessionPath, settingsSection]);

  const syncNavigationAvailability = useCallback((): void => {
    const index = historyIndexRef.current;
    setNavigationAvailability({
      canGoBack: index > 0,
      canGoForward: index >= 0 && index < historyRef.current.length - 1,
    });
  }, []);

  const openNavigationTarget = useCallback((target: NavigationTarget): Promise<void> | void => {
    if (target.kind === "settings") {
      openSettings(target.section);
      return;
    }
    closeSettings();
    if (target.kind === "session") return openSession(target.path);
    return newSession();
  }, [closeSettings, newSession, openSession, openSettings]);

  const navigateHistory = useCallback((offset: -1 | 1): void => {
    const previousIndex = historyIndexRef.current;
    const nextIndex = previousIndex + offset;
    const target = historyRef.current[nextIndex];
    if (!target) return;

    historyIndexRef.current = nextIndex;
    pendingNavigationKeyRef.current = target.key;
    syncNavigationAvailability();
    const navigation = openNavigationTarget(target);
    if (!navigation) return;
    void navigation.catch(() => {
      if (pendingNavigationKeyRef.current !== target.key) return;
      pendingNavigationKeyRef.current = null;
      historyIndexRef.current = previousIndex;
      syncNavigationAvailability();
    });
  }, [openNavigationTarget, syncNavigationAvailability]);

  useEffect(() => {
    if (isDesktop) {
      void boot();
      return api.onAgentEvent(applyEvent);
    }

    let disposed = false;
    let unsubscribe = (): void => undefined;
    void boot().then(() => {
      if (!disposed) unsubscribe = api.onAgentEvent(applyEvent);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 760px)");
    const syncSidebarForViewport = (): void => setSidebarOpen(!compactViewport.matches);
    syncSidebarForViewport();
    compactViewport.addEventListener("change", syncSidebarForViewport);
    return () => compactViewport.removeEventListener("change", syncSidebarForViewport);
  }, [setSidebarOpen]);

  useEffect(() => {
    if (!ready) return;
    const pendingKey = pendingNavigationKeyRef.current;
    if (pendingKey) {
      if (pendingKey === currentNavigationTarget.key) {
        pendingNavigationKeyRef.current = null;
        syncNavigationAvailability();
      }
      return;
    }

    const history = historyRef.current;
    const index = historyIndexRef.current;
    if (history[index]?.key === currentNavigationTarget.key) return;
    const nextHistory = [
      ...history.slice(0, index + 1),
      currentNavigationTarget,
    ].slice(-50);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    syncNavigationAvailability();
  }, [currentNavigationTarget, ready, syncNavigationAvailability]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        openSettings();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        closeSettings();
        void newSession();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")
      ) {
        event.preventDefault();
        closeSettings();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.dispatchEvent(new Event("compass:open-session-search"));
        }));
        return;
      }
      if (event.key !== "Escape") return;
      if (document.querySelector(
        ".session-search-overlay, .client-dialog-backdrop, .profile-menu, .sidebar-context-menu, .thread-inline-confirmation, .popover",
      )) return;
      if (settingsSection) {
        closeSettings();
        return;
      }
      if (sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings, newSession, openSettings, setSidebarOpen, settingsSection, sidebarOpen]);

  return (
    <div className="app-frame">
      <TitleBar />
      <div className={`app-body${settingsSection ? " settings-open" : ""}`}>
        {settingsSection ? (
          <SettingsWorkspace />
        ) : (
          <>
            {sidebarOpen && (
              <button
                type="button"
                className="mobile-sidebar-scrim"
                aria-label="关闭导航"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <Sidebar
              canNavigateBack={navigationAvailability.canGoBack}
              canNavigateForward={navigationAvailability.canGoForward}
              onNavigateBack={() => navigateHistory(-1)}
              onNavigateForward={() => navigateHistory(1)}
            />
            <main className="main-col">
              {ready && thread.length === 0 && approvals.length === 0 ? <Hero /> : <Thread />}
              <Composer />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
