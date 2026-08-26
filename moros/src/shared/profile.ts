/**
 * Local profile helpers shared between renderer and main process.
 * The profile is user-editable identity metadata stored locally.
 */

export const MAX_PROFILE_NAME_LENGTH = 40;
export const MAX_PROFILE_HANDLE_LENGTH = 30;
/** Safe default used when no profile name has been entered yet (old or new data). */
export const DEFAULT_PROFILE_NAME = "";
export const DEFAULT_PROFILE_HANDLE = "";

/**
 * Normalize a profile display name. Returns an empty string for missing/invalid
 * input so callers can render a localized placeholder and never leak a hardcoded
 * identity. Trims and caps length to keep the UI tidy.
 */
export function normalizeProfileName(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_PROFILE_NAME;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, MAX_PROFILE_NAME_LENGTH);
}

/**
 * Normalize a profile handle/username. Strips a leading "@", collapses inner
 * whitespace to underscores, and caps length. Returns an empty string when
 * absent so the UI can show a neutral placeholder.
 */
export function normalizeProfileHandle(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_PROFILE_HANDLE;
  const cleaned = value.trim().replace(/^@+/, "").replace(/\s+/g, "_");
  return cleaned.slice(0, MAX_PROFILE_HANDLE_LENGTH);
}

/**
 * Derive up to two uppercase initials from a display name for avatar fallback.
 * For a multi-word name, takes the first letter of each of the first two words.
 * For a single word, takes its first character (suitable for both Latin and
 * CJK names). Returns an empty string when the name is empty so the caller can
 * render a neutral generic glyph instead of a hardcoded person's initials.
 */
export function profileInitials(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}

/**
 * Whether a profile draft is valid to persist. Empty name is allowed (the UI
 * shows a placeholder); we only reject overly long or non-string inputs.
 */
export function isValidProfileDraft(name: unknown, handle: unknown): boolean {
  return typeof name === "string" && typeof handle === "string"
    && name.trim().length <= MAX_PROFILE_NAME_LENGTH
    && handle.trim().length <= MAX_PROFILE_HANDLE_LENGTH;
}
