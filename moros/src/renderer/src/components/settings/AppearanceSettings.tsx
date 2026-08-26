import { Check } from "lucide-react";
import { CODE_FONTS, CODE_FONT_OPTIONS, type CodeFontPreference, useCodeFontPreference } from "../../code-font";
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

function CodeFontPreview({ fontFamily }: { fontFamily: string }): React.JSX.Element {
  return (
    <div className="appearance-font-preview" style={{ fontFamily }} aria-hidden="true">
      <div className="appearance-font-preview-header">
        <span className="appearance-font-preview-dot red" />
        <span className="appearance-font-preview-dot yellow" />
        <span className="appearance-font-preview-dot green" />
        <span className="appearance-font-preview-file">session.ts</span>
      </div>
      <div className="appearance-font-preview-lines">
        <div className="appearance-font-line">
          <span className="appearance-font-ln">1</span>
          <span className="appearance-font-code">
            <span className="tok-kw">function</span> <span className="tok-fn">formatId</span><span className="tok-p">(</span>id: <span className="tok-typ">string</span>, count = <span className="tok-num">0</span><span className="tok-p">)</span>: <span className="tok-typ">string</span> &#123;
          </span>
        </div>
        <div className="appearance-font-line">
          <span className="appearance-font-ln">2</span>
          <span className="appearance-font-code indent">
            <span className="tok-kw">const</span> active = count &gt;= <span className="tok-num">0</span> &amp;&amp; id.length !== <span className="tok-num">0</span>;
          </span>
        </div>
        <div className="appearance-font-line">
          <span className="appearance-font-ln">3</span>
          <span className="appearance-font-code indent">
            <span className="tok-kw">return</span> active ? <span className="tok-str">`session-$&#123;id&#125;`</span> : <span className="tok-str">"unknown"</span>;
          </span>
        </div>
        <div className="appearance-font-line">
          <span className="appearance-font-ln">4</span>
          <span className="appearance-font-code">
            &#125;
          </span>
        </div>
      </div>
    </div>
  );
}

export function AppearanceSettings(): React.JSX.Element {
  const { t } = useI18n();
  const [theme, setTheme] = useThemePreference();
  const [codeFont, setCodeFont] = useCodeFontPreference();

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

      <section className="settings-section-block appearance-font-section" id="settings-code-font">
        <div className="settings-section-title">
          <div>
            <h2>{t("settings.codeFont")}</h2>
            <p>{t("settings.codeFontDescription")}</p>
          </div>
        </div>
        <div
          className="appearance-font-grid"
          role="radiogroup"
          aria-label={t("settings.codeFont")}
          onKeyDown={(event) => {
            if (!isRadioNavigationKey(event.key)) return;
            event.preventDefault();
            const nextIndex = nextRadioIndex(CODE_FONT_OPTIONS.indexOf(codeFont), CODE_FONT_OPTIONS.length, event.key);
            const target = CODE_FONT_OPTIONS[nextIndex];
            if (target) {
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
              setCodeFont(target);
            }
          }}
        >
          {CODE_FONT_OPTIONS.map((option) => {
            const selected = codeFont === option;
            const fontDef = CODE_FONTS[option];
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                className={`appearance-font-card${selected ? " selected" : ""}`}
                key={option}
                onClick={() => setCodeFont(option)}
              >
                <CodeFontPreview fontFamily={fontDef.fontFamily} />
                <span className="appearance-font-card-copy">
                  <span className="appearance-font-card-info">
                    <span className="appearance-font-title-row">
                      <strong>{t(`settings.codeFont.${option}` as TranslationKey)}</strong>
                      <span className="appearance-font-badge">{fontDef.badge}</span>
                    </span>
                    <small>{t(`settings.codeFont.${option}Description` as TranslationKey)}</small>
                  </span>
                  <span className="appearance-font-check" aria-hidden="true">
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
