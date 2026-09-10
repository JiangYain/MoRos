export interface SkillInvocationDisplay {
  name: string;
  argumentsText: string;
}

export function inlineSkillReferences(text: string): Array<{ name: string; start: number; end: number }> {
  return Array.from(text.matchAll(/(^|\s)\/skill:([^\s]+)/g), (match) => ({
    name: match[2],
    start: match.index + match[1].length,
    end: match.index + match[0].length,
  }));
}

/** Older messages kept the invoked skill separately; newer bodies retain its inline position. */
export function userSkillText(text: string, name?: string): string {
  if (!name || inlineSkillReferences(text).some((reference) => reference.name === name)) return text;
  return `/skill:${name}${text.trim() ? ` ${text}` : ""}`;
}

function skillName(attributes: string): string | undefined {
  const match = attributes.match(/\bname=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim() || undefined;
}

/** Recognizes both a raw slash invocation and Pi's expanded <skill> payload. */
export function parseSkillInvocation(text: string): SkillInvocationDisplay | undefined {
  const slash = text.match(/^\s*\/{1,2}skill:([^\s]+)(?:\s+([\s\S]*))?$/i);
  if (slash?.[1]) {
    return { name: slash[1], argumentsText: (slash[2] ?? "").trim() };
  }

  const expanded = text.match(/^\s*<skill\b([^>]*)>[\s\S]*?<\/skill>(?:\s*\n\s*([\s\S]*))?\s*$/i);
  const name = expanded ? skillName(expanded[1] ?? "") : undefined;
  if (!expanded || !name) return undefined;
  return { name, argumentsText: (expanded[2] ?? "").trim() };
}

export function compactSkillText(text: string): { text: string; skillName?: string } {
  const invocation = parseSkillInvocation(text);
  return invocation
    ? { text: invocation.argumentsText, skillName: invocation.name }
    : { text };
}
