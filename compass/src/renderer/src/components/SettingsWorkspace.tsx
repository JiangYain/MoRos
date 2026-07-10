import AnthropicIcon from "@lobehub/icons/es/Anthropic/components/Mono";
import AzureAIIcon from "@lobehub/icons/es/AzureAI/components/Color";
import BedrockIcon from "@lobehub/icons/es/Bedrock/components/Color";
import ClaudeIcon from "@lobehub/icons/es/Claude/components/Color";
import DeepSeekIcon from "@lobehub/icons/es/DeepSeek/components/Color";
import GeminiIcon from "@lobehub/icons/es/Gemini/components/Color";
import GithubCopilotIcon from "@lobehub/icons/es/GithubCopilot/components/Mono";
import GoogleIcon from "@lobehub/icons/es/Google/components/Color";
import GrokIcon from "@lobehub/icons/es/Grok/components/Mono";
import MetaIcon from "@lobehub/icons/es/Meta/components/Color";
import MicrosoftIcon from "@lobehub/icons/es/Microsoft/components/Color";
import MistralIcon from "@lobehub/icons/es/Mistral/components/Color";
import OpenAIIcon from "@lobehub/icons/es/OpenAI/components/Mono";
import QwenIcon from "@lobehub/icons/es/Qwen/components/Color";
import XAIIcon from "@lobehub/icons/es/XAI/components/Mono";
import type { RuntimePrerequisites, UiModel, UiProviderStatus } from "@shared/types";
import { modelSelectionKey } from "@shared/types";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  KeyRound,
  Puzzle,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../ipc";
import { type SettingsSection, useCompass } from "../store";
import { PERMISSION_OPTIONS } from "./permissions";
import { Toggle } from "./ui/Toggle";

const NAV_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  { id: "general", label: "General", description: "Workspace and permissions", icon: Settings2 },
  { id: "models", label: "Models", description: "Models and providers", icon: Box },
  { id: "skills", label: "Skills", description: "Agent capabilities", icon: Puzzle },
];

function ModelBrandIcon({ model, provider, size = 19 }: { model: string; provider: string; size?: number }): React.JSX.Element {
  const identity = `${model} ${provider}`.toLowerCase();
  if (/claude|sonnet|opus|haiku/.test(identity)) return <ClaudeIcon size={size} />;
  if (/gemini|gemma/.test(identity)) return <GeminiIcon size={size} />;
  if (/gpt-|\bgpt\b|openai|\bo[134]-/.test(identity)) return <OpenAIIcon size={size} />;
  if (/deepseek/.test(identity)) return <DeepSeekIcon size={size} />;
  if (/grok|\bxai\b/.test(identity)) return <GrokIcon size={size} />;
  if (/qwen/.test(identity)) return <QwenIcon size={size} />;
  if (/llama|\bmeta\b/.test(identity)) return <MetaIcon size={size} />;
  if (/mistral|mixtral/.test(identity)) return <MistralIcon size={size} />;
  if (/mai-|microsoft/.test(identity)) return <MicrosoftIcon size={size} />;
  if (/copilot|github/.test(identity)) return <GithubCopilotIcon size={size} />;
  return <Box size={size - 1} strokeWidth={1.45} />;
}

function ProviderBrandIcon({ provider, size = 18 }: { provider: string; size?: number }): React.JSX.Element {
  const identity = provider.toLowerCase();
  if (identity.includes("github-copilot")) return <GithubCopilotIcon size={size} />;
  if (identity.includes("anthropic") || identity === "claude") return <AnthropicIcon size={size} />;
  if (identity.includes("gemini")) return <GeminiIcon size={size} />;
  if (identity.includes("google")) return <GoogleIcon size={size} />;
  if (identity.includes("openai")) return <OpenAIIcon size={size} />;
  if (identity.includes("bedrock") || identity.includes("amazon")) return <BedrockIcon size={size} />;
  if (identity.includes("azure")) return <AzureAIIcon size={size} />;
  if (identity.includes("xai")) return <XAIIcon size={size} />;
  if (identity.includes("mistral")) return <MistralIcon size={size} />;
  if (identity.includes("deepseek")) return <DeepSeekIcon size={size} />;
  if (identity.includes("microsoft")) return <MicrosoftIcon size={size} />;
  return <Box size={size - 1} strokeWidth={1.45} />;
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M context`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K context`;
  return tokens > 0 ? `${tokens} context` : "";
}

