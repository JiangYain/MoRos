import { useEffect } from "react";
import { Composer } from "./components/Composer";
import { Hero } from "./components/Hero";
import { SettingsWorkspace } from "./components/SettingsWorkspace";
import { Sidebar } from "./components/Sidebar";
import { Thread } from "./components/Thread";
import { TitleBar } from "./components/TitleBar";
import { api, isDesktop } from "./ipc";
import { useCompass } from "./store";

export default function App(): React.JSX.Element {
  const ready = useCompass((s) => s.ready);
  const thread = useCompass((s) => s.thread);
  const boot = useCompass((s) => s.boot);
  const applyEvent = useCompass((s) => s.applyEvent);
  const openSettings = useCompass((s) => s.openSettings);
  const closeSettings = useCompass((s) => s.closeSettings);
  const settingsSection = useCompass((s) => s.settingsSection);
  const sidebarOpen = useCompass((s) => s.sidebarOpen);
  const setSidebarOpen = useCompass((s) => s.setSidebarOpen);

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        openSettings();
        return;
      }
      if (event.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      if (event.key === "Escape" && settingsSection) closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings, openSettings, setSidebarOpen, settingsSection, sidebarOpen]);

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
            <Sidebar />
            <main className="main-col">
              {ready && thread.length === 0 ? <Hero /> : <Thread />}
              <Composer />
            </main>
          </>
        )}
      </div>
    </div>
  );
}
