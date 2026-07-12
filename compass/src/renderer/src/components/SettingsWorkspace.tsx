import AnthropicIcon from "@lobehub/icons/es/Anthropic/components/Mono";
import AntGroupIcon from "@lobehub/icons/es/AntGroup/components/Color";
import AzureAIIcon from "@lobehub/icons/es/AzureAI/components/Color";
import BedrockIcon from "@lobehub/icons/es/Bedrock/components/Color";
import CerebrasIcon from "@lobehub/icons/es/Cerebras/components/Color";
import ClaudeIcon from "@lobehub/icons/es/Claude/components/Color";
import CloudflareIcon from "@lobehub/icons/es/Cloudflare/components/Color";
import CodexIcon from "@lobehub/icons/es/Codex/components/Color";
import DeepSeekIcon from "@lobehub/icons/es/DeepSeek/components/Color";
import FireworksIcon from "@lobehub/icons/es/Fireworks/components/Color";
import GeminiIcon from "@lobehub/icons/es/Gemini/components/Color";
import GithubCopilotIcon from "@lobehub/icons/es/GithubCopilot/components/Mono";
import GrokIcon from "@lobehub/icons/es/Grok/components/Mono";
import GroqIcon from "@lobehub/icons/es/Groq/components/Mono";
import HuggingFaceIcon from "@lobehub/icons/es/HuggingFace/components/Color";
import KimiIcon from "@lobehub/icons/es/Kimi/components/Mono";
import MetaIcon from "@lobehub/icons/es/Meta/components/Color";
import MicrosoftIcon from "@lobehub/icons/es/Microsoft/components/Color";
import MinimaxIcon from "@lobehub/icons/es/Minimax/components/Color";
import MistralIcon from "@lobehub/icons/es/Mistral/components/Color";
import MoonshotIcon from "@lobehub/icons/es/Moonshot/components/Mono";
import NvidiaIcon from "@lobehub/icons/es/Nvidia/components/Color";
import OpenCodeIcon from "@lobehub/icons/es/OpenCode/components/Mono";
import OpenAIIcon from "@lobehub/icons/es/OpenAI/components/Mono";
import OpenRouterIcon from "@lobehub/icons/es/OpenRouter/components/Mono";
import QwenIcon from "@lobehub/icons/es/Qwen/components/Color";
import TogetherIcon from "@lobehub/icons/es/Together/components/Color";
import VercelIcon from "@lobehub/icons/es/Vercel/components/Mono";
import VertexAIIcon from "@lobehub/icons/es/VertexAI/components/Color";
import WorkersAIIcon from "@lobehub/icons/es/WorkersAI/components/Color";
import XAIIcon from "@lobehub/icons/es/XAI/components/Mono";
import XiaomiMiMoIcon from "@lobehub/icons/es/XiaomiMiMo/components/Mono";
import ZAIIcon from "@lobehub/icons/es/ZAI/components/Mono";
import type { RuntimePrerequisites, UiModel, UiProviderStatus } from "@shared/types";
import { DEFAULT_SUMMARY_MODEL, modelSelectionKey } from "@shared/types";
import {
  ArrowLeft,
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Monitor,
  Moon,
  Puzzle,
  RotateCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../ipc";
import { type SettingsSection, useCompass } from "../store";
import { type ThemePreference, useThemePreference } from "../theme";
import { PERMISSION_OPTIONS } from "./permissions";
import { CopyButton } from "./CopyButton";
import { ProfileAvatar } from "./ProfileAvatar";
import { filterAndSortModels } from "./model-list";
import { prepareProfileImage } from "./profile-image";
import { Toggle } from "./ui/Toggle";

const NAV_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  { id: "general", label: "General", description: "Workspace and permissions", icon: Settings2 },
  { id: "profile", label: "Profile", description: "Identity and local activity", icon: UserRound },
  { id: "models", label: "Provider & Model", description: "Provider access and model selection", icon: Box },
  { id: "skills", label: "Skills", description: "Agent capabilities", icon: Puzzle },
];

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  { id: "system", label: "System", description: "跟随操作系统", icon: Monitor },
  { id: "light", label: "Light", description: "高对比浅色", icon: Sun },
  { id: "dark", label: "Dark", description: "低亮度深色", icon: Moon },
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
  if (/kimi/.test(identity)) return <KimiIcon size={size} />;
  if (/mai-|microsoft/.test(identity)) return <MicrosoftIcon size={size} />;
  if (/copilot|github/.test(identity)) return <GithubCopilotIcon size={size} />;
  return <Box size={size - 1} strokeWidth={1.45} />;
}

