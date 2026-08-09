import { Check } from "lucide-react";
import { type TranslationKey, useI18n } from "../../i18n";
import { type ThemePreference, useThemePreference } from "../../theme";
import { isRadioNavigationKey, nextRadioIndex } from "../radio-keyboard";

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

function ThemePreviewScene({ tone }: { tone: "light" | "dark" }): React.JSX.Element {
  return (
    <div className={`appearance-preview-scene appearance-preview-scene-${tone}`}>
      <div className="appearance-preview-titlebar"><i /><i /></div>
      <div className="appearance-preview-sidebar"><span className="active" /><span /><span /></div>
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
  return <div className={`appearance-theme-preview appearance-theme-preview-${theme}`} aria-hidden="true"><ThemePreviewScene tone="light" /><ThemePreviewScene tone="dark" /></div>;
}

export function AppearanceSettings(): React.JSX.Element {
  const { t } = useI18n();
  const [theme, setTheme] = useThemePreference();
  return (
    <div className="settings-page settings-appearance-page" id="settings-page-appearance">
      <header className="settings-page-head"><span className="settings-eyebrow">{t("settings.preferences")}</span><h1>{t("settings.appearance")}</h1><p>{t("settings.appearanceDescription")}</p></header>
      <section className="settings-section-block appearance-theme-section" id="settings-theme">
        <div className="settings-section-title"><div><h2>{t("settings.colorTheme")}</h2></div></div>
        <div className="appearance-theme-grid" role="radiogroup" aria-label={t("settings.colorTheme")} onKeyDown={(event) => {
          if (!isRadioNavigationKey(event.key)) return;
          event.preventDefault();
          const nextIndex = nextRadioIndex(THEME_OPTIONS.indexOf(theme), THEME_OPTIONS.length, event.key);
          const target = THEME_OPTIONS[nextIndex];
          if (target) { event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus(); setTheme(target); }
        }}>
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option;
            return (
              <button type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} className={`appearance-theme-card${selected ? " selected" : ""}`} key={option} onClick={() => setTheme(option)}>
                <ThemePreview theme={option} />
                <span className="appearance-theme-card-copy"><span><strong>{t(`settings.theme.${option}` as TranslationKey)}</strong><small>{t(`settings.theme.${option}Description` as TranslationKey)}</small></span><span className="appearance-theme-check" aria-hidden="true">{selected && <Check size={12} strokeWidth={2} />}</span></span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
