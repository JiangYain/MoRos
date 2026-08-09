import type { CommandExplanationLanguage } from "@shared/types";
import { APP_LANGUAGES, COMMAND_EXPLANATION_LANGUAGES } from "@shared/types";
import { MAX_QUICK_PROMPTS } from "@shared/quick-prompts";
import { Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { translate, type TranslationKey, useI18n } from "../../i18n";
import { ignoreCommandFailure, useCompass } from "../../store";
import { isSettingsDropdownNavigationKey, nextSettingsDropdownIndex } from "../settings-dropdown";

function QuickPromptSettings(): React.JSX.Element {
  const { language, t } = useI18n();
  const configuredPrompts = useCompass((state) => state.settings?.quickPrompts);
  const setQuickPrompts = useCompass((state) => state.setQuickPrompts);
  const localizedDefaults = useMemo(() => [translate(language, "hero.prompt1"), translate(language, "hero.prompt2"), translate(language, "hero.prompt3")], [language]);
  const savedPrompts = configuredPrompts ?? localizedDefaults;
  const savedKey = JSON.stringify(savedPrompts);
  const [draftPrompts, setDraftPrompts] = useState<string[]>(() => [...savedPrompts]);
  const [saving, setSaving] = useState(false);
  const textareaRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const normalizedPrompts = useMemo(() => draftPrompts.map((prompt) => prompt.trim()), [draftPrompts]);
  const valid = normalizedPrompts.every(Boolean);
  const dirty = valid && JSON.stringify(normalizedPrompts) !== savedKey;
  const canRestoreDefaults = configuredPrompts !== undefined || JSON.stringify(draftPrompts) !== JSON.stringify(localizedDefaults);

  useEffect(() => setDraftPrompts([...savedPrompts]), [savedKey]);
  useLayoutEffect(() => {
    for (const textarea of textareaRefs.current) {
      if (!textarea) continue;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }
  }, [draftPrompts]);

  const save = async (): Promise<void> => {
    if (!valid || !dirty || saving) return;
    setSaving(true);
    try { await setQuickPrompts(normalizedPrompts); } finally { setSaving(false); }
  };
  const restoreDefaults = async (): Promise<void> => {
    if (!canRestoreDefaults || saving) return;
    if (configuredPrompts === undefined) { setDraftPrompts([...localizedDefaults]); return; }
    setSaving(true);
    try { await setQuickPrompts(null); } finally { setSaving(false); }
  };

  return (
    <section className="settings-section-block">
      <div className="settings-section-title">
        <div><h2>{t("settings.quickPrompts")}</h2><p>{t("settings.quickPromptsDescription", { max: MAX_QUICK_PROMPTS })}</p></div>
        <span className="settings-quick-prompts-count">{t("settings.quickPromptsCount", { count: draftPrompts.length, max: MAX_QUICK_PROMPTS })}</span>
      </div>
      <div className="settings-card settings-quick-prompts-editor">
        <div className="settings-quick-prompts-list">
          {draftPrompts.map((prompt, index) => (
            <div className="settings-quick-prompt-row" key={index}>
              <span className="settings-quick-prompt-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <textarea ref={(element) => { textareaRefs.current[index] = element; }} value={prompt} rows={2} aria-label={t("settings.quickPromptLabel", { index: index + 1 })} placeholder={t("settings.quickPromptPlaceholder")} onChange={(event) => setDraftPrompts((current) => current.map((value, promptIndex) => promptIndex === index ? event.target.value : value))} />
              <button type="button" className="settings-quick-prompt-remove" aria-label={t("settings.removeQuickPrompt", { index: index + 1 })} disabled={draftPrompts.length <= 1} onClick={() => setDraftPrompts((current) => current.length <= 1 ? current : current.filter((_, promptIndex) => promptIndex !== index))}><Trash2 size={14} strokeWidth={1.55} /></button>
            </div>
          ))}
        </div>
        <div className="settings-quick-prompts-footer">
          <span className={valid ? "" : "invalid"} aria-live="polite">{t(valid ? "settings.quickPromptsHint" : "settings.quickPromptsRequired")}</span>
          <div>
            <button type="button" className="settings-small-btn" disabled={!canRestoreDefaults || saving} onClick={() => ignoreCommandFailure(restoreDefaults())}>{t("settings.restoreQuickPromptDefaults")}</button>
            <button type="button" className="settings-small-btn" disabled={draftPrompts.length >= MAX_QUICK_PROMPTS} onClick={() => setDraftPrompts((current) => current.length >= MAX_QUICK_PROMPTS ? current : [...current, ""])}><Plus size={12} strokeWidth={1.7} />{t("settings.addQuickPrompt")}</button>
            <button type="button" className="settings-small-btn primary" disabled={!dirty || saving} onClick={() => ignoreCommandFailure(save())}>{saving ? t("common.saving") : t("common.save")}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

interface LanguageOption<T extends string> { value: T; label: string }

function LanguageDropdown<T extends string>({ label, listboxId, value, options, onSelect }: { label: string; listboxId: string; value: T; options: readonly LanguageOption<T>[]; onSelect(value: T): Promise<void> }): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); window.requestAnimationFrame(() => triggerRef.current?.focus()); }, []);

  useEffect(() => {
    const closeOutside = (event: MouseEvent): void => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return options.filter((option) => !normalizedQuery || option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const navigate = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!isSettingsDropdownNavigationKey(event.key) || !menuRef.current) return;
    if (event.target instanceof HTMLInputElement && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>("[data-settings-dropdown-option]"));
    if (items.length === 0) return;
    event.preventDefault();
    items[nextSettingsDropdownIndex(items.indexOf(document.activeElement as HTMLElement), items.length, event.key)]?.focus();
  };

  return (
    <div className="settings-language-selector-container" ref={rootRef}>
      <button ref={triggerRef} type="button" className={`settings-language-dropdown-btn${open ? " open" : ""}`} aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={listboxId} onClick={() => { setOpen((current) => !current); setQuery(""); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setQuery(""); } }}>
        <span>{options.find((option) => option.value === value)?.label ?? value}</span><ChevronDown size={14} strokeWidth={1.55} />
      </button>
      {open && (
        <div ref={menuRef} id={listboxId} className="settings-language-dropdown-menu" role="dialog" aria-label={label} onKeyDown={navigate}>
          <div className="settings-language-dropdown-search"><Search size={13} strokeWidth={1.55} /><input type="text" value={query} placeholder={t("common.search")} autoFocus onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="settings-language-dropdown-list">
            {filtered.map((option) => <button type="button" data-settings-dropdown-option aria-pressed={value === option.value} className={`settings-language-dropdown-item${value === option.value ? " selected" : ""}`} key={option.value} onClick={() => ignoreCommandFailure(onSelect(option.value).then(close))}><span>{option.label}</span>{value === option.value && <Check size={13} strokeWidth={1.7} />}</button>)}
            {filtered.length === 0 && <div className="settings-language-dropdown-empty">{t("settings.searchNoResults")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function GeneralSettings(): React.JSX.Element {
  const { language, t } = useI18n();
  const commandLanguage = useCompass((state) => state.settings?.commandExplanationLanguage ?? "auto");
  const setLanguage = useCompass((state) => state.setLanguage);
  const setCommandLanguage = useCompass((state) => state.setCommandExplanationLanguage);
  const interfaceOptions = useMemo(() => APP_LANGUAGES.map((option) => ({ value: option, label: t(`language.${option}` as TranslationKey) })), [t]);
  const commandOptions = useMemo(() => COMMAND_EXPLANATION_LANGUAGES.map((option) => ({ value: option, label: option === "auto" ? t("settings.commandExplanationLanguageAuto") : t(`language.${option}` as TranslationKey) })), [t]);
  return (
    <div className="settings-page" id="settings-page-general">
      <header className="settings-page-head"><span className="settings-eyebrow">{t("settings.preferences")}</span><h1>{t("settings.general")}</h1><p>{t("settings.generalDescription")}</p></header>
      <section className="settings-section-block" id="settings-language">
        <div className="settings-card">
          <div className="settings-language-row"><div className="settings-language-copy"><strong>{t("language.label")}</strong><span>{t("language.description")}</span></div><LanguageDropdown label={t("language.label")} listboxId="settings-language-listbox" value={language} options={interfaceOptions} onSelect={setLanguage} /></div>
          <div className="settings-language-row" id="settings-command-explanation-language"><div className="settings-language-copy"><strong>{t("settings.commandExplanationLanguage")}</strong><span>{t("settings.commandExplanationLanguageDescription")}</span></div><LanguageDropdown<CommandExplanationLanguage> label={t("settings.commandExplanationLanguage")} listboxId="settings-command-explanation-language-listbox" value={commandLanguage} options={commandOptions} onSelect={setCommandLanguage} /></div>
        </div>
      </section>
      <div id="settings-quick-prompts"><QuickPromptSettings /></div>
    </div>
  );
}
