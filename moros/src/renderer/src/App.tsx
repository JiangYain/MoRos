import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { CommandErrorBanner } from "./components/CommandErrorBanner";
import { Hero } from "./components/Hero";
import { SettingsWorkspace } from "./components/SettingsWorkspace";
import { Sidebar } from "./components/Sidebar";
import { Thread } from "./components/Thread";
import { TitleBar } from "./components/TitleBar";
import { WorkspaceChangeDialog } from "./components/WorkspaceChangeDialog";
import { api, isDesktop } from "./ipc";
import { useI18n } from "./i18n";
import { useCodeFontPreference } from "./code-font";
import { ignoreCommandFailure, type SettingsSection, useMoros } from "./store";
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
  useCodeFontPreference();
  const { language, t } = useI18n();
  const ready = useMoros((s) => s.ready);
  const thread = useMoros((s) => s.thread);
  const approvals = useMoros((s) => s.approvals);
  const sessions = useMoros((s) => s.sessions);
  const stats = useMoros((s) => s.stats);
  const boot = useMoros((s) => s.boot);
  const applyEvent = useMoros((s) => s.applyEvent);
  const newSession = useMoros((s) => s.newSession);
  const openSession = useMoros((s) => s.openSession);
  const openSettings = useMoros((s) => s.openSettings);
  const closeSettings = useMoros((s) => s.closeSettings);
  const armSettingsNavigation = useMoros((s) => s.armSettingsNavigation);
  const settingsSection = useMoros((s) => s.settingsSection);
  const sidebarOpen = useMoros((s) => s.sidebarOpen);
  const setSidebarOpen = useMoros((s) => s.setSidebarOpen);
  const lastError = useMoros((s) => s.lastError);
  const setError = useMoros((s) => s.setError);
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
  const showConversationThread = thread.length > 0
    || approvals.length > 0;
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

  const openNavigationTarget = useCallback((target: NavigationTarget): Promise<boolean> | void => {
    if (target.kind === "settings") {
      openSettings(target.section);
      return;
    }
    const afterLeave = (): Promise<boolean> | void => {
      if (target.kind === "session") return openSession(target.path);
      if (target.kind === "workspace") return newSession();
    };
    // Unsaved settings edits keep the whole navigation pending until the
    // guard dialog is resolved; nothing may run early in the background.
    if (armSettingsNavigation(() => void afterLeave())) return;
    closeSettings();
    return afterLeave();
  }, [armSettingsNavigation, closeSettings, newSession, openSession, openSettings]);

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
    const rollback = (): void => {
      if (pendingNavigationKeyRef.current !== target.key) return;
      pendingNavigationKeyRef.current = null;
      historyIndexRef.current = previousIndex;
      syncNavigationAvailability();
    };
    void navigation.then((opened) => {
      if (!opened) rollback();
    }).catch(rollback);
  }, [openNavigationTarget, syncNavigationAvailability]);

  useEffect(() => {
    if (isDesktop) {
      ignoreCommandFailure(boot());
      return api.onAgentEvent(applyEvent);
    }

    let disposed = false;
    let unsubscribe = (): void => undefined;
    ignoreCommandFailure(boot().then(() => {
      if (!disposed) unsubscribe = api.onAgentEvent(applyEvent);
    }));
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
    document.documentElement.lang = language;
  }, [language]);

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
    const onNavigationMouseUp = (event: MouseEvent): void => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      navigateHistory(event.button === 3 ? -1 : 1);
    };
    window.addEventListener("mouseup", onNavigationMouseUp);
    return () => window.removeEventListener("mouseup", onNavigationMouseUp);
  }, [navigateHistory]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        navigateHistory(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        openSettings();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        const startNewSession = (): void => {
          ignoreCommandFailure(newSession());
        };
        if (armSettingsNavigation(startNewSession)) return;
        closeSettings();
        startNewSession();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")
      ) {
        event.preventDefault();
        const openSessionSearch = (): void => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            window.dispatchEvent(new Event("moros:open-session-search"));
          }));
        };
        if (armSettingsNavigation(openSessionSearch)) return;
        closeSettings();
        openSessionSearch();
        return;
      }
      if (event.key !== "Escape") return;
      if (document.querySelector(
        ".session-search-overlay, .profile-menu, .sidebar-context-menu, .thread-inline-confirmation, .popover, .settings-guard-backdrop",
      )) return;
      if (settingsSection) {
        closeSettings();
        return;
      }
      if (sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armSettingsNavigation, closeSettings, navigateHistory, newSession, openSettings, setSidebarOpen, settingsSection, sidebarOpen]);

  return (
    <div className="app-frame">
      <TitleBar
        canNavigateBack={navigationAvailability.canGoBack}
        canNavigateForward={navigationAvailability.canGoForward}
        onNavigateBack={() => navigateHistory(-1)}
        onNavigateForward={() => navigateHistory(1)}
      />
      <CommandErrorBanner message={lastError} onClose={() => setError(null)} />
      <div className={`app-body${settingsSection ? " settings-open" : ""}`}>
        {settingsSection ? (
          <SettingsWorkspace />
        ) : (
          <>
            {sidebarOpen && (
              <button
                type="button"
                className="mobile-sidebar-scrim"
                aria-label={t("common.close")}
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <Sidebar />
            <main className="main-col">
              {ready && !showConversationThread ? <Hero /> : <Thread />}
              <Composer showQuickPrompts={ready && !showConversationThread} />
            </main>
          </>
        )}
      </div>
      <WorkspaceChangeDialog />
    </div>
  );
}