function ProviderBrandIcon({ provider, size = 18 }: { provider: string; size?: number }): React.JSX.Element {
  const identity = provider.toLowerCase();
  switch (identity) {
    case "amazon-bedrock": return <BedrockIcon size={size} />;
    case "ant-ling": return <AntGroupIcon size={size} />;
    case "anthropic": return <AnthropicIcon size={size} />;
    case "azure-openai-responses": return <AzureAIIcon size={size} />;
    case "cerebras": return <CerebrasIcon size={size} />;
    case "cloudflare-ai-gateway": return <CloudflareIcon size={size} />;
    case "cloudflare-workers-ai": return <WorkersAIIcon size={size} />;
    case "deepseek": return <DeepSeekIcon size={size} />;
    case "fireworks": return <FireworksIcon size={size} />;
    case "github-copilot": return <GithubCopilotIcon size={size} />;
    case "google": return <GeminiIcon size={size} />;
    case "google-vertex": return <VertexAIIcon size={size} />;
    case "groq": return <GroqIcon size={size} />;
    case "huggingface": return <HuggingFaceIcon size={size} />;
    case "kimi-coding": return <KimiIcon size={size} />;
    case "minimax":
    case "minimax-cn": return <MinimaxIcon size={size} />;
    case "mistral": return <MistralIcon size={size} />;
    case "moonshotai":
    case "moonshotai-cn": return <MoonshotIcon size={size} />;
    case "nvidia": return <NvidiaIcon size={size} />;
    case "openai": return <OpenAIIcon size={size} />;
    case "openai-codex": return <CodexIcon size={size} />;
    case "opencode":
    case "opencode-go": return <OpenCodeIcon size={size} />;
    case "openrouter": return <OpenRouterIcon size={size} />;
    case "together": return <TogetherIcon size={size} />;
    case "vercel-ai-gateway": return <VercelIcon size={size} />;
    case "xai": return <XAIIcon size={size} />;
    case "xiaomi":
    case "xiaomi-token-plan-ams":
    case "xiaomi-token-plan-cn":
    case "xiaomi-token-plan-sgp": return <XiaomiMiMoIcon size={size} />;
    case "zai":
    case "zai-coding-cn": return <ZAIIcon size={size} />;
  }
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
  const [theme, setTheme] = useThemePreference();

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <span className="settings-eyebrow">Compass preferences</span>
        <h1>General</h1>
        <p>管理工作区、权限策略与运行环境。</p>
      </header>

      <section className="settings-section-block settings-appearance-block">
        <div className="settings-section-title">
          <div><h2>Appearance</h2><p>选择高对比浅色、深色，或自动跟随系统。</p></div>
        </div>
        <div className="settings-theme-options" role="radiogroup" aria-label="Color theme">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={theme === option.id}
                className={theme === option.id ? "selected" : ""}
                key={option.id}
                onClick={() => setTheme(option.id)}
              >
                <Icon size={15} strokeWidth={1.55} />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
                {theme === option.id && <Check size={14} strokeWidth={1.7} />}
              </button>
            );
          })}
        </div>
      </section>

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

function formatCompactMetric(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 10_000 ? 0 : 1,
    notation: value >= 1_000 ? "compact" : "standard",
  }).format(value);
}

