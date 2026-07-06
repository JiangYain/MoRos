import { useEffect, useState } from "react";
import { api } from "../ipc";
import { useCompass } from "../store";
import { CompassLogo } from "./CompassLogo";

export function TitleBar(): React.JSX.Element {
  const streaming = useCompass((s) => s.streaming);
  const stats = useCompass((s) => s.stats);
  const skills = useCompass((s) => s.skills);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => api.onMaximizeChange(setMaximized), []);

  const enabledSkills = skills.filter((skill) => skill.enabled).length;

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <CompassLogo size={19} />
        <div className="logo-text">
          Compass<span className="accent">.</span>
        </div>
      </div>
      <div className="titlebar-meta">
        <span className="titlebar-state">
          <span className={`state-dot${streaming ? " running" : ""}`} />
          {streaming ? "Running" : "Ready"}
        </span>
        <span>
          Engine：<b>Pi Agent Runtime</b>
        </span>
        <span>
          Skills：<b>{enabledSkills}</b>
        </span>
        {stats?.model ? (
          <span>
            Model：<b>{stats.model.name}</b>
            {!stats.modelAuthConfigured && (
              <b style={{ color: "var(--color-accent)" }}>（未配置密钥）</b>
            )}
          </span>
        ) : (
          <span>
            Model：<b>未配置</b>
          </span>
        )}
      </div>
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
