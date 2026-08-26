import { useCallback, useEffect, useState } from "react";

export type CodeFontPreference = "google-sans-code" | "maple-mono";

export const CODE_FONT_STORAGE_KEY = "moros.code-font.v1";
const CODE_FONT_CHANGE_EVENT = "moros:code-font-change";

export interface CodeFontDefinition {
  id: CodeFontPreference;
  name: string;
  fontFamily: string;
  badge: string;
}

export const CODE_FONTS: Record<CodeFontPreference, CodeFontDefinition> = {
  "google-sans-code": {
    id: "google-sans-code",
    name: "Google Sans Code NF",
    fontFamily: '"Google Sans Code NF", "GoogleSansCode NF", "Google Sans Code Nerd Font", "Google Sans Code", "GoogleSansCode", ui-monospace, "Cascadia Code", "Cascadia Mono", "SFMono-Regular", Consolas, Menlo, monospace',
    badge: "Geometric · Nerd Font",
  },
  "maple-mono": {
    id: "maple-mono",
    name: "Maple Mono NF CN",
    fontFamily: '"Maple Mono NF CN", "Maple Mono SC NF", "Maple Mono NF", "Maple Mono CN", "Maple Mono", "MapleMono-NF-CN", ui-monospace, "Cascadia Code", "Cascadia Mono", "SFMono-Regular", Consolas, Menlo, monospace',
    badge: "Rounded · CJK & NF",
  },
};

export const CODE_FONT_OPTIONS: CodeFontPreference[] = ["google-sans-code", "maple-mono"];

export function parseCodeFontPreference(value: string | null): CodeFontPreference {
  return value === "maple-mono" || value === "google-sans-code" ? value : "google-sans-code";
}

function readCodeFontPreference(): CodeFontPreference {
  try {
    return parseCodeFontPreference(window.localStorage.getItem(CODE_FONT_STORAGE_KEY));
  } catch {
    return "google-sans-code";
  }
}

export function applyCodeFont(preference: CodeFontPreference): void {
  const font = CODE_FONTS[preference] ?? CODE_FONTS["google-sans-code"];
  document.documentElement.style.setProperty("--font-mono", font.fontFamily);
  document.documentElement.dataset.codeFont = preference;
}

export function applyInitialCodeFont(): void {
  applyCodeFont(readCodeFontPreference());
}

export function useCodeFontPreference(): readonly [CodeFontPreference, (preference: CodeFontPreference) => void] {
  const [preference, setPreferenceState] = useState<CodeFontPreference>(readCodeFontPreference);

  useEffect(() => {
    const sync = (): void => {
      const next = readCodeFontPreference();
      setPreferenceState(next);
      applyCodeFont(next);
    };
    window.addEventListener(CODE_FONT_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    applyCodeFont(preference);
    return () => {
      window.removeEventListener(CODE_FONT_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [preference]);

  const setPreference = useCallback((next: CodeFontPreference): void => {
    try {
      window.localStorage.setItem(CODE_FONT_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setPreferenceState(next);
    applyCodeFont(next);
    window.dispatchEvent(new Event(CODE_FONT_CHANGE_EVENT));
  }, []);

  return [preference, setPreference] as const;
}