function ProfileSettings(): React.JSX.Element {
  const sessions = useCompass((state) => state.sessions);
  const skills = useCompass((state) => state.skills);
  const stats = useCompass((state) => state.stats);
  const settings = useCompass((state) => state.settings);
  const profileAvatar = useCompass((state) => state.profileAvatar);
  const setProfileAvatar = useCompass((state) => state.setProfileAvatar);
  const setError = useCompass((state) => state.setError);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const enabledSkills = skills.filter((skill) => skill.enabled).length;
  const sessionTokens = (stats?.tokensIn ?? 0) + (stats?.tokensOut ?? 0);
  const permission = PERMISSION_OPTIONS.find((option) => option.id === settings?.permissionMode);

  const metrics = [
    { label: "Local sessions", value: formatCompactMetric(sessions.length) },
    { label: "Session tokens", value: formatCompactMetric(sessionTokens) },
    { label: "Context used", value: stats?.contextPercent === null || stats?.contextPercent === undefined ? "—" : `${Math.round(stats.contextPercent)}%` },
    { label: "Enabled skills", value: formatCompactMetric(enabledSkills) },
  ];

  const uploadAvatar = async (file: File | undefined): Promise<void> => {
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    setError(null);
    try {
      setProfileAvatar(await prepareProfileImage(file));
    } catch (error) {
      setError(error instanceof Error ? error.message : "头像上传失败。");
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  };

  return (
    <div className="settings-page settings-profile-page">
      <header className="settings-profile-head">
        <h1>Profile</h1>
        <span>Local identity</span>
      </header>

      <section className="settings-profile-identity" aria-label="Profile identity">
        <button
          type="button"
          className="settings-profile-avatar-button"
          aria-label="Upload profile photo"
          disabled={avatarBusy}
          onClick={() => avatarInput.current?.click()}
        >
          <ProfileAvatar className="settings-profile-avatar" />
          <span className="settings-profile-avatar-edit" aria-hidden="true">
            <Camera size={15} strokeWidth={1.65} />
          </span>
        </button>
        <input
          ref={avatarInput}
          className="settings-profile-avatar-input"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => void uploadAvatar(event.currentTarget.files?.[0])}
        />
        <h2>ChordJiang</h2>
        <p>@chord_jiang</p>
        <div className="settings-profile-photo-actions">
          <button type="button" onClick={() => avatarInput.current?.click()}>
            {avatarBusy ? "Processing…" : profileAvatar ? "Change photo" : "Add photo"}
          </button>
          {profileAvatar && (
            <button type="button" className="remove" onClick={() => setProfileAvatar(null)}>
              <Trash2 size={12} strokeWidth={1.6} /> Remove
            </button>
          )}
        </div>
      </section>

      <section className="settings-profile-metrics" aria-label="Local activity">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </section>

      <section className="settings-profile-environment">
        <div className="settings-profile-environment-head">
          <h2>Environment</h2>
          <span>Current local configuration</span>
        </div>
        <div className="settings-profile-details">
          <div>
            <strong>Workspace</strong>
            <code>{settings?.workspaceDir || "Not selected"}</code>
          </div>
          <div>
            <strong>Active model</strong>
            <small>{stats?.model?.name ?? "Not configured"}</small>
          </div>
          <div>
            <strong>Permission mode</strong>
            <small>{permission?.label ?? "Not configured"}</small>
          </div>
        </div>
      </section>
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
  const [keyVisible, setKeyVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const loginAttempt = useRef(0);

  const save = async (): Promise<void> => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await setApiKey(provider.id, key.trim());
      setKey("");
      setKeyVisible(false);
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
    <div
      className={`settings-provider-row${provider.configured ? " configured" : ""}`}
      data-provider-id={provider.id}
    >
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
        <button
          type="button"
          className="settings-text-btn"
          onClick={() => setEditing((open) => {
            if (open) setKeyVisible(false);
            return !open;
          })}
        >
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
            type={keyVisible ? "text" : "password"}
            value={key}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={`${provider.name} API key`}
            aria-label={`${provider.name} API key`}
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setKey("");
                setKeyVisible(false);
                setEditing(false);
              }
            }}
          />
          <div className="settings-provider-secret-actions">
            <button
              type="button"
              className="settings-secret-action"
              aria-label={keyVisible ? `Hide ${provider.name} API key` : `Show ${provider.name} API key`}
              aria-pressed={keyVisible}
              disabled={!key}
              onClick={() => setKeyVisible((visible) => !visible)}
            >
              {keyVisible
                ? <EyeOff size={13} strokeWidth={1.65} />
                : <Eye size={13} strokeWidth={1.65} />}
            </button>
            <CopyButton
              className="settings-secret-copy-button"
              label={`Copy ${provider.name} API key`}
              text={key}
            />
          </div>
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
    <div
      className={`settings-model-row${enabled ? " enabled" : ""}${active ? " active" : ""}`}
      data-model-key={key}
    >
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
  const setSummaryModel = useCompass((state) => state.setSummaryModel);
  const [modelQuery, setModelQuery] = useState(search);
  const [providersOpen, setProvidersOpen] = useState(models.length === 0);
  const [providerQuery, setProviderQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const enabled = new Set(settings?.enabledModels ?? []);
  const summarySelection = settings?.summaryModel ?? DEFAULT_SUMMARY_MODEL;
  const summaryModelKey = modelSelectionKey(summarySelection.provider, summarySelection.id);
  const selectedSummaryModel = models.find(
    (model) => modelSelectionKey(model.provider, model.id) === summaryModelKey,
  );
  const summaryProviderConfigured = providers.some(
    (provider) => provider.id === summarySelection.provider && provider.configured,
  );

  const visibleModels = useMemo(() => {
    const query = (modelQuery || search).trim().toLowerCase();
    return filterAndSortModels(models, query);
  }, [modelQuery, models, search]);

  const visibleProviders = useMemo(() => {
    const query = providerQuery.trim().toLowerCase();
    return providers.filter((provider) => !query || `${provider.name} ${provider.id}`.toLowerCase().includes(query));
  }, [providerQuery, providers]);

  const refreshProvidersAndModels = async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    const minimumFeedback = new Promise<void>((resolve) => window.setTimeout(resolve, 420));
    try {
      await Promise.all([boot(), minimumFeedback]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="settings-page settings-models-page">
      <header className="settings-page-head">
        <span className="settings-eyebrow">AI configuration</span>
        <h1>Provider &amp; Model</h1>
        <p>只有启用的模型会出现在对话框的模型选择器中。</p>
      </header>

      <section className={`settings-provider-section${providersOpen ? " open" : ""}`} aria-label="Providers">
        <button type="button" className="settings-provider-toggle" onClick={() => setProvidersOpen((open) => !open)}>
          <span><KeyRound size={15} strokeWidth={1.55} /><strong>Providers &amp; API Keys</strong></span>
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

      <section className="settings-summary-model" aria-label="Conversation title summary model">
        <div className="settings-summary-model-icon">
          {selectedSummaryModel
            ? <ModelBrandIcon model={selectedSummaryModel.id} provider={selectedSummaryModel.provider} size={17} />
            : <Sparkles size={16} strokeWidth={1.55} />}
        </div>
        <div className="settings-summary-model-copy">
          <strong>Conversation title model</strong>
          <span>
            Automatically summarizes the first exchange into a short title
            {summaryProviderConfigured ? "" : " · Provider not connected"}
          </span>
        </div>
        <select
          aria-label="Summary model"
          value={summaryModelKey}
          disabled={models.length === 0}
          onChange={(event) => {
            const model = models.find(
              (candidate) => modelSelectionKey(candidate.provider, candidate.id) === event.target.value,
            );
            if (model) void setSummaryModel(model.provider, model.id);
          }}
        >
          {!selectedSummaryModel && (
            <option value={summaryModelKey}>
              {summarySelection.id} · {summarySelection.provider}
            </option>
          )}
          {models.map((model) => (
            <option value={modelSelectionKey(model.provider, model.id)} key={modelSelectionKey(model.provider, model.id)}>
              {model.name} · {model.providerName}
            </option>
          ))}
        </select>
      </section>

      <section className="settings-model-surface" aria-label="Models">
        <div className="settings-model-search">
          <Search size={14} strokeWidth={1.55} />
          <input
            value={modelQuery}
            placeholder="Search models"
            aria-label="Search models"
            onChange={(event) => setModelQuery(event.target.value)}
          />
          <button
            type="button"
            className={`settings-refresh-button${refreshing ? " refreshing" : ""}`}
            aria-label="Refresh providers and models"
            aria-busy={refreshing}
            disabled={refreshing}
            onClick={() => void refreshProvidersAndModels()}
          >
            <RotateCw size={12} strokeWidth={1.6} />
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
        {section === "profile" && <ProfileSettings />}
        {section === "models" && <ModelsSettings search={search} />}
        {section === "skills" && <SkillsSettings search={search} />}
      </main>
    </div>
  );
}
