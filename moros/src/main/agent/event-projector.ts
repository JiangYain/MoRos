import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import type {
  AgentStats,
  AgentUiEvent,
  AppLanguage,
  UiBlock,
  UiThreadItem,
} from "@shared/types";
import { projectUserMessage } from "../../shared/user-message.ts";
import {
  blocksOf,
  cloneForUi,
  imagesOfContent,
  isAssistantMessage,
  isRecord,
  isToolResultMessage,
  isUserMessage,
  textOfContent,
  usageOf,
} from "../thread-projector.ts";
import { agentMessage } from "./messages.ts";

interface AgentEventProjectorOptions {
  emit(event: AgentUiEvent): void;
  nextId(prefix: string): string;
  language(): AppLanguage;
  stats(): AgentStats;
  onSettled(): void | Promise<void>;
  onSettledError?(error: unknown): void;
}

function toolResultContent(value: unknown): ToolResultMessage["content"] | undefined {
  return isRecord(value) && Array.isArray(value.content)
    ? (value.content as ToolResultMessage["content"])
    : undefined;
}

/**
 * Stateful projection from Pi's session event stream into the stable renderer
 * event contract. It owns correlation IDs and event ordering so session
 * lifecycle code does not need to understand UI projection details.
 */
export class AgentEventProjector {
  private currentAssistantId?: string;
  private retryAssistantId?: string;
  private currentAssistant?: {
    id: string;
    blocks: Map<number, UiBlock>;
    ts: number;
  };
  private readonly currentTools = new Map<
    string,
    Extract<UiThreadItem, { kind: "tool" }>
  >();
  private pendingUserMessageIds: string[] = [];
  private readonly options: AgentEventProjectorOptions;

  constructor(options: AgentEventProjectorOptions) {
    this.options = options;
  }

  trackUserMessage(id: string): void {
    this.pendingUserMessageIds.push(id);
  }

  discardUserMessage(id: string): void {
    this.pendingUserMessageIds = this.pendingUserMessageIds.filter((candidate) => candidate !== id);
  }

  reset(): void {
    this.currentAssistantId = undefined;
    this.retryAssistantId = undefined;
    this.currentAssistant = undefined;
    this.currentTools.clear();
    this.pendingUserMessageIds = [];
  }

  snapshotThread(thread: UiThreadItem[]): UiThreadItem[] {
    const assistant = this.currentAssistant;
    const tools = [...this.currentTools.values()].map((tool) => ({ ...tool }));
    if (!assistant) return tools.length > 0 ? [...thread, ...tools] : thread;
    return [
      ...thread,
      {
        kind: "assistant",
        id: assistant.id,
        blocks: [...assistant.blocks.entries()]
          .sort((first, second) => first[0] - second[0])
          .map(([contentIndex, block]) => ({ ...block, contentIndex })),
        streaming: true,
        ts: assistant.ts,
      },
      ...tools,
    ];
  }

  emitStats(): void {
    this.options.emit({ kind: "stats", stats: this.options.stats() });
  }

  handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "agent_start":
        this.options.emit({ kind: "agent-start" });
        break;
      case "agent_end":
        this.emitStats();
        this.options.emit({ kind: "sessions-changed" });
        break;
      case "agent_settled":
        // AgentSession clears its run-active flag immediately before this
        // event. `agent_end` can still be followed by retries, compaction, or
        // queued continuations, so it is too early to clear streaming there.
        this.options.emit({ kind: "agent-end" });
        this.emitStats();
        this.options.emit({ kind: "sessions-changed" });
        this.runSettledEffect();
        break;
      case "message_start":
        if (isAssistantMessage(event.message)) {
          this.currentAssistantId = this.options.nextId("a");
          this.currentAssistant = {
            id: this.currentAssistantId,
            blocks: new Map(),
            ts: event.message.timestamp ?? Date.now(),
          };
          this.options.emit({
            kind: "assistant-start",
            id: this.currentAssistantId,
            ts: this.currentAssistant.ts,
          });
        }
        break;
      case "message_update": {
        const update = event.assistantMessageEvent;
        if (!this.currentAssistantId) break;
        if (update.type === "text_delta") {
          this.appendAssistantDelta(update.contentIndex, "text", update.delta);
          this.options.emit({
            kind: "assistant-delta",
            id: this.currentAssistantId,
            blockType: "text",
            contentIndex: update.contentIndex,
            delta: update.delta,
          });
        } else if (update.type === "thinking_delta") {
          this.appendAssistantDelta(update.contentIndex, "thinking", update.delta);
          this.options.emit({
            kind: "assistant-delta",
            id: this.currentAssistantId,
            blockType: "thinking",
            contentIndex: update.contentIndex,
            delta: update.delta,
          });
        }
        break;
      }
      case "message_end": {
        const message = event.message;
        if (isUserMessage(message)) {
          const expandedText = textOfContent(message.content);
          const display = projectUserMessage(expandedText);
          const images = imagesOfContent(message.content);
          if (display.text.trim() || display.skillName || display.feedback?.length || images.length > 0) {
            this.options.emit({
              kind: "user-message",
              id: this.pendingUserMessageIds.shift() ?? this.options.nextId("u"),
              text: display.text,
              skillName: display.skillName,
              ...(display.feedback ? { feedback: display.feedback } : {}),
              images: images.length > 0 ? images : undefined,
              ts: message.timestamp,
            });
            this.options.emit({ kind: "sessions-changed" });
          }
        } else if (isAssistantMessage(message) && this.currentAssistantId) {
          this.retryAssistantId = message.stopReason === "error" ? this.currentAssistantId : undefined;
          this.options.emit({
            kind: "assistant-end",
            id: this.currentAssistantId,
            blocks: blocksOf(message),
            stopReason: message.stopReason,
            errorMessage: message.errorMessage,
            usage: usageOf(message),
          });
          this.currentAssistantId = undefined;
          this.currentAssistant = undefined;
          this.emitStats();
        } else if (isToolResultMessage(message)) {
          this.currentTools.delete(message.toolCallId);
        }
        break;
      }
      case "tool_execution_start": {
        const tool = {
          kind: "tool" as const,
          id: this.options.nextId("t"),
          callId: event.toolCallId,
          name: event.toolName,
          args: cloneForUi(event.args),
          output: "",
          isError: false,
          running: true,
          ts: Date.now(),
        };
        this.currentTools.set(event.toolCallId, tool);
        this.options.emit({
          kind: "tool-start",
          id: tool.id,
          callId: tool.callId,
          name: tool.name,
          args: tool.args,
          ts: tool.ts,
        });
        break;
      }
      case "tool_execution_update": {
        const output = textOfContent(toolResultContent(event.partialResult));
        const tool = this.currentTools.get(event.toolCallId);
        if (tool?.running) this.currentTools.set(event.toolCallId, { ...tool, output });
        this.options.emit({
          kind: "tool-update",
          callId: event.toolCallId,
          output,
        });
        break;
      }
      case "tool_execution_end": {
        const output = textOfContent(toolResultContent(event.result));
        const tool = this.currentTools.get(event.toolCallId);
        if (tool) {
          this.currentTools.set(event.toolCallId, {
            ...tool,
            output,
            isError: event.isError,
            running: false,
          });
        }
        this.options.emit({
          kind: "tool-end",
          callId: event.toolCallId,
          output,
          isError: event.isError,
        });
        break;
      }
      case "queue_update":
        this.options.emit({
          kind: "queue-update",
          steering: [...event.steering],
          followUp: [...event.followUp],
        });
        break;
      case "compaction_start":
        this.options.emit({
          kind: "notice",
          tone: "info",
          text: agentMessage(this.options.language(), "compacting"),
          ts: Date.now(),
        });
        break;
      case "compaction_end":
        this.options.emit({
          kind: "notice",
          tone: event.errorMessage ? "warn" : "info",
          text: event.errorMessage
            ? agentMessage(this.options.language(), "compactionFailed", { error: event.errorMessage })
            : agentMessage(this.options.language(), "compactionComplete"),
          ts: Date.now(),
        });
        this.emitStats();
        break;
      case "auto_retry_start":
        this.options.emit({
          kind: "notice",
          tone: "warn",
          text: agentMessage(this.options.language(), "retrying", {
            attempt: event.attempt,
            max: event.maxAttempts,
          }),
          ts: Date.now(),
          retryAssistantId: this.retryAssistantId,
        });
        this.retryAssistantId = undefined;
        break;
      case "session_info_changed":
        this.options.emit({ kind: "sessions-changed" });
        break;
      default:
        break;
    }
  }

  private runSettledEffect(): void {
    try {
      void Promise.resolve(this.options.onSettled()).catch((error: unknown) => {
        this.options.onSettledError?.(error);
      });
    } catch (error) {
      this.options.onSettledError?.(error);
    }
  }

  private appendAssistantDelta(
    contentIndex: number,
    type: UiBlock["type"],
    delta: string,
  ): void {
    const assistant = this.currentAssistant;
    if (!assistant) return;
    const existing = assistant.blocks.get(contentIndex);
    assistant.blocks.set(
      contentIndex,
      existing?.type === type
        ? { ...existing, text: existing.text + delta }
        : { type, text: delta },
    );
  }
}
