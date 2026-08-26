import type { UiThreadItem } from "../../../shared/types.ts";

export type MarkdownPresentation = "static" | "streaming";

export interface MarkdownRenderState {
  isAnimating: boolean;
  mode: MarkdownPresentation;
}

export interface ParsedSkillBlock {
  body: string;
  lineCount: number;
  name: string;
  preview: string;
}

export interface ActiveMarkdownTarget {
  blockIndex: number;
  itemId: string;
}

export function resolveMarkdownRenderState(
  presentation: MarkdownPresentation,
  animate: boolean,
): MarkdownRenderState {
  const isAnimating = presentation === "streaming" && animate;
  return {
    isAnimating,
    // Streaming syntax repair and visual animation are separate concerns.
    // Reduced-motion users still need incomplete fences/emphasis repaired
    // while an answer is arriving, even though word animation is disabled.
    mode: presentation,
  };
}

export function parseSkillBlock(text: string): ParsedSkillBlock | undefined {
  const match = text.match(/^\s*<skill\b([^>]*)>([\s\S]*?)(?:<\/skill>\s*)?$/i);
  if (!match) return undefined;

  const attrs = match[1] ?? "";
  const nameMatch = attrs.match(/\bname=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  const name = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3] ?? "skill";
  const body = (match[2] ?? "").trim();
  const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const preview = lines.find((line) => !line.trim().startsWith("```"))?.trim() ?? "";

  return {
    name,
    body,
    preview,
    lineCount: lines.length,
  };
}

/** Selects at most one ordinary text block for live word animation. */
export function resolveActiveMarkdownTarget(
  items: UiThreadItem[],
): ActiveMarkdownTarget | undefined {
  if (items.some((item) => item.kind === "tool" && item.running)) {
    return undefined;
  }

  for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
    const item = items[itemIndex];
    if (item.kind !== "assistant" || !item.streaming) continue;

    for (let blockIndex = item.blocks.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = item.blocks[blockIndex];
      if (!block.text.trim()) continue;
      if (block.type !== "text" || parseSkillBlock(block.text)) return undefined;
      return { itemId: item.id, blockIndex };
    }

    // The newest streaming assistant owns the live state even before it has
    // content; do not fall back to an older assistant.
    return undefined;
  }

  return undefined;
}
