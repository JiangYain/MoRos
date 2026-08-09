import { ArrowLeft, Box, PackageCheck, Palette, Puzzle, Search, Settings2, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type TranslationKey, useI18n } from "../i18n";
import { type SettingsSection, useCompass } from "../store";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { DependenciesSettings } from "./settings/DependenciesSettings";
import { GeneralSettings } from "./settings/GeneralSettings";
import { ModelsSettings } from "./settings/ModelsSettings";
import { ProfileSettings } from "./settings/ProfileSettings";
import { SkillsSettings } from "./settings/SkillsSettings";
import { filterSettingsTargets, type SettingsSearchMatch, type SettingsSearchTarget } from "./settings-search";

const NAV_CATEGORIES: Array<{
  titleKey: TranslationKey;
  items: Array<{ id: SettingsSection; icon: typeof Settings2; labelKey: TranslationKey }>;
}> = [
  { titleKey: "settings.category.personal", items: [
    { id: "general", icon: Settings2, labelKey: "settings.nav.general" },
    { id: "profile", icon: UserRound, labelKey: "settings.nav.profile" },
    { id: "appearance", icon: Palette, labelKey: "settings.appearance" },
  ] },
  { titleKey: "settings.category.system", items: [
    { id: "dependencies", icon: PackageCheck, labelKey: "settings.nav.dependencies" },
  ] },
  { titleKey: "settings.category.ai", items: [
    { id: "models", icon: Box, labelKey: "settings.nav.models" },
    { id: "skills", icon: Puzzle, labelKey: "settings.nav.skills" },
  ] },
];

function buildSearchTargets(t: ReturnType<typeof useI18n>["t"]): SettingsSearchTarget[] {
  return [
    { sectionId: "general", targetId: "settings-page-general", title: t("settings.nav.general"), description: t("settings.nav.generalDescription"), keywords: "preferences settings" },
    { sectionId: "appearance", targetId: "settings-page-appearance", title: t("settings.appearance"), description: t("settings.appearanceDescription"), keywords: "appearance settings" },
    { sectionId: "profile", targetId: "settings-page-profile", title: t("settings.nav.profile"), description: t("settings.nav.profileDescription"), keywords: "profile settings" },
    { sectionId: "models", targetId: "settings-page-models", title: t("settings.nav.models"), description: t("settings.nav.modelsDescription"), keywords: "provider model settings" },
    { sectionId: "skills", targetId: "settings-page-skills", title: t("settings.nav.skills"), description: t("settings.nav.skillsDescription"), keywords: "skill settings" },
    { sectionId: "dependencies", targetId: "settings-page-dependencies", title: t("settings.nav.dependencies"), description: t("settings.nav.dependenciesDescription"), keywords: "dependency runtime fitting software driver git bash target connexx compass gps noahlink 驱动 验配软件 依赖" },
    { sectionId: "general", targetId: "settings-language", title: t("language.label"), description: t("language.description"), keywords: "language locale i18n" },
    { sectionId: "general", targetId: "settings-command-explanation-language", title: t("settings.commandExplanationLanguage"), description: t("settings.commandExplanationLanguageDescription"), keywords: "command explanation approval summary language 命令 说明 语言" },
    { sectionId: "general", targetId: "settings-quick-prompts", title: t("settings.quickPrompts"), description: t("settings.quickPromptsDescription", { max: 5 }), keywords: "prompt shortcut" },
    { sectionId: "appearance", targetId: "settings-theme", title: t("settings.colorTheme"), description: t("settings.appearanceDescription"), keywords: "theme light dark system" },
    { sectionId: "profile", targetId: "settings-profile-identity", title: t("settings.profile"), description: t("settings.nav.profileDescription"), keywords: "name username avatar identity" },
    { sectionId: "models", targetId: "settings-providers", title: t("settings.providersKeys"), description: t("settings.nav.modelsDescription"), keywords: "api key provider oauth" },
    { sectionId: "models", targetId: "settings-models-list", title: t("settings.models"), description: t("settings.modelsDescription"), keywords: "model ai llm" },
    { sectionId: "skills", targetId: "settings-skills-list", title: t("settings.nav.skills"), description: t("settings.skillsDescription"), keywords: "skill agent tool" },
    { sectionId: "dependencies", targetId: "settings-dependencies-runtime", title: t("settings.dependenciesCategory.runtime"), description: t("settings.dependenciesCategory.runtimeDescription"), keywords: "git bash runtime shell" },
    { sectionId: "dependencies", targetId: "settings-dependencies-fitting", title: t("settings.dependenciesCategory.fitting"), description: t("settings.dependenciesCategory.fittingDescription"), keywords: "phonak target signia connexx widex compass gps fitting" },
    { sectionId: "dependencies", targetId: "settings-dependencies-driver", title: t("settings.dependenciesCategory.driver"), description: t("settings.dependenciesCategory.driverDescription"), keywords: "himsa noahlink wireless driver" },
  ];
}

function SettingsSectionView({ section }: { section: SettingsSection }): React.JSX.Element {
  switch (section) {
    case "appearance": return <AppearanceSettings />;
    case "profile": return <ProfileSettings />;
    case "models": return <ModelsSettings />;
    case "skills": return <SkillsSettings />;
    case "dependencies": return <DependenciesSettings />;
    default: return <GeneralSettings />;
  }
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
  const results = useMemo(() => filterSettingsTargets(buildSearchTargets(t), search).slice(0, 20), [search, t]);

  const clearHighlight = useCallback((): void => {
    if (highlightTimeoutRef.current !== null) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = null;
    const element = highlightedElementRef.current;
    if (!element) return;
    element.classList.remove("settings-search-target-highlight");
    if (element.dataset.settingsSearchTemporaryTabindex === "true") {
      element.removeAttribute("tabindex");
      delete element.dataset.settingsSearchTemporaryTabindex;
    }
    highlightedElementRef.current = null;
  }, []);

  useEffect(() => {
    if (!pendingTarget || pendingTarget.sectionId !== section) return;
    const element = document.getElementById(pendingTarget.targetId);
    setPendingTarget(null);
    if (!element) return;
    clearHighlight();
    element.classList.add("settings-search-target-highlight");
    highlightedElementRef.current = element;
    element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    const focusable = element.matches("button, input, textarea, select, [tabindex]") ? element : element.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (focusable) focusable.focus({ preventScroll: true });
    else { element.setAttribute("tabindex", "-1"); element.dataset.settingsSearchTemporaryTabindex = "true"; element.focus({ preventScroll: true }); }
    highlightTimeoutRef.current = window.setTimeout(clearHighlight, 1600);
  }, [clearHighlight, pendingTarget, section]);
  useEffect(() => clearHighlight, [clearHighlight]);

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
          <div className="settings-search-results" id="settings-search-results" role="region" aria-label={t("settings.search")} aria-live="polite">
            {results.length === 0 ? (
              <div className="settings-search-empty">{t("settings.searchNoResults")}</div>
            ) : results.map((match) => (
              <button
                type="button"
                key={`${match.sectionId}-${match.targetId}`}
                className="settings-search-result"
                onClick={() => {
                  setPendingTarget(match);
                  openSettings(match.sectionId);
                  setSearch("");
                }}
              >
                <strong>{match.title}</strong>
                <small>{match.description}</small>
              </button>
            ))}
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
      <main className="settings-main"><SettingsSectionView section={section} /></main>
    </div>
  );
}