function RuntimeCard({ prerequisites }: { prerequisites?: RuntimePrerequisites }): React.JSX.Element | null {
  const runPrerequisiteAction = useCompass((state) => state.runPrerequisiteAction);
  const [busy, setBusy] = useState<string | null>(null);
  const shell = prerequisites?.shell;
  if (!shell) return null;

  const run = async (actionId: string): Promise<void> => {
    setBusy(actionId);
    try {
      await runPrerequisiteAction(actionId);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="settings-card settings-runtime-card">
      <div className="settings-row-icon"><Terminal size={16} strokeWidth={1.55} /></div>
      <div className="settings-row-copy">
        <strong>{shell.name}</strong>
        <span>{shell.detail}</span>
        {shell.shellPath && <code>{shell.shellPath}</code>}
      </div>
      <span className={`settings-status${shell.ok ? " ready" : " required"}`}>
        {shell.ok ? "Ready" : "Required"}
      </span>
      {!shell.ok && shell.actions.map((action) => (
        <button
          type="button"
          className="settings-small-btn"
          disabled={busy !== null}
          key={action.id}
          onClick={() => void run(action.id)}
        >
          {busy === action.id ? "Working…" : action.label}
        </button>
      ))}
    </div>
  );
}

function GeneralSettings(): React.JSX.Element {
  const settings = useCompass((state) => state.settings);
  const prerequisites = useCompass((state) => state.prerequisites);
  const version = useCompass((state) => state.version);
  const setPermissionMode = useCompass((state) => state.setPermissionMode);
  const setWorkspaceDir = useCompass((state) => state.setWorkspaceDir);

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <span className="settings-eyebrow">Compass preferences</span>
        <h1>General</h1>
        <p>管理工作区、权限策略与运行环境。</p>
      </header>

      <section className="settings-section-block">
        <div className="settings-section-title">
          <div><h2>Workspace</h2><p>Compass 读取文件和执行任务的默认目录。</p></div>
        </div>
        <div className="settings-card settings-workspace-row">
          <div className="settings-row-icon"><FolderOpen size={16} strokeWidth={1.55} /></div>
          <div className="settings-row-copy">
            <strong>Working directory</strong>
            <code>{settings?.workspaceDir ?? ""}</code>
          </div>
          <button type="button" className="settings-small-btn" onClick={() => void setWorkspaceDir()}>
            Change
          </button>
        </div>
      </section>

      <section className="settings-section-block">
        <div className="settings-section-title">
          <div><h2>Permission mode</h2><p>决定 Compass 何时需要在执行操作前征求确认。</p></div>
        </div>
        <div className="settings-card settings-permission-list">
          {PERMISSION_OPTIONS.map((choice) => {
            const selected = settings?.permissionMode === choice.id;
            return (
              <button
                type="button"
                className={`settings-choice-row${selected ? " selected" : ""}`}
                key={choice.id}
                onClick={() => void setPermissionMode(choice.id)}
              >
                <ShieldCheck size={16} strokeWidth={1.5} />
                <span><strong>{choice.label}</strong><small>{choice.description}</small></span>
                {selected && <Check size={15} strokeWidth={1.7} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section-block">
        <div className="settings-section-title">
          <div><h2>Runtime</h2><p>执行本地 Agent 工作所需的运行环境。</p></div>
        </div>
        <RuntimeCard prerequisites={prerequisites} />
      </section>

      <div className="settings-version">Compass {version || "0.1.0"}</div>
    </div>
  );
}

function ProviderRow({ provider }: { provider: UiProviderStatus }): React.JSX.Element {
  const setApiKey = useCompass((state) => state.setApiKey);
  const loginProvider = useCompass((state) => state.loginProvider);
  const removeApiKey = useCompass((state) => state.removeApiKey);
  const setError = useCompass((state) => state.setError);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const loginAttempt = useRef(0);

  const save = async (): Promise<void> => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await setApiKey(provider.id, key.trim());
      setKey("");
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const login = async (): Promise<void> => {
    const attempt = loginAttempt.current + 1;
    loginAttempt.current = attempt;
    setBusy(true);
    try {
      await loginProvider(provider.id);
    } catch (error) {
      if (loginAttempt.current === attempt) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (loginAttempt.current === attempt) setBusy(false);
    }
  };

  return (
    <div className={`settings-provider-row${provider.configured ? " configured" : ""}`}>
      <ProviderBrandIcon provider={provider.id} size={18} />
      <div className="settings-provider-copy">
        <strong>{provider.name}</strong>
        <span>
          {provider.configurationIssue ??
            (provider.configured
              ? [provider.source, provider.sourceLabel].filter(Boolean).join(" · ") || "Connected"
              : provider.authNote || "Not configured")}
        </span>
      </div>
      <span className={`settings-provider-state${provider.configured ? " connected" : ""}`}>
        {provider.configured ? "Connected" : "Not set"}
      </span>
      {provider.supportsOAuth && (
        <button type="button" className="settings-text-btn" disabled={busy} onClick={() => void login()}>
          {provider.configured ? "Reconnect" : "Sign in"}
        </button>
      )}
      {provider.supportsApiKey && (
        <button type="button" className="settings-text-btn" onClick={() => setEditing((open) => !open)}>
          {provider.configured ? "Replace key" : "Set key"}
        </button>
      )}
      {provider.configured && provider.source === "stored" && (
        <button type="button" className="settings-text-btn muted" onClick={() => void removeApiKey(provider.id)}>
          Remove
        </button>
      )}
      {editing && provider.supportsApiKey && (
        <div className="settings-provider-editor">
          <KeyRound size={14} strokeWidth={1.55} />
          <input
            type="password"
            value={key}
            autoFocus
            placeholder={`${provider.name} API key`}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
          <button type="button" className="settings-small-btn primary" disabled={busy || !key.trim()} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function ModelRow({ model, enabledCount }: { model: UiModel; enabledCount: number }): React.JSX.Element {
  const settings = useCompass((state) => state.settings);
  const stats = useCompass((state) => state.stats);
  const setModel = useCompass((state) => state.setModel);
  const setModelEnabled = useCompass((state) => state.setModelEnabled);
  const key = modelSelectionKey(model.provider, model.id);
  const enabled = settings?.enabledModels?.includes(key) ?? false;
  const active = stats?.model?.provider === model.provider && stats.model.id === model.id;

  return (
    <div className={`settings-model-row${enabled ? " enabled" : ""}${active ? " active" : ""}`}>
      <div className="settings-model-icon">
        <ModelBrandIcon model={model.id} provider={model.provider} size={19} />
      </div>
      <div className="settings-model-copy">
        <strong>{model.name}</strong>
        <span>{model.providerName}{model.contextWindow > 0 ? ` · ${formatContextWindow(model.contextWindow)}` : ""}</span>
      </div>
      {active ? (
        <span className="settings-active-model"><Check size={12} strokeWidth={1.8} /> Active</span>
      ) : enabled ? (
        <button type="button" className="settings-text-btn" onClick={() => void setModel(model.provider, model.id)}>
          Use
        </button>
      ) : null}
      <Toggle
        on={enabled}
        disabled={active && enabledCount <= 1}
        onChange={(next) => void setModelEnabled(model.provider, model.id, next)}
      />
    </div>
  );
}

function ModelsSettings({ search }: { search: string }): React.JSX.Element {
  const models = useCompass((state) => state.models);
  const providers = useCompass((state) => state.providers);
  const settings = useCompass((state) => state.settings);
  const boot = useCompass((state) => state.boot);
  const [modelQuery, setModelQuery] = useState(search);
  const [providersOpen, setProvidersOpen] = useState(models.length === 0);
  const [providerQuery, setProviderQuery] = useState("");
  const enabled = new Set(settings?.enabledModels ?? []);

  const visibleModels = useMemo(() => {
    const query = (modelQuery || search).trim().toLowerCase();
    return [...models]
      .filter((model) => !query || `${model.name} ${model.id} ${model.providerName}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const aEnabled = enabled.has(modelSelectionKey(a.provider, a.id));
        const bEnabled = enabled.has(modelSelectionKey(b.provider, b.id));
        if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [enabled, modelQuery, models, search]);

  const visibleProviders = useMemo(() => {
    const query = providerQuery.trim().toLowerCase();
    return providers.filter((provider) => !query || `${provider.name} ${provider.id}`.toLowerCase().includes(query));
  }, [providerQuery, providers]);

  return (
    <div className="settings-page settings-models-page">
      <header className="settings-page-head">
        <span className="settings-eyebrow">Model library</span>
        <h1>Models</h1>
        <p>只有启用的模型会出现在对话框的模型选择器中。</p>
      </header>

      <section className="settings-model-surface">
        <div className="settings-model-search">
          <Search size={14} strokeWidth={1.55} />
          <input
            value={modelQuery}
            placeholder="Add or search model"
            aria-label="Add or search model"
            onChange={(event) => setModelQuery(event.target.value)}
          />
          <button type="button" aria-label="Refresh models" onClick={() => void boot()}>
            <span>Refresh</span>
          </button>
        </div>
        <div className="settings-model-list">
          {visibleModels.map((model) => (
            <ModelRow
              model={model}
              enabledCount={enabled.size}
              key={modelSelectionKey(model.provider, model.id)}
            />
          ))}
          {visibleModels.length === 0 && (
            <div className="settings-empty-state">
              <Box size={19} strokeWidth={1.45} />
              <strong>No available models</strong>
              <span>配置下方的 Provider 后，可用模型会显示在这里。</span>
            </div>
          )}
        </div>
      </section>

      <section className={`settings-provider-section${providersOpen ? " open" : ""}`}>
        <button type="button" className="settings-provider-toggle" onClick={() => setProvidersOpen((open) => !open)}>
          <span><KeyRound size={15} strokeWidth={1.55} /><strong>Providers & API Keys</strong></span>
          <span>{providers.filter((provider) => provider.configured).length} connected</span>
          {providersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {providersOpen && (
          <div className="settings-provider-content">
            <div className="settings-inline-search">
              <Search size={13} strokeWidth={1.55} />
              <input value={providerQuery} placeholder="Search providers" onChange={(event) => setProviderQuery(event.target.value)} />
            </div>
            <div className="settings-provider-list">
              {visibleProviders.map((provider) => <ProviderRow provider={provider} key={provider.id} />)}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SkillsSettings({ search }: { search: string }): React.JSX.Element {
  const skills = useCompass((state) => state.skills);
  const settings = useCompass((state) => state.settings);
  const setSkillEnabled = useCompass((state) => state.setSkillEnabled);
  const addSkillDir = useCompass((state) => state.addSkillDir);
  const removeSkillDir = useCompass((state) => state.removeSkillDir);
  const seedComposer = useCompass((state) => state.seedComposer);
  const query = search.trim().toLowerCase();
  const visible = skills.filter((skill) => !query || `${skill.name} ${skill.description}`.toLowerCase().includes(query));

  return (
    <div className="settings-page">
      <header className="settings-page-head settings-page-head-with-action">
        <div>
          <span className="settings-eyebrow">Agent capabilities</span>
          <h1>Skills</h1>
          <p>管理 Compass 可以调用的本地技能与额外技能目录。</p>
        </div>
        <button type="button" className="settings-small-btn primary" onClick={() => void addSkillDir()}>
          Add directory
        </button>
      </header>

      <section className="settings-skill-list">
        {visible.map((skill) => (
          <div className={`settings-skill-row${skill.enabled ? "" : " disabled"}`} key={skill.name}>
            <div className="settings-skill-icon"><Puzzle size={16} strokeWidth={1.55} /></div>
            <div className="settings-skill-copy">
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
              <small>{skill.source}</small>
            </div>
            {skill.filePath && (
              <button type="button" className="settings-text-btn" onClick={() => void api.openPath(skill.baseDir)}>
                Open
              </button>
            )}
            {skill.enabled && (
              <button type="button" className="settings-text-btn" onClick={() => seedComposer(`/skill:${skill.name} `)}>
                Insert
              </button>
            )}
            <Toggle on={skill.enabled} onChange={(next) => void setSkillEnabled(skill.name, next)} />
          </div>
        ))}
        {visible.length === 0 && (
          <div className="settings-empty-state"><Puzzle size={19} /><strong>No skills found</strong></div>
        )}
      </section>

      {settings && settings.skillDirs.length > 0 && (
        <section className="settings-section-block">
          <div className="settings-section-title"><div><h2>Additional directories</h2></div></div>
          <div className="settings-directory-list">
            {settings.skillDirs.map((dir) => (
              <div className="settings-directory-row" key={dir}>
                <FolderOpen size={15} strokeWidth={1.55} />
                <code>{dir}</code>
                <button type="button" className="settings-text-btn muted" onClick={() => void removeSkillDir(dir)}>Remove</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function SettingsWorkspace(): React.JSX.Element {
  const section = useCompass((state) => state.settingsSection) ?? "general";
  const openSettings = useCompass((state) => state.openSettings);
  const closeSettings = useCompass((state) => state.closeSettings);
  const [search, setSearch] = useState("");

  return (
    <div className="settings-workspace">
      <aside className="settings-nav">
        <button type="button" className="settings-back" onClick={closeSettings}>
          <ArrowLeft size={15} strokeWidth={1.55} />
          <span>Back</span>
        </button>
        <label className="settings-search">
          <Search size={14} strokeWidth={1.55} />
          <input
            value={search}
            placeholder="Search Settings"
            aria-label="Search Settings"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav aria-label="Settings navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                className={section === item.id ? "active" : ""}
                key={item.id}
                onClick={() => openSettings(item.id)}
              >
                <Icon size={15} strokeWidth={1.55} />
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="settings-main">
        {section === "general" && <GeneralSettings />}
        {section === "models" && <ModelsSettings search={search} />}
        {section === "skills" && <SkillsSettings search={search} />}
      </main>
    </div>
  );
}
