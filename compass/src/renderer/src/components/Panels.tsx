import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { api } from "../ipc";
import { useCompass } from "../store";

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <button
      className={`toggle${on ? " on" : ""}`}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}

function PanelShell({
  title,
  tagline,
  onClose,
  children,
}: {
  title: string;
  tagline: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <motion.div
        className="panel-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.aside
        className="panel"
        initial={{ x: "104%" }}
        animate={{ x: 0 }}
        exit={{ x: "104%" }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="panel-head">
          <div className="panel-title">
            <span>{tagline}</span>
            {title}
          </div>
          <button className="panel-close" onClick={onClose}>
            关闭 Esc
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </motion.aside>
    </>
  );
}

/* ================================================================ skills */

function SkillsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const skills = useCompass((s) => s.skills);
  const settings = useCompass((s) => s.settings);
  const setSkillEnabled = useCompass((s) => s.setSkillEnabled);
  const addSkillDir = useCompass((s) => s.addSkillDir);
  const removeSkillDir = useCompass((s) => s.removeSkillDir);
  const seedComposer = useCompass((s) => s.seedComposer);

  return (
    <PanelShell title="技能库" tagline="Skills / Agent Capabilities" onClose={onClose}>
      <div className="panel-section">
        <div className="panel-section-head">
          <span className="micro-label">已发现 {skills.length} 项技能</span>
          <button className="hair-btn" onClick={() => void addSkillDir()}>
            + 添加目录
          </button>
        </div>
        {skills.map((skill) => (
          <div key={skill.name} className={`skill-card${skill.enabled ? "" : " off"}`}>
            <div className="row-1">
              <span className="name">{skill.name}</span>
              <Toggle on={skill.enabled} onChange={(next) => void setSkillEnabled(skill.name, next)} />
            </div>
            <div className="desc">{skill.description}</div>
            <div className="foot">
              <span className="src">{skill.source}</span>
              {skill.filePath && (
                <button className="link-btn" onClick={() => void api.openPath(skill.baseDir)}>
                  打开目录
                </button>
              )}
              {skill.enabled && (
                <button
                  className="link-btn"
                  onClick={() => seedComposer(`/skill:${skill.name} `)}
                >
                  插入命令
                </button>
              )}
            </div>
          </div>
        ))}
        {skills.length === 0 && (
          <div className="session-empty" style={{ border: "0.5px solid var(--color-border)" }}>
            未发现技能。将包含 SKILL.md 的目录放入工作目录，或点击「添加目录」。
          </div>
        )}
      </div>

      {settings && settings.skillDirs.length > 0 && (
        <div className="panel-section">
          <span className="micro-label">额外技能目录</span>
          {settings.skillDirs.map((dir) => (
            <div key={dir} className="dir-row">
              <span className="path">{dir}</span>
              <button className="link-btn" onClick={() => void removeSkillDir(dir)}>
                移除
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

/* ============================================================== settings */

function ProviderRow({ id, name, configured, source, sourceLabel, configurationIssue }: {
  id: string;
  name: string;
  configured: boolean;
  source?: string;
  sourceLabel?: string;
  configurationIssue?: string;
}): React.JSX.Element {
  const setApiKey = useCompass((s) => s.setApiKey);
  const removeApiKey = useCompass((s) => s.removeApiKey);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="provider-row">
      <div className="row-1">
        <span className={`p-dot${configured ? " ok" : ""}`} />
        <span className="p-name">{name}</span>
        {(sourceLabel || source) && <span className="p-src">{sourceLabel ?? source}</span>}
        <button className="link-btn" onClick={() => setEditing(!editing)}>
          {configured ? "更换" : "配置"}
        </button>
        {source === "stored" && (
          <button className="link-btn" onClick={() => void removeApiKey(id)}>
            移除
          </button>
        )}
      </div>
      {configurationIssue && <div className="p-issue">{configurationIssue}</div>}
      {editing && (
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

function SettingsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const providers = useCompass((s) => s.providers);
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

      <div className="panel-section">
        <div className="panel-section-head">
          <span className="micro-label">模型提供方 Providers</span>
          <button className="hair-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? "收起" : `全部 ${providers.length}`}
          </button>
        </div>
        {visible.map((provider) => (
          <ProviderRow
            key={provider.id}
            id={provider.id}
            name={provider.name}
            configured={provider.configured}
            source={provider.source}
            sourceLabel={provider.sourceLabel}
            configurationIssue={provider.configurationIssue}
          />
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

/* ================================================================ export */

export function Panels(): React.JSX.Element {
  const panel = useCompass((s) => s.panel);
  const setPanel = useCompass((s) => s.setPanel);
  const close = (): void => setPanel("none");

  return (
    <AnimatePresence>
      {panel === "skills" && <SkillsPanel key="skills" onClose={close} />}
      {panel === "settings" && <SettingsPanel key="settings" onClose={close} />}
    </AnimatePresence>
  );
}
