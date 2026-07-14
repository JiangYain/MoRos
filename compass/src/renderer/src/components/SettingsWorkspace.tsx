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
import type { AppLanguage, RuntimePrerequisites, UiModel, UiProviderStatus } from "@shared/types";
import { APP_LANGUAGES, DEFAULT_SUMMARY_MODEL, modelSelectionKey } from "@shared/types";
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
  Palette,
  Puzzle,
  RotateCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../ipc";
import { localeFor, type TranslationKey, useI18n } from "../i18n";
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
  icon: typeof Settings2;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  { id: "general", icon: Settings2, labelKey: "settings.nav.general", descriptionKey: "settings.nav.generalDescription" },
  { id: "appearance", icon: Palette, labelKey: "settings.appearance", descriptionKey: "settings.colorTheme" },
  { id: "profile", icon: UserRound, labelKey: "settings.nav.profile", descriptionKey: "settings.nav.profileDescription" },
  { id: "models", icon: Box, labelKey: "settings.nav.models", descriptionKey: "settings.nav.modelsDescription" },
  { id: "skills", icon: Puzzle, labelKey: "settings.nav.skills", descriptionKey: "settings.nav.skillsDescription" },
];

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

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

function formatContextWindow(tokens: number, language: AppLanguage, t: ReturnType<typeof useI18n>["t"]): string {
  const value = tokens >= 1_000_000
    ? `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`
    : tokens >= 1_000 ? `${Math.round(tokens / 1_000)}K` : String(tokens);
  void language;
  return tokens > 0 ? t("settings.context", { value }) : "";
}

function RuntimeCard({ prerequisites }: { prerequisites?: RuntimePrerequisites }): React.JSX.Element | null {
  const { t } = useI18n();
  const runPrerequisiteAction = useCompass((state) => state.runPrerequisiteAction);
  const [busy, setBusy] = useState<string | null>(null);
  const shell = prerequisites?.shell;
  if (!shell) return null;

  const detail = shell.ok
    ? t(shell.detail.includes("settings.json") ? "settings.runtimeConfigured" : "settings.runtimeAvailable")
    : t("settings.runtimeMissing");
  const actionKeys: Record<string, TranslationKey> = {
    "refresh-prerequisites": "settings.runtimeRefresh",
    "install-git-with-winget": "settings.runtimeInstall",
    "open-git-download": "settings.runtimeDownload",
  };

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
        <span>{detail}</span>
        {shell.shellPath && <code>{shell.shellPath}</code>}
      </div>
      <span className={`settings-status${shell.ok ? " ready" : " required"}`}>
        {shell.ok ? t("common.ready") : t("common.required")}
      </span>
      {!shell.ok && shell.actions.map((action) => (
        <button
          type="button"
          className="settings-small-btn"
          disabled={busy !== null}
          key={action.id}
          onClick={() => void run(action.id)}
        >
          {busy === action.id ? t("common.working") : t(actionKeys[action.id] ?? "settings.runtimeRefresh")}
        </button>
      ))}
    </div>
  );
}

