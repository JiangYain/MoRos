import type { SettingsSection } from "../store";

/**
 * A searchable target inside the settings workspace. `targetId` is a stable DOM
 * id used to scroll to / focus the matched control after navigation.
 */
export interface SettingsSearchTarget {
  sectionId: SettingsSection;
  targetId: string;
  title: string;
  description: string;
  /** Extra keywords (e.g. synonyms) matched in addition to title/description. */
  keywords?: string;
}

export interface SettingsSearchMatch {
  sectionId: SettingsSection;
  targetId: string;
  title: string;
  description: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Filter settings search targets by a free-form query. A target matches when
 * every whitespace-separated query token appears in the concatenation of its
 * title, description, and keywords. Empty queries match nothing so the search
 * box stays out of the way until the user types.
 */
export function filterSettingsTargets(
  targets: readonly SettingsSearchTarget[],
  query: string,
): SettingsSearchMatch[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const matches: SettingsSearchMatch[] = [];
  for (const target of targets) {
    const haystack = normalize(
      `${target.title} ${target.description} ${target.keywords ?? ""}`,
    );
    if (tokens.every((token) => haystack.includes(token))) {
      matches.push({
        sectionId: target.sectionId,
        targetId: target.targetId,
        title: target.title,
        description: target.description,
      });
    }
  }
  return matches;
}
