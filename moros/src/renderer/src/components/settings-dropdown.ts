export const SETTINGS_DROPDOWN_NAVIGATION_KEYS = [
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
] as const;

export type SettingsDropdownNavigationKey = (typeof SETTINGS_DROPDOWN_NAVIGATION_KEYS)[number];

export function isSettingsDropdownNavigationKey(
  key: string,
): key is SettingsDropdownNavigationKey {
  return (SETTINGS_DROPDOWN_NAVIGATION_KEYS as readonly string[]).includes(key);
}

export function nextSettingsDropdownIndex(
  currentIndex: number,
  itemCount: number,
  key: SettingsDropdownNavigationKey,
): number {
  if (itemCount <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (currentIndex < 0 || currentIndex >= itemCount) {
    return key === "ArrowUp" ? itemCount - 1 : 0;
  }
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  return (currentIndex + 1) % itemCount;
}
