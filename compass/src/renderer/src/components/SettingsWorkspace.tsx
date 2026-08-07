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
import type {
  CommandExplanationLanguage,
  DependencyCategory,
  DependencyId,
  DependencyInstallProgress,
  DependencyResource,
  UiProviderStatus,
} from "@shared/types";
import {
  APP_LANGUAGES,
  COMMAND_EXPLANATION_LANGUAGES,
  DEFAULT_SUMMARY_MODEL,
  modelSelectionKey,
} from "@shared/types";
import { MAX_QUICK_PROMPTS } from "@shared/quick-prompts";
import {
  ArrowLeft,
  Box,
  Camera,
  Check,
  CircleAlert,
  CircleCheck,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Palette,
  PackageCheck,
  Plus,
  Puzzle,
  RotateCw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../ipc";
import bashLogo from "../assets/dependency-bash.png";
import gitLogo from "../assets/dependency-git.svg";
import himsaLogo from "../assets/dependency-himsa.png";
import signiaLogo from "../assets/hearing-aid-signia.svg";
import widexLogo from "../assets/hearing-aid-widex.svg";
import phonakTargetAppIcon from "../assets/phonak-target-app.png";
import { translate, type TranslationKey, useI18n } from "../i18n";
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
    titleKey: "settings.category.system",
    items: [
      { id: "dependencies", icon: PackageCheck, labelKey: "settings.nav.dependencies" },
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
    { sectionId: "dependencies", targetId: "settings-page-dependencies", title: t("settings.nav.dependencies"), description: t("settings.nav.dependenciesDescription"), keywords: "dependency runtime fitting software driver git bash target connexx compass gps noahlink 驱动 验配软件 依赖" },
    // General
    { sectionId: "general", targetId: "settings-language", title: t("language.label"), description: t("language.description"), keywords: "language locale i18n" },
    { sectionId: "general", targetId: "settings-command-explanation-language", title: t("settings.commandExplanationLanguage"), description: t("settings.commandExplanationLanguageDescription"), keywords: "command explanation approval summary language 命令 说明 语言" },
    { sectionId: "general", targetId: "settings-quick-prompts", title: t("settings.quickPrompts"), description: t("settings.quickPromptsDescription", { max: 5 }), keywords: "prompt shortcut" },
    // Appearance
    { sectionId: "appearance", targetId: "settings-theme", title: t("settings.colorTheme"), description: t("settings.appearanceDescription"), keywords: "theme light dark system" },
    // Profile
    { sectionId: "profile", targetId: "settings-profile-identity", title: t("settings.profile"), description: t("settings.nav.profileDescription"), keywords: "name username avatar identity" },
    // Models
    { sectionId: "models", targetId: "settings-providers", title: t("settings.providersKeys"), description: t("settings.nav.modelsDescription"), keywords: "api key provider oauth" },
    { sectionId: "models", targetId: "settings-models-list", title: t("settings.models"), description: t("settings.modelsDescription"), keywords: "model ai llm" },
    // Skills
    { sectionId: "skills", targetId: "settings-skills-list", title: t("settings.nav.skills"), description: t("settings.skillsDescription"), keywords: "skill agent tool" },
    // Dependencies
    { sectionId: "dependencies", targetId: "settings-dependencies-runtime", title: t("settings.dependenciesCategory.runtime"), description: t("settings.dependenciesCategory.runtimeDescription"), keywords: "git bash runtime shell" },
    { sectionId: "dependencies", targetId: "settings-dependencies-fitting", title: t("settings.dependenciesCategory.fitting"), description: t("settings.dependenciesCategory.fittingDescription"), keywords: "phonak target signia connexx widex compass gps fitting" },
    { sectionId: "dependencies", targetId: "settings-dependencies-driver", title: t("settings.dependenciesCategory.driver"), description: t("settings.dependenciesCategory.driverDescription"), keywords: "himsa noahlink wireless driver" },
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
  const options = Array.from(menu.querySelectorAll<HTMLElement>(
    '[role="option"]:not([aria-disabled="true"]), [data-settings-dropdown-option]:not([aria-disabled="true"])',
  ));
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

interface SettingsLanguageOption<T extends string> {
  value: T;
  label: string;
}

function SettingsLanguageDropdown<T extends string>({
  label,
  listboxId,
  value,
  options,
  onSelect,
}: {
  label: string;
  listboxId: string;
  value: T;
  options: readonly SettingsLanguageOption<T>[];
  onSelect(value: T): void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return options.filter((option) =>
      !normalizedQuery || option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <div className="settings-language-selector-container" ref={dropdownRef}>
      <button
        ref={dropdownTriggerRef}
        type="button"
        className={`settings-language-dropdown-btn${dropdownOpen ? " open" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={dropdownOpen}
        aria-controls={listboxId}
        onClick={() => {
          setDropdownOpen((open) => !open);
          setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setDropdownOpen(true);
          setQuery("");
        }}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={14} strokeWidth={1.55} />
      </button>
      {dropdownOpen && (
        <div
          ref={dropdownMenuRef}
          id={listboxId}
          className="settings-language-dropdown-menu"
          role="dialog"
          aria-label={label}
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
              value={query}
              placeholder={t("common.search")}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="settings-language-dropdown-list">
            {filteredOptions.map((option) => {
              const selected = value === option.value;
              return (
                <button
                  type="button"
                  data-settings-dropdown-option
                  aria-pressed={selected}
                  className={`settings-language-dropdown-item${selected ? " selected" : ""}`}
                  key={option.value}
                  onClick={() => {
                    onSelect(option.value);
                    closeDropdownAndRestoreFocus();
                  }}
                >
                  <span>{option.label}</span>
                  {selected && <Check size={13} strokeWidth={1.7} />}
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <div className="settings-language-dropdown-empty">
                {t("settings.searchNoResults")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GeneralSettings(): React.JSX.Element {
  const { language, t } = useI18n();
  const commandExplanationLanguage = useCompass(
    (state) => state.settings?.commandExplanationLanguage ?? "auto",
  );
  const setLanguage = useCompass((state) => state.setLanguage);
  const setCommandExplanationLanguage = useCompass(
    (state) => state.setCommandExplanationLanguage,
  );
  const interfaceLanguageOptions = useMemo(
    () => APP_LANGUAGES.map((option) => ({
      value: option,
      label: t(`language.${option}` as TranslationKey),
    })),
    [t],
  );
  const commandExplanationLanguageOptions = useMemo(
    () => COMMAND_EXPLANATION_LANGUAGES.map((option) => ({
      value: option,
      label: option === "auto"
        ? t("settings.commandExplanationLanguageAuto")
        : t(`language.${option}` as TranslationKey),
    })),
    [t],
  );

  return (
    <div className="settings-page" id="settings-page-general">
      <header className="settings-page-head">
        <span className="settings-eyebrow">{t("settings.preferences")}</span>
        <h1>{t("settings.general")}</h1>
        <p>{t("settings.generalDescription")}</p>
      </header>

      <section className="settings-section-block" id="settings-language">
        <div className="settings-card">
          <div className="settings-language-row">
            <div className="settings-language-copy">
              <strong>{t("language.label")}</strong>
              <span>{t("language.description")}</span>
            </div>
            <SettingsLanguageDropdown
              label={t("language.label")}
              listboxId="settings-language-listbox"
              value={language}
              options={interfaceLanguageOptions}
              onSelect={(option) => void setLanguage(option)}
            />
          </div>
          <div className="settings-language-row" id="settings-command-explanation-language">
            <div className="settings-language-copy">
              <strong>{t("settings.commandExplanationLanguage")}</strong>
              <span>{t("settings.commandExplanationLanguageDescription")}</span>
            </div>
            <SettingsLanguageDropdown<CommandExplanationLanguage>
              label={t("settings.commandExplanationLanguage")}
              listboxId="settings-command-explanation-language-listbox"
              value={commandExplanationLanguage}
              options={commandExplanationLanguageOptions}
              onSelect={(option) => void setCommandExplanationLanguage(option)}
            />
          </div>
        </div>
      </section>

      <div id="settings-quick-prompts">
        <QuickPromptSettings />
      </div>
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

function ProfileSettings(): React.JSX.Element {
  const { t } = useI18n();
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
      {provider.configured && (
        <span className="settings-provider-state connected">
          {t("common.connected")}
        </span>
      )}
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

  const configuredProviders = useMemo(
    () => providers.filter((provider) => provider.configured),
    [providers],
  );

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
              <span>{t("settings.connectedCount", { count: configuredProviders.length })}</span>
            </div>
            {configuredProviders.length > 0 && (
              <div className="settings-provider-icon-stack" aria-label={t("settings.connectedProvidersList")}>
                {configuredProviders.slice(0, configuredProviders.length > 6 ? 5 : 6).map((provider) => (
                  <span
                    key={provider.id}
                    className="settings-provider-chip-icon"
                    title={provider.name}
                  >
                    <ProviderBrandIcon provider={provider.id} size={12} />
                  </span>
                ))}
                {configuredProviders.length > 6 && (
                  <span className="settings-provider-chip-more" title={`+${configuredProviders.length - 5}`}>
                    +{configuredProviders.length - 5}
                  </span>
                )}
              </div>
            )}
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
                            tabIndex={-1}
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
                              tabIndex={-1}
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
                              tabIndex={-1}
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

const DEPENDENCY_PRESENTATION: Record<DependencyId, {
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = {
  git: {
    nameKey: "settings.dependency.git.name",
    descriptionKey: "settings.dependency.git.description",
  },
  bash: {
    nameKey: "settings.dependency.bash.name",
    descriptionKey: "settings.dependency.bash.description",
  },
  "phonak-target": {
    nameKey: "settings.dependency.phonakTarget.name",
    descriptionKey: "settings.dependency.phonakTarget.description",
  },
  "signia-connexx": {
    nameKey: "settings.dependency.signiaConnexx.name",
    descriptionKey: "settings.dependency.signiaConnexx.description",
  },
  "widex-compass-gps": {
    nameKey: "settings.dependency.widexCompass.name",
    descriptionKey: "settings.dependency.widexCompass.description",
  },
  "noahlink-wireless-driver": {
    nameKey: "settings.dependency.noahlink.name",
    descriptionKey: "settings.dependency.noahlink.description",
  },
};

const DEPENDENCY_SECTIONS: Array<{
  category: DependencyCategory;
  id: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}> = [
  {
    category: "runtime",
    id: "settings-dependencies-runtime",
    titleKey: "settings.dependenciesCategory.runtime",
    descriptionKey: "settings.dependenciesCategory.runtimeDescription",
  },
  {
    category: "fitting-software",
    id: "settings-dependencies-fitting",
    titleKey: "settings.dependenciesCategory.fitting",
    descriptionKey: "settings.dependenciesCategory.fittingDescription",
  },
  {
    category: "driver",
    id: "settings-dependencies-driver",
    titleKey: "settings.dependenciesCategory.driver",
    descriptionKey: "settings.dependenciesCategory.driverDescription",
  },
];

const ACTIVE_INSTALL_PHASES = new Set<DependencyInstallProgress["phase"]>([
  "queued",
  "downloading",
  "extracting",
  "installing",
  "launching",
]);

function dependencyPhaseKey(phase: DependencyInstallProgress["phase"]): TranslationKey {
  const keys: Record<DependencyInstallProgress["phase"], TranslationKey> = {
    queued: "settings.dependency.phase.queued",
    downloading: "settings.dependency.phase.downloading",
    extracting: "settings.dependency.phase.extracting",
    installing: "settings.dependency.phase.installing",
    launching: "settings.dependency.phase.launching",
    "awaiting-user": "settings.dependency.phase.awaitingUser",
    completed: "settings.dependency.phase.completed",
    failed: "settings.dependency.phase.failed",
    cancelled: "settings.dependency.phase.cancelled",
  };
  return keys[phase];
}

function formatDependencyBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function DependencyArtwork({ dependencyId }: { dependencyId: DependencyId }): React.JSX.Element {
  const sources: Record<DependencyId, { src: string; className?: string }> = {
    git: { src: gitLogo },
    bash: { src: bashLogo, className: "bash" },
    "phonak-target": { src: phonakTargetAppIcon },
    "signia-connexx": { src: signiaLogo, className: "signia" },
    "widex-compass-gps": { src: widexLogo, className: "wide" },
    "noahlink-wireless-driver": { src: himsaLogo, className: "himsa wide" },
  };
  const source = sources[dependencyId];
  return <img className={source.className ?? ""} src={source.src} alt="" />;
}

function DependencyProgress({
  progress,
}: {
  progress: DependencyInstallProgress;
}): React.JSX.Element {
  const { t } = useI18n();
  const percent = typeof progress.progress === "number"
    ? Math.round(progress.progress * 100)
    : undefined;
  return (
    <div className={`settings-dependency-progress phase-${progress.phase}`} aria-live="polite">
      <div className="settings-dependency-progress-copy">
        <span>{t(dependencyPhaseKey(progress.phase))}</span>
        {percent !== undefined && progress.phase === "downloading" && <strong>{percent}%</strong>}
      </div>
      {ACTIVE_INSTALL_PHASES.has(progress.phase) && (
        <div
          className={`settings-dependency-progress-track${percent === undefined ? " indeterminate" : ""}`}
          role="progressbar"
          aria-label={t(dependencyPhaseKey(progress.phase))}
          aria-valuemin={percent === undefined ? undefined : 0}
          aria-valuemax={percent === undefined ? undefined : 100}
          aria-valuenow={percent}
        >
          <span style={percent === undefined ? undefined : { width: `${percent}%` }} />
        </div>
      )}
      {progress.downloadedBytes !== undefined && progress.phase === "downloading" && (
        <small>
          {formatDependencyBytes(progress.downloadedBytes)}
          {progress.totalBytes ? ` / ${formatDependencyBytes(progress.totalBytes)}` : ""}
        </small>
      )}
      {progress.error && <small className="error">{progress.error}</small>}
    </div>
  );
}

function TargetExecutableSelector({
  item,
  onClose,
}: {
  item: DependencyResource;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t } = useI18n();
  const selectDependencyExecutable = useCompass((state) => state.selectDependencyExecutable);
  const resetDependencyExecutable = useCompass((state) => state.resetDependencyExecutable);
  const selection = item.executableSelection;
  const titleId = useId();
  const descriptionId = useId();
  const candidateListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeWithEscape, { capture: true });
    return () => {
      window.removeEventListener("keydown", closeWithEscape, { capture: true });
    };
  }, [onClose]);

  if (!selection) return null;

  const configuredUnavailable = Boolean(selection.configuredPath && !selection.selectedPath);
  const description = configuredUnavailable
    ? t("settings.dependency.targetSelectionUnavailable")
    : selection.multipleDetected
      ? t("settings.dependency.targetMultipleDetected", { count: selection.candidates.length })
      : selection.selectedPath
        ? t("settings.dependency.targetSingleDetected")
        : t("settings.dependency.targetNotDetected");

  return (
    <section
      className={`settings-target-selector${configuredUnavailable ? " unavailable" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="settings-target-selector-head">
        <div>
          <h2 id={titleId}>{t("settings.dependency.targetExecutableLabel")}</h2>
          <span id={descriptionId}>{description}</span>
        </div>
        <button
          type="button"
          className="settings-target-selector-close"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <X size={13} strokeWidth={1.65} aria-hidden="true" />
        </button>
      </div>
      {selection.candidates.length > 0 && (
        <div
          ref={candidateListRef}
          className="settings-target-selector-candidates"
          role="listbox"
          aria-label={t("settings.dependency.targetDetectedVersions")}
          onKeyDown={(event) => handleDropdownMenuKeyDown(
            event,
            candidateListRef.current,
            onClose,
          )}
        >
          {selection.candidates.map((candidate) => {
            const directoryName = candidate.path.split(/[\\/]/).at(-2) ?? "Target.exe";
            const selected = candidate.path === selection.selectedPath;
            return (
              <button
                type="button"
                role="option"
                aria-selected={selected}
                className={`settings-target-selector-option${selected ? " selected" : ""}`}
                title={candidate.path}
                key={candidate.path}
                onClick={() => {
                  void selectDependencyExecutable(item.id, candidate.path);
                  onClose();
                }}
              >
                <span>
                  <strong>{candidate.version ? `Target ${candidate.version}` : directoryName}</strong>
                  <small>{directoryName}</small>
                </span>
                {selected && <Check size={13} strokeWidth={1.8} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="settings-target-selector-actions">
        <button
          type="button"
          onClick={() => {
            onClose();
            void selectDependencyExecutable(item.id);
          }}
        >
          <FolderOpen size={12} strokeWidth={1.65} aria-hidden="true" />
          {t(selection.configuredPath
            ? "settings.dependency.targetChangeExecutable"
            : "settings.dependency.targetChooseExecutable")}
        </button>
        {selection.configuredPath && (
          <button
            type="button"
            className="muted"
            onClick={() => {
              onClose();
              void resetDependencyExecutable(item.id);
            }}
          >
            {t("settings.dependency.targetResetExecutable")}
          </button>
        )}
      </div>
    </section>
  );
}

function DependencyCard({
  item,
  progress,
  confirming,
  onConfirm,
  onCancelConfirm,
  onInstall,
  onCancelInstall,
  onRefresh,
}: {
  item: DependencyResource;
  progress?: DependencyInstallProgress;
  confirming: boolean;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onInstall: () => void;
  onCancelInstall: () => void;
  onRefresh: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [targetSelectorOpen, setTargetSelectorOpen] = useState(false);
  const targetSelectorTriggerRef = useRef<HTMLButtonElement>(null);
  const targetSelectorAreaRef = useRef<HTMLDivElement>(null);
  const presentation = DEPENDENCY_PRESENTATION[item.id];
  const installed = item.availability === "installed" || progress?.phase === "completed";
  const active = progress ? ACTIVE_INSTALL_PHASES.has(progress.phase) : false;
  const unavailable = item.availability === "unsupported";
  const targetSelection = item.id === "phonak-target" ? item.executableSelection : undefined;
  const selectedTargetCandidate = targetSelection?.selectedPath
    ? targetSelection.candidates.find((candidate) => candidate.path === targetSelection.selectedPath)
    : undefined;
  const targetVersion = item.installedVersion
    ?? selectedTargetCandidate?.version
    ?? selectedTargetCandidate?.fileVersion;
  const targetVersionCount = targetSelection
    ? Math.max(targetSelection.candidates.length, installed ? 1 : 0)
    : 0;
  const targetSelectorLabel = targetSelection
    ? installed
      ? targetVersion
        ? t("settings.dependency.version", { version: targetVersion })
        : t("settings.dependency.targetManageVersions")
      : item.recommendedVersion
        ? t("settings.dependency.recommended", { version: item.recommendedVersion })
        : t("settings.dependency.targetChooseExecutable")
    : undefined;
  const statusKey: TranslationKey = unavailable
    ? "settings.dependency.unsupported"
    : installed
      ? "settings.dependency.installed"
      : "settings.dependency.missing";
  const closeTargetSelector = useCallback(() => {
    setTargetSelectorOpen(false);
    window.requestAnimationFrame(() => {
      targetSelectorTriggerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    if (!targetSelectorOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && !targetSelectorAreaRef.current?.contains(target)) {
        setTargetSelectorOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [targetSelectorOpen]);

  return (
    <article className={`settings-dependency-card${installed ? " installed" : ""}${active ? " active" : ""}`}>
      <div className={`settings-dependency-artwork dependency-${item.id}`}>
        <DependencyArtwork dependencyId={item.id} />
      </div>
      <div className="settings-dependency-card-main">
        <div className="settings-dependency-card-title">
          <div>
            <strong>{t(presentation.nameKey)}</strong>
            <span>{item.vendor}</span>
          </div>
          <span className={`settings-dependency-status status-${item.availability}`}>
            {installed
              ? <CircleCheck size={12} strokeWidth={1.8} aria-hidden="true" />
              : <CircleAlert size={12} strokeWidth={1.7} aria-hidden="true" />}
            {t(statusKey)}
          </span>
        </div>
        <p>{t(presentation.descriptionKey)}</p>
        <div
          ref={targetSelection ? targetSelectorAreaRef : undefined}
          className="settings-dependency-meta"
        >
          <span>{targetSelection && installed
            ? t("settings.dependency.targetVersionCount", { count: targetVersionCount })
            : t(item.required ? "settings.dependency.required" : "settings.dependency.optional")}</span>
          {targetSelection && targetSelectorLabel
            ? (
                <div className="settings-target-selector-anchor">
                  <button
                    ref={targetSelectorTriggerRef}
                    type="button"
                    className="settings-dependency-meta-action"
                    aria-haspopup="listbox"
                    aria-expanded={targetSelectorOpen}
                    aria-label={`${targetSelectorLabel} — ${t("settings.dependency.targetOpenSelector")}`}
                    onClick={() => setTargetSelectorOpen((open) => !open)}
                  >
                    {targetSelectorLabel}
                  </button>
                  {targetSelectorOpen && targetSelection && (
                    <TargetExecutableSelector item={item} onClose={closeTargetSelector} />
                  )}
                </div>
              )
            : item.installedVersion
              ? <span>{t("settings.dependency.version", { version: item.installedVersion })}</span>
            : item.recommendedVersion
              ? <span>{t("settings.dependency.recommended", { version: item.recommendedVersion })}</span>
              : null}
        </div>
        {progress && <DependencyProgress progress={progress} />}
        {confirming ? (
          <div className="settings-dependency-confirm">
            <span>{t("settings.dependency.confirmInstall")}</span>
            <div>
              <button type="button" onClick={onCancelConfirm}>{t("common.cancel")}</button>
              <button type="button" className="primary" onClick={onInstall}>{t("settings.dependency.confirm")}</button>
            </div>
          </div>
        ) : (
          <div className="settings-dependency-actions">
            <button
              type="button"
              className="settings-dependency-source"
              title={t("settings.dependency.officialSource")}
              aria-label={`${t("settings.dependency.officialSource")} — ${t(presentation.nameKey)}`}
              onClick={() => void useCompass.getState().openDependencySource(item.id)}
            >
              <ExternalLink size={13} strokeWidth={1.6} aria-hidden="true" />
              <span>{t("settings.dependency.officialSource")}</span>
            </button>
            {active ? (
              <button type="button" className="settings-dependency-install muted" onClick={onCancelInstall}>
                {t("settings.dependency.cancelDownload")}
              </button>
            ) : progress?.phase === "awaiting-user" ? (
              <button type="button" className="settings-dependency-install" onClick={onRefresh}>
                {t("settings.dependenciesRefresh")}
              </button>
            ) : installed && item.installedPath ? (
              <button type="button" className="settings-dependency-install" onClick={() => void api.openPath(item.installedPath!)}>
                {t("settings.dependency.openLocation")}
              </button>
            ) : !unavailable ? (
              <button type="button" className="settings-dependency-install" onClick={onConfirm}>
                <Download size={12} strokeWidth={1.7} aria-hidden="true" />
                {t(progress?.phase === "failed" || progress?.phase === "cancelled"
                  ? "settings.dependency.retry"
                  : installed
                    ? "settings.dependency.reinstall"
                    : "settings.dependency.install")}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

function DependenciesSettings(): React.JSX.Element {
  const { t } = useI18n();
  const dependencies = useCompass((state) => state.dependencies);
  const refreshDependencies = useCompass((state) => state.refreshDependencies);
  const installDependency = useCompass((state) => state.installDependency);
  const cancelDependencyInstall = useCompass((state) => state.cancelDependencyInstall);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingId, setConfirmingId] = useState<DependencyId | null>(null);
  const items = dependencies.items;
  const installs = new Map(dependencies.installs.map((progress) => [progress.dependencyId, progress]));

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    await refreshDependencies();
    setRefreshing(false);
  }, [refreshDependencies]);

  useEffect(() => {
    if (dependencies.checkedAt === 0) void refresh();
  }, [dependencies.checkedAt, refresh]);

  return (
    <div className="settings-page settings-dependencies-page" id="settings-page-dependencies">
      <header className="settings-page-head">
        <div>
          <span className="settings-eyebrow">{t("settings.dependenciesEyebrow")}</span>
          <div className="settings-title-with-refresh">
            <h1>{t("settings.nav.dependencies")}</h1>
            <button
              type="button"
              className="settings-dependencies-refresh-inline-title"
              disabled={refreshing}
              onClick={() => void refresh()}
              title={t("settings.dependenciesRefresh")}
              aria-label={t("settings.dependenciesRefresh")}
            >
              <RotateCw size={15} className={refreshing ? "spin" : ""} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <p>{t("settings.dependenciesDescription")}</p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="settings-dependencies-empty">
          <PackageCheck size={20} strokeWidth={1.5} />
          <span>{t("settings.dependency.noItems")}</span>
        </div>
      ) : DEPENDENCY_SECTIONS.map((section) => {
        const categoryItems = items.filter((item) => item.category === section.category);
        if (categoryItems.length === 0) return null;
        return (
          <section className="settings-dependency-section" id={section.id} key={section.category}>
            <div className="settings-dependency-section-head">
              <div>
                <h2>{t(section.titleKey)}</h2>
                <p>{t(section.descriptionKey)}</p>
              </div>
              <span>{categoryItems.filter((item) => item.availability === "installed").length}/{categoryItems.length}</span>
            </div>
            <div className="settings-dependency-grid">
              {categoryItems.map((item) => (
                <DependencyCard
                  item={item}
                  progress={installs.get(item.id)}
                  confirming={confirmingId === item.id}
                  key={item.id}
                  onConfirm={() => setConfirmingId(item.id)}
                  onCancelConfirm={() => setConfirmingId(null)}
                  onInstall={() => {
                    setConfirmingId(null);
                    void installDependency(item.id);
                  }}
                  onCancelInstall={() => void cancelDependencyInstall(item.id)}
                  onRefresh={() => void refresh()}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type SkillFilter = "all" | "enabled" | "disabled";

function SkillArtwork({ name }: { name: string }): React.JSX.Element {
  return name === "phonak-target-control" ? (
    <img className="settings-skill-artwork-image" src={phonakTargetAppIcon} alt="" />
  ) : (
    <Puzzle size={18} strokeWidth={1.55} aria-hidden="true" />
  );
}

function SkillsSettings(): React.JSX.Element {
  const { t } = useI18n();
  const skills = useCompass((state) => state.skills);
  const settings = useCompass((state) => state.settings);
  const setSkillEnabled = useCompass((state) => state.setSkillEnabled);
  const addSkillDir = useCompass((state) => state.addSkillDir);
  const removeSkillDir = useCompass((state) => state.removeSkillDir);
  const seedComposer = useCompass((state) => state.seedComposer);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const visible = skills.filter((skill) => {
    const matchesQuery = !normalizedQuery
      || `${skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(normalizedQuery);
    const matchesFilter = filter === "all"
      || (filter === "enabled" ? skill.enabled : !skill.enabled);
    return matchesQuery && matchesFilter;
  });
  const filters: Array<{ id: SkillFilter; label: string; count: number }> = [
    { id: "all", label: t("settings.allSkills"), count: skills.length },
    { id: "enabled", label: t("settings.enabledSkills"), count: enabledCount },
    { id: "disabled", label: t("settings.disabledSkills"), count: skills.length - enabledCount },
  ];

  return (
    <div className="settings-page settings-skills-page" id="settings-page-skills">
      <header className="settings-page-head settings-page-head-with-action">
        <div>
          <span className="settings-eyebrow">{t("settings.skillsEyebrow")}</span>
          <h1>{t("settings.nav.skills")}</h1>
          <p>{t("settings.skillsDescription")}</p>
        </div>
        <button type="button" className="settings-small-btn settings-skills-add-button" onClick={() => void addSkillDir()}>
          <Plus size={13} strokeWidth={1.7} aria-hidden="true" />
          <span>{t("settings.addDirectory")}</span>
        </button>
      </header>

      <div className="settings-skills-search">
        <Search size={15} strokeWidth={1.55} aria-hidden="true" />
        <input
          value={query}
          placeholder={t("settings.skillsSearch")}
          aria-label={t("settings.skillsSearch")}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            aria-label={t("settings.clearSkillsSearch")}
            title={t("settings.clearSkillsSearch")}
            onClick={() => setQuery("")}
          >
            <X size={13} strokeWidth={1.7} aria-hidden="true" />
          </button>
        )}
      </div>

      <section className="settings-skills-installed" aria-labelledby="settings-skills-installed-title">
        <div className="settings-skills-section-heading">
          <h2 id="settings-skills-installed-title">{t("settings.installedSkills")}</h2>
          <span>{t("settings.enabledCount", { count: enabledCount })}</span>
        </div>
        <div className="settings-skills-icon-tray">
          {skills.map((skill) => (
            <span
              className={`settings-skills-icon-chip${skill.enabled ? "" : " disabled"}`}
              key={skill.name}
              role="img"
              aria-label={skill.name}
              title={skill.name}
            >
              <SkillArtwork name={skill.name} />
            </span>
          ))}
        </div>
      </section>

      <div className="settings-skills-toolbar">
        <div className="settings-skills-filters" role="group" aria-label={t("settings.skillsFilter")}>
          {filters.map((item) => (
            <button
              type="button"
              className={filter === item.id ? "active" : ""}
              aria-pressed={filter === item.id}
              key={item.id}
              onClick={() => setFilter(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </div>
      </div>

      <section className="settings-skills-catalog" aria-labelledby="settings-skills-catalog-title">
        <div className="settings-skills-section-heading catalog-heading">
          <h2 id="settings-skills-catalog-title">{t("settings.availableSkills")}</h2>
          <span aria-live="polite">{visible.length}</span>
        </div>
        <div className="settings-skill-list" id="settings-skills-list">
        {visible.map((skill) => (
          <article className={`settings-skill-row${skill.enabled ? "" : " disabled"}`} key={skill.name}>
            <div className="settings-skill-icon">
              <SkillArtwork name={skill.name} />
            </div>
            <div className="settings-skill-copy">
              <strong>{skill.name}</strong>
              <span>{skill.description}</span>
              <small>{skill.source}</small>
            </div>
            <div className="settings-skill-state">
              <span>{t(skill.enabled ? "settings.skillEnabled" : "settings.skillDisabled")}</span>
              <Toggle
                ariaLabel={t("settings.skillToggle", { name: skill.name })}
                on={skill.enabled}
                onChange={(next) => void setSkillEnabled(skill.name, next)}
              />
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <div className="settings-empty-state settings-skills-empty">
            <Puzzle size={19} />
            <strong>{t("settings.noSkills")}</strong>
          </div>
        )}
        </div>
      </section>

      {settings && settings.skillDirs.length > 0 && (
        <section className="settings-section-block settings-skills-directories">
          <div className="settings-skills-section-heading">
            <h2>{t("settings.additionalDirectories")}</h2>
            <span>{settings.skillDirs.length}</span>
          </div>
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
        {section === "skills" && <SkillsSettings />}
        {section === "dependencies" && <DependenciesSettings />}
      </main>
    </div>
  );
}
