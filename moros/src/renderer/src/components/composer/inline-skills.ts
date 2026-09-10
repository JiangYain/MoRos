import type { UiSkill } from "../../../../shared/types.ts";
import { inlineSkillReferences } from "../../../../shared/skill-display.ts";

export function findInlineSkills(text: string, skills: UiSkill[]): Array<{ start: number; end: number; skill: UiSkill }> {
  const matches: Array<{ start: number; end: number; skill: UiSkill }> = [];
  for (const match of inlineSkillReferences(text)) {
    const skill = skills.find((candidate) => candidate.enabled && candidate.name === match.name);
    if (!skill) continue;
    matches.push({ start: match.start, end: match.end, skill });
  }
  return matches;
}

/** Activate Pi's leading command while retaining the original body for display and editing. */
export function skillPrompt(text: string, skills: UiSkill[]): string {
  const first = findInlineSkills(text, skills)[0];
  if (!first) return text.trim();
  return `/skill:${first.skill.name} ${text.trim()}`;
}
