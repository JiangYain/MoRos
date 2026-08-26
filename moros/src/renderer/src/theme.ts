import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "moros.theme.v1";
const THEME_CHANGE_EVENT = "moros:theme-change";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

function readThemePreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function applyTheme(preference: ThemePreference): void {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(preference, systemDark);
  document.documentElement.style.colorScheme = resolveTheme(preference, systemDark);
}

export function applyInitialTheme(): void {
  applyTheme(readThemePreference());
}

export function useThemePreference(): readonly [ThemePreference, (preference: ThemePreference) => void] {
  const [preference, setPreferenceState] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (): void => {
      const next = readThemePreference();
      setPreferenceState(next);
      applyTheme(next);
    };
    const onMediaChange = (): void => {
      if (readThemePreference() === "system") applyTheme("system");
    };
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    media.addEventListener("change", onMediaChange);
    applyTheme(preference);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", onMediaChange);
    };
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference): void => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The current document can still switch themes without persistent storage.
    }
    setPreferenceState(next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return [preference, setPreference] as const;
}
