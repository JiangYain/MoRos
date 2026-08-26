import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type {
  AssistantMessage,
  Message,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type {
  UiBlock,
  UiImageAttachment,
  UiThreadItem,
  UiUsage,
} from "@shared/types";
import { compactSkillText } from "../shared/skill-display.ts";

type MessageContent = Message["content"];
type AssistantContentBlock = AssistantMessage["content"][number];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isUserMessage(value: unknown): value is UserMessage {
  return isRecord(value) && value.role === "user";
}

export function isAssistantMessage(value: unknown): value is AssistantMessage {
  return isRecord(value) && value.role === "assistant";
}

export function isToolResultMessage(value: unknown): value is ToolResultMessage {
  return isRecord(value) && value.role === "toolResult" && typeof value.toolCallId === "string";
}

function isMessage(value: unknown): value is Message {
  return isUserMessage(value) || isAssistantMessage(value) || isToolResultMessage(value);
}

function isToolCallBlock(block: AssistantContentBlock): block is ToolCall {
  return block.type === "toolCall";
}

export function textOfContent(content: MessageContent | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

export function imagesOfContent(content: MessageContent | undefined): UiImageAttachment[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (
      block.type !== "image" ||
      typeof block.data !== "string" ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(block.mimeType)
    ) {
      return [];
    }
    return [{ data: block.data, mimeType: block.mimeType as UiImageAttachment["mimeType"] }];
  });
}

export function usageOf(message: AssistantMessage): UiUsage | undefined {
  const usage = message.usage;
  if (!usage) return undefined;
  return { input: usage.input ?? 0, output: usage.output ?? 0, cost: usage.cost?.total ?? 0 };
}

export function blocksOf(message: AssistantMessage): UiBlock[] {
  const blocks: UiBlock[] = [];
  for (const block of message.content) {
    if (block.type === "thinking" && block.thinking?.trim()) {
      blocks.push({ type: "thinking", text: block.thinking });
    } else if (block.type === "text" && block.text?.trim()) {
      blocks.push({ type: "text", text: block.text });
    }
  }
  return blocks;
}

export function cloneForUi(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return undefined;
  }
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function historicalItemId(
  prefix: string,
  sessionId: string,
  index: number,
  message: Message,
  extra = "",
): string {
  const key = [sessionId, index, message.role, message.timestamp, extra].join("|");
  return `${prefix}-${index}-${hashText(key)}`;
}

export function projectThread(session: AgentSession | undefined): UiThreadItem[] {
  if (!session) return [];
  const items: UiThreadItem[] = [];
  const pendingToolCalls = new Map<string, { name: string; args?: unknown }>();

  for (const [index, raw] of session.messages.entries()) {
    if (!isMessage(raw)) continue;
    const message = raw;
    if (isUserMessage(message)) {
      const display = compactSkillText(textOfContent(message.content));
      const images = imagesOfContent(message.content);
      if (display.text || display.skillName || images.length > 0) {
        items.push({
          kind: "user",
          id: historicalItemId("u", session.sessionId, index, message),
          text: display.text,
          ...(display.skillName ? { skillName: display.skillName } : {}),
          images: images.length > 0 ? images : undefined,
          ts: message.timestamp ?? 0,
        });
      }
    } else if (isAssistantMessage(message)) {
      const blocks = blocksOf(message);
      for (const block of message.content) {
        if (isToolCallBlock(block) && block.id) {
          pendingToolCalls.set(block.id, {
            name: block.name ?? "tool",
            args: block.arguments,
          });
        }
      }
      if (blocks.length > 0 || message.errorMessage) {
        items.push({
          kind: "assistant",
          id: historicalItemId("a", session.sessionId, index, message),
          blocks,
          streaming: false,
          stopReason: message.stopReason,
          errorMessage: message.errorMessage,
          usage: usageOf(message),
          ts: message.timestamp ?? 0,
        });
      }
    } else {
      const call = pendingToolCalls.get(message.toolCallId);
      items.push({
        kind: "tool",
        id: historicalItemId("t", session.sessionId, index, message, message.toolCallId),
        callId: message.toolCallId,
        name: message.toolName ?? call?.name ?? "tool",
        args: cloneForUi(call?.args),
        output: textOfContent(message.content),
        isError: Boolean(message.isError),
        running: false,
        ts: message.timestamp ?? 0,
      });
    }
  }
  return items;
}