function GeneralSettings(): React.JSX.Element {
  const { language, t } = useI18n();
  const settings = useCompass((state) => state.settings);
  const prerequisites = useCompass((state) => state.prerequisites);
  const version = useCompass((state) => state.version);
  const setPermissionMode = useCompass((state) => state.setPermissionMode);
  const setLanguage = useCompass((state) => state.setLanguage);
  const setWorkspaceDir = useCompass((state) => state.setWorkspaceDir);

  return (
    <div className="settings-page">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.preferences")}</span>
        <h1>{t("settings.general")}</h1>
        <p>{t("settings.generalDescription")}</p>
      </header>

      <section className="settings-section-block settings-language-block">
        <div className="settings-section-title">
          <div><h2>{t("language.label")}</h2><p>{t("language.description")}</p></div>
        </div>
        <div className="settings-language-options" role="radiogroup" aria-label={t("language.label")}>
          {APP_LANGUAGES.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={language === option}
              className={language === option ? "selected" : ""}
              key={option}
              lang={option}
              onClick={() => void setLanguage(option)}
            >
              <span>{t(`language.${option}` as TranslationKey)}</span>
              {language === option && <Check size={14} strokeWidth={1.7} />}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section-block">
        <div className="settings-section-title">
          <div><h2>{t("settings.workspace")}</h2><p>{t("settings.workspaceDescription")}</p></div>
        </div>
        <div className="settings-card settings-workspace-row">
          <div className="settings-row-icon"><FolderOpen size={16} strokeWidth={1.55} /></div>
          <div className="settings-row-copy">
            <strong>{t("settings.workingDirectory")}</strong>
            <code>{settings?.workspaceDir ?? ""}</code>
          </div>
          <button type="button" className="settings-small-btn" onClick={() => void setWorkspaceDir()}>
            {t("common.change")}
          </button>
        </div>
      </section>

      <section className="settings-section-block">
        <div className="settings-section-title">
          <div><h2>{t("settings.permissionMode")}</h2><p>{t("settings.permissionDescription")}</p></div>
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
                <span>
                  <strong>{t(`settings.permission.${choice.id}` as TranslationKey)}</strong>
                  <small>{t(`settings.permission.${choice.id}Description` as TranslationKey)}</small>
                </span>
                {selected && <Check size={15} strokeWidth={1.7} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section-block">
        <div className="settings-section-title">
          <div><h2>{t("settings.runtime")}</h2><p>{t("settings.runtimeDescription")}</p></div>
        </div>
        <RuntimeCard prerequisites={prerequisites} />
      </section>

      <div className="settings-version">Compass {version || "0.1.0"}</div>
    </div>
  );
}

function ThemePreviewScene({ tone }: { tone: "light" | "dark" }): React.JSX.Element {
  return (
    <div className={`appearance-preview-scene appearance-preview-scene-${tone}`}>
      <div className="appearance-preview-titlebar"><i /><i /></div>
      <div className="appearance-preview-sidebar">
        <span className="active" />
        <span />
        <span />
      </div>
      <div className="appearance-preview-content">
        <span className="appearance-preview-heading" />
        <span className="appearance-preview-copy wide" />
        <span className="appearance-preview-copy" />
        <span className="appearance-preview-copy short" />
        <div className="appearance-preview-composer"><i /><i /></div>
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: ThemePreference }): React.JSX.Element {
  return (
    <div className={`appearance-theme-preview appearance-theme-preview-${theme}`} aria-hidden="true">
      <ThemePreviewScene tone="light" />
      <ThemePreviewScene tone="dark" />
    </div>
  );
}

function AppearanceSettings(): React.JSX.Element {
  const { t } = useI18n();
  const [theme, setTheme] = useThemePreference();

  return (
    <div className="settings-page settings-appearance-page">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.preferences")}</span>
        <h1>{t("settings.appearance")}</h1>
        <p>{t("settings.appearanceDescription")}</p>
      </header>

      <section className="settings-section-block appearance-theme-section">
        <div className="settings-section-title">
          <div><h2>{t("settings.colorTheme")}</h2></div>
        </div>
        <div className="appearance-theme-grid" role="radiogroup" aria-label={t("settings.colorTheme")}>
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`appearance-theme-card${selected ? " selected" : ""}`}
                key={option}
                onClick={() => setTheme(option)}
              >
                <ThemePreview theme={option} />
                <span className="appearance-theme-card-copy">
                  <span>
                    <strong>{t(`settings.theme.${option}` as TranslationKey)}</strong>
                    <small>{t(`settings.theme.${option}Description` as TranslationKey)}</small>
                  </span>
                  <span className="appearance-theme-check" aria-hidden="true">
                    {selected && <Check size={12} strokeWidth={2} />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function formatCompactMetric(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: value >= 10_000 ? 0 : 1,
    notation: value >= 1_000 ? "compact" : "standard",
  }).format(value);
}

function ProfileSettings(): React.JSX.Element {
  const { language, t } = useI18n();
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
  const permission = settings?.permissionMode;

  const metrics = [
    { label: t("settings.localSessions"), value: formatCompactMetric(sessions.length, language) },
    { label: t("settings.sessionTokens"), value: formatCompactMetric(sessionTokens, language) },
    { label: t("settings.contextUsed"), value: stats?.contextPercent === null || stats?.contextPercent === undefined ? "—" : `${Math.round(stats.contextPercent)}%` },
    { label: t("settings.enabledSkills"), value: formatCompactMetric(enabledSkills, language) },
  ];

  const uploadAvatar = async (file: File | undefined): Promise<void> => {
    if (!file || avatarBusy) return;
    setAvatarBusy(true);
    setError(null);
    try {
      setProfileAvatar(await prepareProfileImage(file, {
        read: t("error.imageRead"),
        type: t("error.imageType"),
        size: t("error.imageSize"),
        dimensions: t("error.imageDimensions"),
        processing: t("error.imageProcessing"),
      }));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("common.unknown"));
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  };

  return (
    <div className="settings-page settings-profile-page">
      <header className="settings-profile-head">
        <h1>{t("settings.profile")}</h1>
        <span>{t("settings.localIdentity")}</span>
      </header>

      <section className="settings-profile-identity" aria-label={t("settings.profileIdentity")}>
        <button
          type="button"
          className="settings-profile-avatar-button"
          aria-label={t("settings.uploadPhoto")}
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
            {avatarBusy ? t("settings.processing") : profileAvatar ? t("settings.changePhoto") : t("settings.addPhoto")}
          </button>
          {profileAvatar && (
            <button type="button" className="remove" onClick={() => setProfileAvatar(null)}>
              <Trash2 size={12} strokeWidth={1.6} /> {t("common.remove")}
            </button>
          )}
        </div>
      </section>

      <section className="settings-profile-metrics" aria-label={t("settings.localActivity")}>
        {metrics.map((metric) => (
          <div key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </section>

      <section className="settings-profile-environment">
        <div className="settings-profile-environment-head">
          <h2>{t("settings.environment")}</h2>
          <span>{t("settings.currentConfiguration")}</span>
        </div>
        <div className="settings-profile-details">
          <div>
            <strong>{t("settings.workspace")}</strong>
            <code>{settings?.workspaceDir || t("common.notSelected")}</code>
          </div>
          <div>
            <strong>{t("settings.activeModel")}</strong>
            <small>{stats?.model?.name ?? t("common.notConfigured")}</small>
          </div>
          <div>
            <strong>{t("settings.permissionMode")}</strong>
            <small>{permission ? t(`settings.permission.${permission}` as TranslationKey) : t("common.notConfigured")}</small>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProviderRow({ provider }: { provider: UiProviderStatus }): React.JSX.Element {
  const { t } = useI18n();
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
              ? [provider.source, provider.sourceLabel].filter(Boolean).join(" · ") || t("common.connected")
              : provider.authNote || t("common.notConfigured"))}
        </span>
      </div>
      <span className={`settings-provider-state${provider.configured ? " connected" : ""}`}>
        {provider.configured ? t("common.connected") : t("common.notSet")}
      </span>
      {provider.supportsOAuth && (
        <button type="button" className="settings-text-btn" disabled={busy} onClick={() => void login()}>
          {provider.configured ? t("settings.reconnect") : t("settings.signIn")}
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
          {provider.configured ? t("settings.replaceKey") : t("settings.setKey")}
        </button>
      )}
      {provider.configured && provider.source === "stored" && (
        <button type="button" className="settings-text-btn muted" onClick={() => void removeApiKey(provider.id)}>
          {t("common.remove")}
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
              aria-label={keyVisible ? t("settings.hideKey", { name: provider.name }) : t("settings.showKey", { name: provider.name })}
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
              label={t("settings.copyKey", { name: provider.name })}
              text={key}
            />
          </div>
          <button type="button" className="settings-small-btn primary" disabled={busy || !key.trim()} onClick={() => void save()}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
}

function ModelRow({ model, enabledCount }: { model: UiModel; enabledCount: number }): React.JSX.Element {
  const { language, t } = useI18n();
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
        <span>{model.providerName}{model.contextWindow > 0 ? ` · ${formatContextWindow(model.contextWindow, language, t)}` : ""}</span>
      </div>
      {active ? (
        <span className="settings-active-model"><Check size={12} strokeWidth={1.8} /> {t("common.active")}</span>
      ) : enabled ? (
        <button type="button" className="settings-text-btn" onClick={() => void setModel(model.provider, model.id)}>
          {t("common.use")}
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
  const { t } = useI18n();
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
        <span className="settings-eyebrow">{t("settings.aiConfiguration")}</span>
        <h1>{t("settings.models")}</h1>
        <p>{t("settings.modelsDescription")}</p>
      </header>

      <section className={`settings-provider-section${providersOpen ? " open" : ""}`} aria-label={t("settings.providersKeys")}>
        <button type="button" className="settings-provider-toggle" onClick={() => setProvidersOpen((open) => !open)}>
          <span><KeyRound size={15} strokeWidth={1.55} /><strong>{t("settings.providersKeys")}</strong></span>
          <span>{t("settings.connectedCount", { count: providers.filter((provider) => provider.configured).length })}</span>
          {providersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {providersOpen && (
          <div className="settings-provider-content">
            <div className="settings-inline-search">
              <Search size={13} strokeWidth={1.55} />
              <input value={providerQuery} placeholder={t("settings.searchProviders")} onChange={(event) => setProviderQuery(event.target.value)} />
            </div>
            <div className="settings-provider-list">
              {visibleProviders.map((provider) => <ProviderRow provider={provider} key={provider.id} />)}
            </div>
          </div>
        )}
      </section>

      <section className="settings-summary-model" aria-label={t("settings.titleModel")}>
        <div className="settings-summary-model-icon">
          {selectedSummaryModel
            ? <ModelBrandIcon model={selectedSummaryModel.id} provider={selectedSummaryModel.provider} size={17} />
            : <Sparkles size={16} strokeWidth={1.55} />}
        </div>
        <div className="settings-summary-model-copy">
          <strong>{t("settings.titleModel")}</strong>
          <span>
            {t("settings.titleModelDescription")}
            {summaryProviderConfigured ? "" : ` · ${t("settings.providerNotConnected")}`}
          </span>
        </div>
        <select
          aria-label={t("settings.summaryModel")}
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

      <section className="settings-model-surface" aria-label={t("settings.models")}>
        <div className="settings-model-search">
          <Search size={14} strokeWidth={1.55} />
          <input
            value={modelQuery}
            placeholder={t("settings.searchModels")}
            aria-label={t("settings.searchModels")}
            onChange={(event) => setModelQuery(event.target.value)}
          />
          <button
            type="button"
            className={`settings-refresh-button${refreshing ? " refreshing" : ""}`}
            aria-label={t("settings.refreshModels")}
            aria-busy={refreshing}
            disabled={refreshing}
            onClick={() => void refreshProvidersAndModels()}
          >
            <RotateCw size={12} strokeWidth={1.6} />
            <span>{t("common.refresh")}</span>
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
              <strong>{t("settings.noModels")}</strong>
              <span>{t("settings.noModelsDescription")}</span>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}

function SkillsSettings({ search }: { search: string }): React.JSX.Element {
  const { t } = useI18n();
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
          <span className="settings-eyebrow">{t("settings.skillsEyebrow")}</span>
          <h1>{t("settings.nav.skills")}</h1>
          <p>{t("settings.skillsDescription")}</p>
        </div>
        <button type="button" className="settings-small-btn primary" onClick={() => void addSkillDir()}>
          {t("settings.addDirectory")}
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
                {t("common.open")}
              </button>
            )}
            {skill.enabled && (
              <button type="button" className="settings-text-btn" onClick={() => seedComposer(`/skill:${skill.name} `)}>
                {t("common.insert")}
              </button>
            )}
            <Toggle on={skill.enabled} onChange={(next) => void setSkillEnabled(skill.name, next)} />
          </div>
        ))}
        {visible.length === 0 && (
          <div className="settings-empty-state"><Puzzle size={19} /><strong>{t("settings.noSkills")}</strong></div>
        )}
      </section>

      {settings && settings.skillDirs.length > 0 && (
        <section className="settings-section-block">
          <div className="settings-section-title"><div><h2>{t("settings.additionalDirectories")}</h2></div></div>
          <div className="settings-directory-list">
            {settings.skillDirs.map((dir) => (
              <div className="settings-directory-row" key={dir}>
                <FolderOpen size={15} strokeWidth={1.55} />
                <code>{dir}</code>
                <button type="button" className="settings-text-btn muted" onClick={() => void removeSkillDir(dir)}>{t("common.remove")}</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function SettingsWorkspace(): React.JSX.Element {
  const { t } = useI18n();
  const section = useCompass((state) => state.settingsSection) ?? "general";
  const openSettings = useCompass((state) => state.openSettings);
  const closeSettings = useCompass((state) => state.closeSettings);
  const [search, setSearch] = useState("");

  return (
    <div className="settings-workspace">
      <aside className="settings-nav">
        <button type="button" className="settings-back" onClick={closeSettings}>
          <ArrowLeft size={15} strokeWidth={1.55} />
          <span>{t("common.back")}</span>
        </button>
        <label className="settings-search">
          <Search size={14} strokeWidth={1.55} />
          <input
            value={search}
            placeholder={t("settings.search")}
            aria-label={t("settings.search")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav aria-label={t("settings.navigation")}>
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
                <span>
                  <strong>{t(item.labelKey)}</strong>
                  <small>{t(item.descriptionKey)}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="settings-main">
        {section === "general" && <GeneralSettings />}
        {section === "appearance" && <AppearanceSettings />}
        {section === "profile" && <ProfileSettings />}
        {section === "models" && <ModelsSettings search={search} />}
        {section === "skills" && <SkillsSettings search={search} />}
      </main>
    </div>
  );
}
