import type { UiThreadItem } from "@shared/types";
import { userMessagePreview } from "../shared/user-message.ts";

const MAX_TRANSCRIPT_CHARS = 6_000;
const MAX_TITLE_CHARS = 42;

export function buildSessionTitleTranscript(thread: UiThreadItem[]): string {
  const lines = thread
    .filter((item) => item.kind === "user" || item.kind === "assistant")
    .slice(0, 6)
    .map((item) => {
      if (item.kind === "user") {
        const text = userMessagePreview(item, "[Image attachment]");
        return text ? `User: ${text}` : "";
      }
      const text = item.blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return text ? `Assistant: ${text}` : "";
    })
    .filter(Boolean);
  return lines.join("\n\n").slice(0, MAX_TRANSCRIPT_CHARS).trim();
}

export function normalizeGeneratedSessionTitle(value: string): string | null {
  const firstLine = value
    .replace(/```(?:\w+)?/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return null;

  const normalized = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:title|标题|会话标题)\s*[:：-]\s*/i, "")
    .replace(/^[-*•]\s*/, "")
    .replace(/^["'“‘《【]+|["'”’》】]+$/g, "")
    .replace(/[。.!！?？:：;；]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  return Array.from(normalized).slice(0, MAX_TITLE_CHARS).join("");
}
