import type { RuntimePrerequisites, UiProviderStatus } from "@shared/types";
import { useRef, useState } from "react";
import { useCompass } from "../../store";
import { PanelShell } from "./PanelShell";

function ProviderRow({ provider }: { provider: UiProviderStatus }): React.JSX.Element {
  const setApiKey = useCompass((s) => s.setApiKey);
  const loginProvider = useCompass((s) => s.loginProvider);
  const removeApiKey = useCompass((s) => s.removeApiKey);
  const setError = useCompass((s) => s.setError);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const loginAttemptRef = useRef(0);

  const { id, name, configured, source, sourceLabel, supportsApiKey, supportsOAuth } = provider;
  const sourceText = [source, sourceLabel].filter(Boolean).join(": ");

  const save = async (): Promise<void> => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await setApiKey(id, key.trim());
      setKey("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const login = async (): Promise<void> => {
    const attempt = loginAttemptRef.current + 1;
    loginAttemptRef.current = attempt;
    setLoginBusy(true);
    try {
      await loginProvider(id);
    } catch (error) {
      if (attempt === loginAttemptRef.current) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (attempt === loginAttemptRef.current) {
        setLoginBusy(false);
      }
    }
  };

  return (
    <div className="provider-row">
      <div className="row-1">
        <span className={`p-dot${configured ? " ok" : ""}`} />
        <span className="p-name">{name}</span>
        {configured && <span className="p-src">{sourceText || "configured"}</span>}
        {supportsOAuth && (
          <button className="link-btn" onClick={() => void login()}>
            {loginBusy ? "重新打开" : configured ? "重新登录" : "OAuth 登录"}
          </button>
        )}
        {supportsApiKey && (
          <button className="link-btn" onClick={() => setEditing(!editing)}>
            {configured ? "更换 Key" : "配置 Key"}
          </button>
        )}
        {configured && source === "stored" && (
          <button className="link-btn" onClick={() => void removeApiKey(id)}>
            {supportsOAuth && !supportsApiKey ? "退出" : "移除"}
          </button>
        )}
      </div>
      {provider.configurationIssue && <div className="p-issue">{provider.configurationIssue}</div>}
      {(provider.envVars.length > 0 || provider.requiredEnv.length > 0 || provider.authNote) && (
        <div className="provider-hints">
          {provider.envVars.length > 0 && (
            <div>
              Env: <span>{provider.envVars.join(" / ")}</span>
            </div>
          )}
          {provider.requiredEnv.length > 0 && (
            <div>
              Required: <span>{provider.requiredEnv.join(" + ")}</span>
            </div>
          )}
          {provider.authNote && <div>{provider.authNote}</div>}
        </div>
      )}
      {editing && supportsApiKey && (
        <div className="key-input-row">
          <input
            type="password"
            placeholder={`${name} API Key`}
            value={key}
            autoFocus
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
          <button className="hair-btn accent" disabled={busy} onClick={() => void save()}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}

function RuntimePrerequisitesSection({
  prerequisites,
}: {
  prerequisites?: RuntimePrerequisites;
}): React.JSX.Element | null {
  const runPrerequisiteAction = useCompass((s) => s.runPrerequisiteAction);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const shell = prerequisites?.shell;
  if (!shell) return null;

  const runAction = async (actionId: string): Promise<void> => {
    setBusyAction(actionId);
    try {
      await runPrerequisiteAction(actionId);
    } finally {
      setBusyAction(null);
    }
  };

  const installCommand = shell.actions.find((action) => action.kind === "shell-command")?.command;

  return (
    <div className="panel-section">
      <div className="panel-section-head">
        <span className="micro-label">运行前置项 Runtime</span>
        <span className={`prereq-state${shell.ok ? " ok" : ""}`}>
          {shell.ok ? "READY" : "REQUIRED"}
        </span>
      </div>
      <div className={`provider-row prerequisite-row${shell.ok ? "" : " warn"}`}>
        <div className="row-1">
          <span className={`p-dot${shell.ok ? " ok" : ""}`} />
          <span className="p-name">{shell.name}</span>
          {shell.shellPath && <span className="p-src">detected</span>}
        </div>
        <div className={shell.ok ? "provider-hints" : "p-issue"}>{shell.detail}</div>
        {shell.shellPath && (
          <div className="provider-hints">
            <div>
              Path: <span>{shell.shellPath}</span>
            </div>
            {shell.shellArgs && shell.shellArgs.length > 0 && (
              <div>
                Args: <span>{shell.shellArgs.join(" ")}</span>
              </div>
            )}
          </div>
        )}
        {!shell.ok && installCommand && (
          <div className="provider-hints">
            <div>
              Command: <span>{installCommand}</span>
            </div>
          </div>
        )}
        <div className="prereq-actions">
          {shell.actions.map((action) => (
            <button
              key={action.id}
              className="hair-btn"
              disabled={busyAction !== null}
              title={action.description}
              onClick={() => void runAction(action.id)}
            >
              {busyAction === action.id ? "处理中" : action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const providers = useCompass((s) => s.providers);
  const prerequisites = useCompass((s) => s.prerequisites);
  const settings = useCompass((s) => s.settings);
  const version = useCompass((s) => s.version);
  const setWorkspaceDir = useCompass((s) => s.setWorkspaceDir);
  const [showAll, setShowAll] = useState(false);

  const configured = providers.filter((provider) => provider.configured);
  const visible = showAll ? providers : providers.slice(0, configured.length > 0 ? Math.max(configured.length, 6) : 8);

  return (
    <PanelShell title="设置" tagline="Settings / Runtime" onClose={onClose}>
      <div className="panel-section">
        <span className="micro-label">工作目录 Workspace</span>
        <div className="dir-row">
          <span className="path">{settings?.workspaceDir ?? ""}</span>
          <button className="link-btn" onClick={() => void setWorkspaceDir()}>
            更改
          </button>
        </div>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.6 }}>
          Agent 的文件与命令均相对该目录执行；目录内含 SKILL.md 的子目录会被自动加载。
        </span>
      </div>

      <RuntimePrerequisitesSection prerequisites={prerequisites} />

      <div className="panel-section">
        <div className="panel-section-head">
          <span className="micro-label">模型提供方 Providers</span>
          <button className="hair-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? "收起" : `全部 ${providers.length}`}
          </button>
        </div>
        {visible.map((provider) => (
          <ProviderRow key={provider.id} provider={provider} />
        ))}
      </div>

      <div className="panel-section">
        <span className="micro-label">关于 About</span>
        <div style={{ fontSize: 11.5, color: "var(--color-text-tertiary)", lineHeight: 1.8 }}>
          Compass v{version} — 基于 Pi Agent Runtime 构建的智能助听器验配助手。
          <br />
          可解释 · 可确认 · 可执行 · 可验证 · 可记录
        </div>
      </div>
    </PanelShell>
  );
}
