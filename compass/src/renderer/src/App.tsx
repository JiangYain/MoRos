import { useEffect } from "react";
import { Composer } from "./components/Composer";
import { Hero } from "./components/Hero";
import { Panels } from "./components/Panels";
import { Sidebar } from "./components/Sidebar";
import { Thread } from "./components/Thread";
import { TitleBar } from "./components/TitleBar";
import { api } from "./ipc";
import { useCompass } from "./store";

export default function App(): React.JSX.Element {
  const ready = useCompass((s) => s.ready);
  const thread = useCompass((s) => s.thread);
  const boot = useCompass((s) => s.boot);
  const applyEvent = useCompass((s) => s.applyEvent);
  const setPanel = useCompass((s) => s.setPanel);
  const panel = useCompass((s) => s.panel);

  useEffect(() => {
    void boot();
    return api.onAgentEvent(applyEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && panel !== "none") setPanel("none");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, setPanel]);

  return (
    <div className="app-frame">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="main-col">
          {ready && thread.length === 0 ? <Hero /> : <Thread />}
          <Composer />
        </main>
        <Panels />
      </div>
    </div>
  );
}
