import { PanelLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../ipc";
import { useCompass } from "../store";
import { CompassLogo } from "./CompassLogo";

export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false);
  const sidebarOpen = useCompass((state) => state.sidebarOpen);
  const setSidebarOpen = useCompass((state) => state.setSidebarOpen);

  useEffect(() => api.onMaximizeChange(setMaximized), []);

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <CompassLogo size={17} />
        <div className="logo-text">
          Compass<span className="accent">.</span>
        </div>
      </div>
      <button
        type="button"
        className={`sidebar-toggle${sidebarOpen ? " active" : ""}`}
        aria-label={sidebarOpen ? "关闭导航" : "打开导航"}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <PanelLeft size={17} strokeWidth={1.6} />
      </button>
      <div className="titlebar-drag-space" />
      <div className="win-controls">
        <button
          className="win-btn"
          aria-label="最小化"
          onClick={() => api.windowControl("minimize")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="win-btn"
          aria-label="最大化"
          onClick={() => api.windowControl("maximize")}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="0.5"
                y="2.5"
                width="7"
                height="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
              <path d="M 2.5 2.5 v -2 h 7 v 7 h -2" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          )}
        </button>
        <button
          className="win-btn close"
          aria-label="关闭"
          onClick={() => api.windowControl("close")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
