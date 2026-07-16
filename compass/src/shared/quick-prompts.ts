export const MAX_QUICK_PROMPTS = 5;

export function isQuickPromptList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= MAX_QUICK_PROMPTS
    && value.every((prompt) => typeof prompt === "string" && prompt.trim().length > 0);
}

export function normalizeQuickPrompts(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const prompts = value
    .filter((prompt): prompt is string => typeof prompt === "string")
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .slice(0, MAX_QUICK_PROMPTS);
  return prompts.length > 0 ? prompts : undefined;
}
