import type { SettingsSection } from "./state.ts";

export type SettingsNavigationDecision = "navigate" | "block" | "ignore";

/**
 * Decides how a settings navigation request proceeds when a leave-guard may
 * be registered. Same-target requests are ignored because nothing unsaved
 * would be lost by staying on the current surface.
 */
export function decideSettingsNavigation(options: {
  currentSection: SettingsSection | null;
  targetSection: SettingsSection | null;
  guardBlocked: boolean;
}): SettingsNavigationDecision {
  if (options.currentSection === options.targetSection) return "ignore";
  return options.guardBlocked ? "block" : "navigate";
}
