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
import type { AppLanguage, RuntimePrerequisites, UiProviderStatus } from "@shared/types";
import { APP_LANGUAGES, DEFAULT_SUMMARY_MODEL, modelSelectionKey } from "@shared/types";
import { MAX_QUICK_PROMPTS } from "@shared/quick-prompts";
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
  Plus,
  Puzzle,
  RotateCw,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../ipc";
import { localeFor, translate, type TranslationKey, useI18n } from "../i18n";
import { type SettingsSection, useCompass } from "../store";
import { type ThemePreference, useThemePreference } from "../theme";
import { CopyButton } from "./CopyButton";
import { ProfileAvatar } from "./ProfileAvatar";
import { prepareProfileImage } from "./profile-image";
import { Toggle } from "./ui/Toggle";
import { filterSettingsTargets, type SettingsSearchMatch, type SettingsSearchTarget } from "./settings-search";
import { isRadioNavigationKey, nextRadioIndex } from "./radio-keyboard";
import { isSettingsDropdownNavigationKey, nextSettingsDropdownIndex } from "./settings-dropdown";
import { MAX_PROFILE_NAME_LENGTH, MAX_PROFILE_HANDLE_LENGTH, normalizeProfileName, normalizeProfileHandle } from "@shared/profile";

const NAV_CATEGORIES: Array<{
  titleKey: TranslationKey;
  items: Array<{
    id: SettingsSection;
    icon: typeof Settings2;
    labelKey: TranslationKey;
  }>;
}> = [
  {
    titleKey: "settings.category.personal",
    items: [
      { id: "general", icon: Settings2, labelKey: "settings.nav.general" },
      { id: "profile", icon: UserRound, labelKey: "settings.nav.profile" },
      { id: "appearance", icon: Palette, labelKey: "settings.appearance" },
    ],
  },
  {
    titleKey: "settings.category.ai",
    items: [
      { id: "models", icon: Box, labelKey: "settings.nav.models" },
      { id: "skills", icon: Puzzle, labelKey: "settings.nav.skills" },
    ],
  },
];

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

function buildSettingsSearchTargets(t: ReturnType<typeof useI18n>["t"]): SettingsSearchTarget[] {
  return [
    // Pages
    { sectionId: "general", targetId: "settings-page-general", title: t("settings.nav.general"), description: t("settings.nav.generalDescription"), keywords: "preferences settings" },
    { sectionId: "appearance", targetId: "settings-page-appearance", title: t("settings.appearance"), description: t("settings.appearanceDescription"), keywords: "appearance settings" },
    { sectionId: "profile", targetId: "settings-page-profile", title: t("settings.nav.profile"), description: t("settings.nav.profileDescription"), keywords: "profile settings" },
    { sectionId: "models", targetId: "settings-page-models", title: t("settings.nav.models"), description: t("settings.nav.modelsDescription"), keywords: "provider model settings" },
    { sectionId: "skills", targetId: "settings-page-skills", title: t("settings.nav.skills"), description: t("settings.nav.skillsDescription"), keywords: "skill settings" },
    // General
    { sectionId: "general", targetId: "settings-language", title: t("language.label"), description: t("language.description"), keywords: "language locale i18n" },
    { sectionId: "general", targetId: "settings-quick-prompts", title: t("settings.quickPrompts"), description: t("settings.quickPromptsDescription", { max: 5 }), keywords: "prompt shortcut" },
    { sectionId: "general", targetId: "settings-runtime", title: t("settings.runtime"), description: t("settings.runtimeDescription"), keywords: "git bash shell" },
    // Appearance
    { sectionId: "appearance", targetId: "settings-theme", title: t("settings.colorTheme"), description: t("settings.appearanceDescription"), keywords: "theme light dark system" },
    // Profile
    { sectionId: "profile", targetId: "settings-profile-identity", title: t("settings.profile"), description: t("settings.nav.profileDescription"), keywords: "name username avatar identity" },
    // Models
    { sectionId: "models", targetId: "settings-providers", title: t("settings.providersKeys"), description: t("settings.nav.modelsDescription"), keywords: "api key provider oauth" },
    { sectionId: "models", targetId: "settings-models-list", title: t("settings.models"), description: t("settings.modelsDescription"), keywords: "model ai llm" },
    // Skills
    { sectionId: "skills", targetId: "settings-skills-list", title: t("settings.nav.skills"), description: t("settings.skillsDescription"), keywords: "skill agent tool" },
  ];
}

function restoreDropdownTrigger(ref: React.RefObject<HTMLButtonElement | null>): void {
  window.requestAnimationFrame(() => ref.current?.focus());
}

function handleDropdownMenuKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  menu: HTMLElement | null,
  closeAndRestoreFocus: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeAndRestoreFocus();
    return;
  }
  if (!isSettingsDropdownNavigationKey(event.key) || !menu) return;
  if (event.target instanceof HTMLInputElement && event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const options = Array.from(menu.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'));
  if (options.length === 0) return;
  event.preventDefault();
  const currentIndex = options.findIndex((option) => option === document.activeElement);
  const nextIndex = nextSettingsDropdownIndex(currentIndex, options.length, event.key);
  options[nextIndex]?.focus();
}

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
        {shell.ok ? <Check size={15} strokeWidth={1.7} /> : t("common.required")}
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

function QuickPromptSettings(): React.JSX.Element {
  const { language, t } = useI18n();
  const configuredPrompts = useCompass((state) => state.settings?.quickPrompts);
  const setQuickPrompts = useCompass((state) => state.setQuickPrompts);
  const localizedDefaults = useMemo(() => [
    translate(language, "hero.prompt1"),
    translate(language, "hero.prompt2"),
    translate(language, "hero.prompt3"),
  ], [language]);
  const savedPrompts = configuredPrompts ?? localizedDefaults;
  const savedKey = JSON.stringify(savedPrompts);
  const [draftPrompts, setDraftPrompts] = useState<string[]>(() => [...savedPrompts]);
  const [saving, setSaving] = useState(false);
  const textareaRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const normalizedPrompts = useMemo(
    () => draftPrompts.map((prompt) => prompt.trim()),
    [draftPrompts],
  );
  const valid = normalizedPrompts.every(Boolean);
  const dirty = valid && JSON.stringify(normalizedPrompts) !== savedKey;
  const canRestoreDefaults = configuredPrompts !== undefined
    || JSON.stringify(draftPrompts) !== JSON.stringify(localizedDefaults);

  useEffect(() => {
    setDraftPrompts([...savedPrompts]);
  }, [savedKey]);

  useLayoutEffect(() => {
    for (const textarea of textareaRefs.current) {
      if (!textarea) continue;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }
  }, [draftPrompts]);

  const updatePrompt = (index: number, value: string): void => {
    setDraftPrompts((current) => current.map((prompt, promptIndex) =>
      promptIndex === index ? value : prompt,
    ));
  };

  const addPrompt = (): void => {
    setDraftPrompts((current) => current.length >= MAX_QUICK_PROMPTS ? current : [...current, ""]);
  };

  const removePrompt = (index: number): void => {
    setDraftPrompts((current) => current.length <= 1
      ? current
      : current.filter((_, promptIndex) => promptIndex !== index));
  };

  const save = async (): Promise<void> => {
    if (!valid || !dirty || saving) return;
    setSaving(true);
    try {
      await setQuickPrompts(normalizedPrompts);
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaults = async (): Promise<void> => {
    if (!canRestoreDefaults || saving) return;
    if (configuredPrompts === undefined) {
      setDraftPrompts([...localizedDefaults]);
      return;
    }
    setSaving(true);
    try {
      await setQuickPrompts(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-section-block">
      <div className="settings-section-title">
        <div>
          <h2>{t("settings.quickPrompts")}</h2>
          <p>{t("settings.quickPromptsDescription", { max: MAX_QUICK_PROMPTS })}</p>
        </div>
        <span className="settings-quick-prompts-count">
          {t("settings.quickPromptsCount", { count: draftPrompts.length, max: MAX_QUICK_PROMPTS })}
        </span>
      </div>
      <div className="settings-card settings-quick-prompts-editor">
        <div className="settings-quick-prompts-list">
          {draftPrompts.map((prompt, index) => (
            <div className="settings-quick-prompt-row" key={index}>
              <span className="settings-quick-prompt-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <textarea
                ref={(element) => { textareaRefs.current[index] = element; }}
                value={prompt}
                rows={2}
                aria-label={t("settings.quickPromptLabel", { index: index + 1 })}
                placeholder={t("settings.quickPromptPlaceholder")}
                onChange={(event) => updatePrompt(index, event.target.value)}
              />
              <button
                type="button"
                className="settings-quick-prompt-remove"
                aria-label={t("settings.removeQuickPrompt", { index: index + 1 })}
                disabled={draftPrompts.length <= 1}
                onClick={() => removePrompt(index)}
              >
                <Trash2 size={14} strokeWidth={1.55} />
              </button>
            </div>
          ))}
        </div>
        <div className="settings-quick-prompts-footer">
          <span className={valid ? "" : "invalid"} aria-live="polite">
            {t(valid ? "settings.quickPromptsHint" : "settings.quickPromptsRequired")}
          </span>
          <div>
            <button
              type="button"
              className="settings-small-btn"
              disabled={!canRestoreDefaults || saving}
              onClick={() => void restoreDefaults()}
            >
              {t("settings.restoreQuickPromptDefaults")}
            </button>
            <button
              type="button"
              className="settings-small-btn"
              disabled={draftPrompts.length >= MAX_QUICK_PROMPTS}
              onClick={addPrompt}
            >
              <Plus size={12} strokeWidth={1.7} />
              {t("settings.addQuickPrompt")}
            </button>
            <button
              type="button"
              className="settings-small-btn primary"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function GeneralSettings(): React.JSX.Element {
  const { language, t } = useI18n();
  const prerequisites = useCompass((state) => state.prerequisites);
  const setLanguage = useCompass((state) => state.setLanguage);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [langQuery, setLangQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);

  const closeDropdownAndRestoreFocus = useCallback(() => {
    setDropdownOpen(false);
    restoreDropdownTrigger(dropdownTriggerRef);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredLanguages = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    return APP_LANGUAGES.filter((option) => {
      const label = t(`language.${option}` as TranslationKey).toLowerCase();
      return !q || label.includes(q);
    });
  }, [langQuery, t]);

  return (
    <div className="settings-page" id="settings-page-general">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.preferences")}</span>
        <h1>{t("settings.general")}</h1>
        <p>{t("settings.generalDescription")}</p>
      </header>

      <section className="settings-section-block" id="settings-language">
        <div className="settings-card settings-language-row">
          <div className="settings-language-copy">
            <strong>{t("language.label")}</strong>
            <span>{t("language.description")}</span>
          </div>
          <div className="settings-language-selector-container" ref={dropdownRef}>
            <button
              ref={dropdownTriggerRef}
              type="button"
              className={`settings-language-dropdown-btn${dropdownOpen ? " open" : ""}`}
              aria-label={t("language.label")}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              aria-controls="settings-language-listbox"
              onClick={() => {
                setDropdownOpen((open) => !open);
                setLangQuery("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                setDropdownOpen(true);
                setLangQuery("");
              }}
            >
              <span>{t(`language.${language}` as TranslationKey)}</span>
              <ChevronDown size={14} strokeWidth={1.55} />
            </button>
            {dropdownOpen && (
              <div
                ref={dropdownMenuRef}
                id="settings-language-listbox"
                className="settings-language-dropdown-menu"
                role="listbox"
                aria-label={t("language.label")}
                onKeyDown={(event) => handleDropdownMenuKeyDown(
                  event,
                  dropdownMenuRef.current,
                  closeDropdownAndRestoreFocus,
                )}
              >
                <div className="settings-language-dropdown-search">
                  <Search size={13} strokeWidth={1.55} />
                  <input
                    type="text"
                    value={langQuery}
                    placeholder={t("common.search")}
                    autoFocus
                    onChange={(event) => setLangQuery(event.target.value)}
                  />
                </div>
                <div className="settings-language-dropdown-list">
                  {filteredLanguages.map((option) => {
                    const selected = language === option;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`settings-language-dropdown-item${selected ? " selected" : ""}`}
                        key={option}
                        onClick={() => {
                          void setLanguage(option);
                          closeDropdownAndRestoreFocus();
                        }}
                      >
                        <span>{t(`language.${option}` as TranslationKey)}</span>
                        {selected && <Check size={13} strokeWidth={1.7} />}
                      </button>
                    );
                  })}
                  {filteredLanguages.length === 0 && (
                    <div className="settings-language-dropdown-empty">
                      {t("settings.searchNoResults")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div id="settings-quick-prompts">
        <QuickPromptSettings />
      </div>

      <section className="settings-section-block" id="settings-runtime">
        <div className="settings-section-title">
          <div><h2>{t("settings.runtime")}</h2><p>{t("settings.runtimeDescription")}</p></div>
        </div>
        <RuntimeCard prerequisites={prerequisites} />
      </section>
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
    <div className="settings-page settings-appearance-page" id="settings-page-appearance">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.preferences")}</span>
        <h1>{t("settings.appearance")}</h1>
        <p>{t("settings.appearanceDescription")}</p>
      </header>

      <section className="settings-section-block appearance-theme-section" id="settings-theme">
        <div className="settings-section-title">
          <div><h2>{t("settings.colorTheme")}</h2></div>
        </div>
        <div
          className="appearance-theme-grid"
          role="radiogroup"
          aria-label={t("settings.colorTheme")}
          onKeyDown={(event) => {
            if (!isRadioNavigationKey(event.key)) return;
            event.preventDefault();
            const currentIndex = THEME_OPTIONS.findIndex((option) => option === theme);
            const nextIndex = nextRadioIndex(currentIndex, THEME_OPTIONS.length, event.key);
            const target = THEME_OPTIONS[nextIndex];
            if (target) {
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
              setTheme(target);
            }
          }}
        >
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
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
  const profileName = useCompass((state) => state.profileName);
  const profileHandle = useCompass((state) => state.profileHandle);
  const setProfileIdentity = useCompass((state) => state.setProfileIdentity);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState(profileName);
  const [handleDraft, setHandleDraft] = useState(profileHandle);
  const enabledSkills = skills.filter((skill) => skill.enabled).length;
  const sessionTokens = (stats?.tokensIn ?? 0) + (stats?.tokensOut ?? 0);
  const permission = settings?.permissionMode;

  useEffect(() => {
    setNameDraft(profileName);
    setHandleDraft(profileHandle);
  }, [profileName, profileHandle]);

  const commitIdentity = (): void => {
    const normalizedName = normalizeProfileName(nameDraft);
    const normalizedHandle = normalizeProfileHandle(handleDraft);
    setNameDraft(normalizedName);
    setHandleDraft(normalizedHandle);
    if (normalizedName !== profileName || normalizedHandle !== profileHandle) {
      setProfileIdentity(normalizedName, normalizedHandle);
    }
  };

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
    <div className="settings-page settings-profile-page" id="settings-page-profile">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.category.personal")}</span>
        <h1>{t("settings.profile")}</h1>
        <p>{t("settings.nav.profileDescription")}</p>
      </header>

      <section className="settings-profile-identity" id="settings-profile-identity" aria-label={t("settings.profileIdentity")}>
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
        <div className="settings-profile-inputs">
          <div className="settings-profile-input">
            <label htmlFor="profile-name-input">{t("settings.profileName")}</label>
            <input
              id="profile-name-input"
              type="text"
              value={nameDraft}
              maxLength={MAX_PROFILE_NAME_LENGTH}
              placeholder={t("settings.profileNamePlaceholder")}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitIdentity}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </div>
          <div className="settings-profile-input">
            <label htmlFor="profile-handle-input">{t("settings.profileHandle")}</label>
            <input
              id="profile-handle-input"
              type="text"
              value={handleDraft}
              maxLength={MAX_PROFILE_HANDLE_LENGTH}
              placeholder={t("settings.profileHandlePlaceholder")}
              onChange={(event) => setHandleDraft(event.target.value)}
              onBlur={commitIdentity}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </div>
        </div>
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
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  const closeEditor = useCallback((): void => {
    setKey("");
    setKeyVisible(false);
    setEditing(false);
    window.requestAnimationFrame(() => triggerButtonRef.current?.focus());
  }, []);

  const save = async (): Promise<void> => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await setApiKey(provider.id, key.trim());
      closeEditor();
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
          ref={triggerButtonRef}
          aria-expanded={editing}
          onClick={() => editing ? closeEditor() : setEditing(true)}
        >
          {editing ? t("common.cancel") : provider.configured ? t("settings.replaceKey") : t("settings.setKey")}
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
              if (event.key === "Enter") {
                event.preventDefault();
                void save();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeEditor();
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

function ModelsSettings(): React.JSX.Element {
  const { language, t } = useI18n();
  const models = useCompass((state) => state.models);
  const providers = useCompass((state) => state.providers);
  const settings = useCompass((state) => state.settings);
  const stats = useCompass((state) => state.stats);
  const setModel = useCompass((state) => state.setModel);
  const setModelEnabled = useCompass((state) => state.setModelEnabled);
  const setSummaryModel = useCompass((state) => state.setSummaryModel);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [providerQuery, setProviderQuery] = useState("");
  const [activeDropdownOpen, setActiveDropdownOpen] = useState(false);
  const [summaryDropdownOpen, setSummaryDropdownOpen] = useState(false);
  const [enabledDropdownOpen, setEnabledDropdownOpen] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [summarySearchQuery, setSummarySearchQuery] = useState("");
  const [enabledSearchQuery, setEnabledSearchQuery] = useState("");
  const activeDropdownRef = useRef<HTMLDivElement>(null);
  const summaryDropdownRef = useRef<HTMLDivElement>(null);
  const enabledDropdownRef = useRef<HTMLDivElement>(null);
  const activeDropdownMenuRef = useRef<HTMLDivElement>(null);
  const summaryDropdownMenuRef = useRef<HTMLDivElement>(null);
  const enabledDropdownMenuRef = useRef<HTMLDivElement>(null);
  const activeDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const summaryDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const enabledDropdownTriggerRef = useRef<HTMLButtonElement>(null);

  const closeActiveDropdownAndRestoreFocus = useCallback(() => {
    setActiveDropdownOpen(false);
    restoreDropdownTrigger(activeDropdownTriggerRef);
  }, []);
  const closeSummaryDropdownAndRestoreFocus = useCallback(() => {
    setSummaryDropdownOpen(false);
    restoreDropdownTrigger(summaryDropdownTriggerRef);
  }, []);
  const closeEnabledDropdownAndRestoreFocus = useCallback(() => {
    setEnabledDropdownOpen(false);
    restoreDropdownTrigger(enabledDropdownTriggerRef);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (activeDropdownRef.current && !activeDropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownOpen(false);
      }
      if (summaryDropdownRef.current && !summaryDropdownRef.current.contains(event.target as Node)) {
        setSummaryDropdownOpen(false);
      }
      if (enabledDropdownRef.current && !enabledDropdownRef.current.contains(event.target as Node)) {
        setEnabledDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const enabled = useMemo(
    () => new Set(settings?.enabledModels ?? []),
    [settings?.enabledModels],
  );

  const activeModel = stats?.model;
  const activeModelKey = activeModel ? modelSelectionKey(activeModel.provider, activeModel.id) : "";

  const summarySelection = settings?.summaryModel ?? DEFAULT_SUMMARY_MODEL;
  const summaryModelKey = modelSelectionKey(summarySelection.provider, summarySelection.id);
  const selectedSummaryModel = models.find(
    (model) => modelSelectionKey(model.provider, model.id) === summaryModelKey,
  );
  const summaryProviderConfigured = providers.some(
    (provider) => provider.id === summarySelection.provider && provider.configured,
  );

  const filteredActiveModels = useMemo(() => {
    const q = activeSearchQuery.trim().toLowerCase();
    return models.filter((model) => {
      const label = `${model.name} ${model.providerName}`.toLowerCase();
      return enabled.has(modelSelectionKey(model.provider, model.id)) && (!q || label.includes(q));
    });
  }, [activeSearchQuery, enabled, models]);

  const groupedActiveModels = useMemo(() => {
    const groups: { [providerName: string]: typeof models } = {};
    for (const model of filteredActiveModels) {
      const providerName = model.providerName;
      if (!groups[providerName]) {
        groups[providerName] = [];
      }
      groups[providerName].push(model);
    }
    return groups;
  }, [filteredActiveModels]);

  const filteredSummaryModels = useMemo(() => {
    const q = summarySearchQuery.trim().toLowerCase();
    return models.filter((model) => {
      const label = `${model.name} ${model.providerName}`.toLowerCase();
      return !q || label.includes(q);
    });
  }, [summarySearchQuery, models]);

  const groupedSummaryModels = useMemo(() => {
    const groups: { [providerName: string]: typeof models } = {};
    for (const model of filteredSummaryModels) {
      const providerName = model.providerName;
      if (!groups[providerName]) {
        groups[providerName] = [];
      }
      groups[providerName].push(model);
    }
    return groups;
  }, [filteredSummaryModels]);

  const filteredEnabledModels = useMemo(() => {
    const q = enabledSearchQuery.trim().toLowerCase();
    return models.filter((model) => {
      const label = `${model.name} ${model.providerName}`.toLowerCase();
      return !q || label.includes(q);
    });
  }, [enabledSearchQuery, models]);

  const groupedEnabledModels = useMemo(() => {
    const groups: { [providerName: string]: typeof models } = {};
    for (const model of filteredEnabledModels) {
      const providerName = model.providerName;
      if (!groups[providerName]) {
        groups[providerName] = [];
      }
      groups[providerName].push(model);
    }
    return groups;
  }, [filteredEnabledModels]);

  const visibleProviders = useMemo(() => {
    const query = providerQuery.trim().toLowerCase();
    return providers.filter((provider) => !query || `${provider.name} ${provider.id}`.toLowerCase().includes(query));
  }, [providerQuery, providers]);

  return (
    <div className="settings-page settings-models-page" id="settings-page-models">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.aiConfiguration")}</span>
        <h1>{t("settings.models")}</h1>
        <p>{t("settings.modelsDescription")}</p>
      </header>

      <div className="settings-card settings-models-card-group" id="settings-models-list">
        <div
          id="settings-providers"
          className={`settings-models-card-row settings-models-card-row-accordion${providersOpen ? " open" : ""}`}
        >
          <button
            type="button"
            className="settings-models-card-row-accordion-toggle"
            aria-expanded={providersOpen}
            aria-controls="settings-providers-content"
            onClick={() => setProvidersOpen((open) => !open)}
          >
            <div className="settings-models-card-row-icon">
              <KeyRound size={14} strokeWidth={1.55} />
            </div>
            <div className="settings-models-card-row-copy">
              <strong>{t("settings.providersKeys")}</strong>
              <span>{t("settings.connectedCount", { count: providers.filter((provider) => provider.configured).length })}</span>
            </div>
            {providersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {providersOpen && (
            <div id="settings-providers-content" className="settings-models-card-row-accordion-content">
              <div className="settings-model-search">
                <Search size={14} strokeWidth={1.55} />
                <input
                  value={providerQuery}
                  placeholder={t("settings.searchProviders")}
                  aria-label={t("settings.searchProviders")}
                  onChange={(event) => setProviderQuery(event.target.value)}
                />
              </div>
              <div className="settings-provider-list">
                {visibleProviders.map((provider) => <ProviderRow provider={provider} key={provider.id} />)}
              </div>
            </div>
          )}
        </div>

        <div className="settings-models-card-row" ref={enabledDropdownRef}>
          <div className="settings-models-card-row-icon">
            <Box size={16} strokeWidth={1.55} />
          </div>
          <div className="settings-models-card-row-copy">
            <strong>{t("settings.enabledModels")}</strong>
            <span>{t("settings.enabledModelsDescription")}</span>
          </div>
          <div className="settings-summary-model-selector">
            <button
              ref={enabledDropdownTriggerRef}
              type="button"
              className={`settings-summary-model-dropdown-btn${enabledDropdownOpen ? " open" : ""}`}
              disabled={models.length === 0}
              aria-label={t("settings.enabledModels")}
              aria-haspopup="listbox"
              aria-expanded={enabledDropdownOpen}
              aria-controls="settings-enabled-models-listbox"
              onClick={() => {
                setEnabledDropdownOpen((open) => !open);
                setEnabledSearchQuery("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                setEnabledDropdownOpen(true);
                setEnabledSearchQuery("");
              }}
            >
              <span>
                {enabled.size > 0
                  ? t("settings.enabledCount", { count: enabled.size })
                  : t("common.notConfigured")}
              </span>
              <ChevronDown size={13} strokeWidth={1.55} />
            </button>
            {enabledDropdownOpen && (
              <div
                ref={enabledDropdownMenuRef}
                className="settings-summary-model-dropdown-menu"
                onKeyDown={(event) => handleDropdownMenuKeyDown(
                  event,
                  enabledDropdownMenuRef.current,
                  closeEnabledDropdownAndRestoreFocus,
                )}
              >
                <div className="settings-summary-model-dropdown-search">
                  <Search size={13} strokeWidth={1.55} />
                  <input
                    type="text"
                    value={enabledSearchQuery}
                    placeholder={t("common.search")}
                    aria-label={`${t("common.search")} ${t("settings.enabledModels")}`}
                    autoFocus
                    onChange={(event) => setEnabledSearchQuery(event.target.value)}
                  />
                </div>
                <div
                  id="settings-enabled-models-listbox"
                  className="settings-summary-model-dropdown-list"
                  role="listbox"
                  aria-label={t("settings.enabledModels")}
                  aria-multiselectable="true"
                >
                  {Object.entries(groupedEnabledModels).map(([providerName, groupModels]) => (
                    <div key={providerName} className="settings-summary-model-dropdown-group">
                      <div className="settings-summary-model-dropdown-group-title">
                        {providerName}
                      </div>
                      {groupModels.map((model) => {
                        const key = modelSelectionKey(model.provider, model.id);
                        const isModelEnabled = enabled.has(key);
                        const isActiveModel = key === activeModelKey;
                        return (
                          <button
                            type="button"
                            role="option"
                            aria-selected={isModelEnabled}
                            aria-disabled={isActiveModel && enabled.size <= 1}
                            className={`settings-summary-model-dropdown-item${isModelEnabled ? " selected" : ""}`}
                            key={key}
                            onClick={() => {
                              void setModelEnabled(model.provider, model.id, !isModelEnabled);
                            }}
                            disabled={isActiveModel && enabled.size <= 1}
                          >
                            <div className="settings-summary-model-item-content">
                              <ModelBrandIcon model={model.id} provider={model.provider} size={13} />
                              <strong>{model.name}</strong>
                            </div>
                            {isModelEnabled && <Check size={13} strokeWidth={1.7} />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {filteredEnabledModels.length === 0 && (
                    <div className="settings-summary-model-dropdown-empty">
                      {t("settings.searchNoResults")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-models-card-row" ref={activeDropdownRef}>
          <div className="settings-models-card-row-icon">
            {activeModel
              ? <ModelBrandIcon model={activeModel.id} provider={activeModel.provider} size={17} />
              : <Box size={16} strokeWidth={1.55} />}
          </div>
          <div className="settings-models-card-row-copy">
            <strong>{t("settings.activeModel")}</strong>
            <span>{t("settings.activeModelDescription")}</span>
          </div>
          <div className="settings-summary-model-selector">
            <button
              ref={activeDropdownTriggerRef}
              type="button"
              className={`settings-summary-model-dropdown-btn${activeDropdownOpen ? " open" : ""}`}
              disabled={models.length === 0}
              aria-label={t("settings.activeModel")}
              aria-haspopup="listbox"
              aria-expanded={activeDropdownOpen}
              aria-controls="settings-active-model-listbox"
              onClick={() => {
                setActiveDropdownOpen((open) => !open);
                setActiveSearchQuery("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                setActiveDropdownOpen(true);
                setActiveSearchQuery("");
              }}
            >
              <span>
                {activeModel
                  ? `${activeModel.name}`
                  : t("composer.selectModel")}
              </span>
              <ChevronDown size={13} strokeWidth={1.55} />
            </button>
            {activeDropdownOpen && (
              <div
                ref={activeDropdownMenuRef}
                className="settings-summary-model-dropdown-menu"
                onKeyDown={(event) => handleDropdownMenuKeyDown(
                  event,
                  activeDropdownMenuRef.current,
                  closeActiveDropdownAndRestoreFocus,
                )}
              >
                <div className="settings-summary-model-dropdown-search">
                  <Search size={13} strokeWidth={1.55} />
                  <input
                    type="text"
                    value={activeSearchQuery}
                    placeholder={t("common.search")}
                    aria-label={`${t("common.search")} ${t("settings.activeModel")}`}
                    autoFocus
                    onChange={(event) => setActiveSearchQuery(event.target.value)}
                  />
                </div>
                <div
                  id="settings-active-model-listbox"
                  className="settings-summary-model-dropdown-list"
                  role="listbox"
                  aria-label={t("settings.activeModel")}
                >
                  {Object.entries(groupedActiveModels).map(([providerName, groupModels]) => (
                      <div key={providerName} className="settings-summary-model-dropdown-group">
                        <div className="settings-summary-model-dropdown-group-title">
                          {providerName}
                        </div>
                        {groupModels.map((model) => {
                          const key = modelSelectionKey(model.provider, model.id);
                          const selected = key === activeModelKey;
                          return (
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`settings-summary-model-dropdown-item${selected ? " selected" : ""}`}
                              key={key}
                              onClick={() => {
                                void setModel(model.provider, model.id);
                                closeActiveDropdownAndRestoreFocus();
                              }}
                            >
                              <div className="settings-summary-model-item-content">
                                <ModelBrandIcon model={model.id} provider={model.provider} size={13} />
                                <strong>{model.name}</strong>
                              </div>
                              {selected && <Check size={13} strokeWidth={1.7} />}
                            </button>
                          );
                        })}
                      </div>
                  ))}
                  {filteredActiveModels.length === 0 && (
                    <div className="settings-summary-model-dropdown-empty">
                      {t("settings.searchNoResults")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="settings-models-card-row" ref={summaryDropdownRef}>
          <div className="settings-models-card-row-icon">
            {selectedSummaryModel
              ? <ModelBrandIcon model={selectedSummaryModel.id} provider={selectedSummaryModel.provider} size={17} />
              : <Sparkles size={16} strokeWidth={1.55} />}
          </div>
          <div className="settings-models-card-row-copy">
            <strong>{t("settings.titleModel")}</strong>
            <span>
              {t("settings.titleModelDescription")}
              {summaryProviderConfigured ? "" : ` · ${t("settings.providerNotConnected")}`}
            </span>
          </div>
          <div className="settings-summary-model-selector">
            <button
              ref={summaryDropdownTriggerRef}
              type="button"
              className={`settings-summary-model-dropdown-btn${summaryDropdownOpen ? " open" : ""}`}
              disabled={models.length === 0}
              aria-label={t("settings.titleModel")}
              aria-haspopup="listbox"
              aria-expanded={summaryDropdownOpen}
              aria-controls="settings-summary-model-listbox"
              onClick={() => {
                setSummaryDropdownOpen((open) => !open);
                setSummarySearchQuery("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                setSummaryDropdownOpen(true);
                setSummarySearchQuery("");
              }}
            >
              <span>
                {selectedSummaryModel
                  ? `${selectedSummaryModel.name}`
                  : `${summarySelection.id}`}
              </span>
              <ChevronDown size={13} strokeWidth={1.55} />
            </button>
            {summaryDropdownOpen && (
              <div
                ref={summaryDropdownMenuRef}
                className="settings-summary-model-dropdown-menu"
                onKeyDown={(event) => handleDropdownMenuKeyDown(
                  event,
                  summaryDropdownMenuRef.current,
                  closeSummaryDropdownAndRestoreFocus,
                )}
              >
                <div className="settings-summary-model-dropdown-search">
                  <Search size={13} strokeWidth={1.55} />
                  <input
                    type="text"
                    value={summarySearchQuery}
                    placeholder={t("common.search")}
                    aria-label={`${t("common.search")} ${t("settings.titleModel")}`}
                    autoFocus
                    onChange={(event) => setSummarySearchQuery(event.target.value)}
                  />
                </div>
                <div
                  id="settings-summary-model-listbox"
                  className="settings-summary-model-dropdown-list"
                  role="listbox"
                  aria-label={t("settings.titleModel")}
                >
                  {Object.entries(groupedSummaryModels).map(([providerName, groupModels]) => {
                    return (
                      <div key={providerName} className="settings-summary-model-dropdown-group">
                        <div className="settings-summary-model-dropdown-group-title">
                          {providerName}
                        </div>
                        {groupModels.map((model) => {
                          const key = modelSelectionKey(model.provider, model.id);
                          const selected = key === summaryModelKey;
                          return (
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`settings-summary-model-dropdown-item${selected ? " selected" : ""}`}
                              key={key}
                              onClick={() => {
                                void setSummaryModel(model.provider, model.id);
                                closeSummaryDropdownAndRestoreFocus();
                              }}
                            >
                              <div className="settings-summary-model-item-content">
                                <ModelBrandIcon model={model.id} provider={model.provider} size={13} />
                                <strong>{model.name}</strong>
                              </div>
                              {selected && <Check size={13} strokeWidth={1.7} />}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {filteredSummaryModels.length === 0 && (
                    <div className="settings-summary-model-dropdown-empty">
                      {t("settings.searchNoResults")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
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
    <div className="settings-page" id="settings-page-skills">
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

      <section className="settings-skill-list" id="settings-skills-list">
        {visible.map((skill) => (
          <div className={`settings-skill-row${skill.enabled ? "" : " disabled"}`} key={skill.name}>
            <div className="settings-skill-icon"><Puzzle size={16} strokeWidth={1.55} /></div>
            <div className="settings-skill-copy">
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
              <small>{skill.source}</small>
            </div>
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
  const [pendingTarget, setPendingTarget] = useState<SettingsSearchMatch | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const highlightedElementRef = useRef<HTMLElement | null>(null);
  const searchTargets = useMemo(() => buildSettingsSearchTargets(t), [t]);
  const searchResults = useMemo(
    () => filterSettingsTargets(searchTargets, search).slice(0, 20),
    [searchTargets, search],
  );

  const clearSearchHighlight = useCallback((): void => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    const highlighted = highlightedElementRef.current;
    if (!highlighted) return;
    highlighted.classList.remove("settings-search-target-highlight");
    if (highlighted.dataset.settingsSearchTemporaryTabindex === "true") {
      highlighted.removeAttribute("tabindex");
      delete highlighted.dataset.settingsSearchTemporaryTabindex;
    }
    highlightedElementRef.current = null;
  }, []);

  useEffect(() => {
    if (!pendingTarget || pendingTarget.sectionId !== section) return;
    const element = document.getElementById(pendingTarget.targetId);
    if (!element) {
      setPendingTarget(null);
      return;
    }

    clearSearchHighlight();
    element.classList.add("settings-search-target-highlight");
    highlightedElementRef.current = element;
    element.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });

    const focusable = element.matches("button, input, textarea, select, [tabindex]")
      ? element as HTMLElement
      : element.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
    if (focusable) {
      focusable.focus({ preventScroll: true });
    } else {
      element.setAttribute("tabindex", "-1");
      element.dataset.settingsSearchTemporaryTabindex = "true";
      element.focus({ preventScroll: true });
    }

    highlightTimeoutRef.current = window.setTimeout(clearSearchHighlight, 1600);
    setPendingTarget(null);
  }, [clearSearchHighlight, pendingTarget, section]);

  useEffect(() => clearSearchHighlight, [clearSearchHighlight]);

  const navigateToTarget = (match: SettingsSearchMatch): void => {
    setPendingTarget(match);
    openSettings(match.sectionId);
    setSearch("");
  };

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
        {search.trim() && (
          <div
            className="settings-search-results"
            id="settings-search-results"
            role="region"
            aria-label={t("settings.search")}
            aria-live="polite"
          >
            {searchResults.length === 0 ? (
              <div className="settings-search-empty">{t("settings.searchNoResults")}</div>
            ) : (
              searchResults.map((match) => (
                <button
                  type="button"
                  key={`${match.sectionId}-${match.targetId}`}
                  className="settings-search-result"
                  onClick={() => navigateToTarget(match)}
                >
                  <strong>{match.title}</strong>
                  <small>{match.description}</small>
                </button>
              ))
            )}
          </div>
        )}
        <nav aria-label={t("settings.navigation")}>
          {NAV_CATEGORIES.map((category) => (
            <div key={category.titleKey} className="settings-nav-category">
              <div className="settings-nav-category-title">{t(category.titleKey)}</div>
              <div className="settings-nav-category-items">
                {category.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      className={section === item.id ? "active" : ""}
                      aria-current={section === item.id ? "page" : undefined}
                      key={item.id}
                      onClick={() => openSettings(item.id)}
                    >
                      <Icon size={15} strokeWidth={1.55} />
                      <span>{t(item.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="settings-main">
        {section === "general" && <GeneralSettings />}
        {section === "appearance" && <AppearanceSettings />}
        {section === "profile" && <ProfileSettings />}
        {section === "models" && <ModelsSettings />}
        {section === "skills" && <SkillsSettings search={search} />}
      </main>
    </div>
  );
}
