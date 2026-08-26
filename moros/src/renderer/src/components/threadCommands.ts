import type { AppLanguage, UiThreadItem } from "../../../shared/types.ts";
import type { TranslationKey } from "../i18n.ts";

export type ActivityToolItem = Extract<UiThreadItem, { kind: "tool" }>;
export type ToolActivity = "command" | "read" | "write" | "edit" | "search";

export const TOOL_ACTIVITY_COPY: Record<ToolActivity, {
  active: string;
  complete: string;
  itemActive: string;
  itemComplete: string;
}> = {
  command: { active: "Running commands", complete: "Ran commands", itemActive: "Running", itemComplete: "Ran" },
  read: { active: "Reading files", complete: "Read files", itemActive: "Reading", itemComplete: "Read" },
  write: { active: "Writing files", complete: "Wrote files", itemActive: "Writing", itemComplete: "Wrote" },
  edit: { active: "Editing files", complete: "Edited files", itemActive: "Editing", itemComplete: "Edited" },
  search: { active: "Searching files", complete: "Searched files", itemActive: "Searching", itemComplete: "Searched" },
};

export interface ToolActivityGroupItem {
  kind: "tool-activity-group";
  id: string;
  activity: ToolActivity;
  items: ActivityToolItem[];
}

export interface ToolExplorationGroupItem {
  kind: "tool-exploration-group";
  id: string;
  groups: ToolActivityGroupItem[];
}

export type SummaryTimelineEntry =
  | { kind: "thinking"; id: string; text: string }
  | { kind: "narration"; id: string; text: string }
  | { kind: "exploration"; id: string; group: ToolExplorationGroupItem };

export interface ExecutionSummaryItem {
  kind: "execution-summary";
  id: string;
  thoughtCount: number;
  exploredFilesCount: number;
  commandsCount: number;
  timelineEntries: SummaryTimelineEntry[];
}

export interface AssistantIdentityItem {
  kind: "assistant-identity";
  id: string;
}

export type GroupedThreadItem = UiThreadItem | ToolExplorationGroupItem | ExecutionSummaryItem;
export type RenderThreadItem = GroupedThreadItem | AssistantIdentityItem;

const REDUNDANT_COMPLETION_OPENER = /^\s*Done\s*[—–-]\s*both actions were completed\.\s*/i;

/**
 * Tool activity already communicates that work completed. Remove this known
 * canned opener from historical model replies so the useful result starts the
 * response instead of repeating an empty completion status.
 */
export function stripRedundantCompletionOpener(text: string): string {
  return text.replace(REDUNDANT_COMPLETION_OPENER, "");
}

const TOOL_ACTIVITY_NAMES: Record<ToolActivity, ReadonlySet<string>> = {
  command: new Set([
    "bash",
    "exec",
    "exec_command",
    "powershell",
    "shell",
    "shell_command",
    "terminal",
  ]),
  read: new Set(["read", "read_file"]),
  write: new Set(["write", "write_file"]),
  edit: new Set(["edit", "apply_patch"]),
  search: new Set(["find", "glob", "grep", "list", "ls", "search"]),
};

export function toolActivity(item: UiThreadItem): ToolActivity | undefined {
  if (item.kind !== "tool") return undefined;
  const name = item.name.trim().toLowerCase();
  return (Object.entries(TOOL_ACTIVITY_NAMES) as Array<[ToolActivity, ReadonlySet<string>]>).find(
    ([, names]) => names.has(name),
  )?.[0];
}

export function buildSummaryText(
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
  language: AppLanguage,
  item: { thoughtCount: number; exploredFilesCount: number; commandsCount: number },
): string {
  const parts: string[] = [];

  if (item.thoughtCount > 0) {
    const key: TranslationKey =
      item.thoughtCount === 1 ? "thread.summary.thought" : "thread.summary.thoughtPlural";
    parts.push(t(key, { count: item.thoughtCount }));
  }

  if (item.exploredFilesCount > 0) {
    const key: TranslationKey =
      item.exploredFilesCount === 1 ? "thread.summary.explored" : "thread.summary.exploredPlural";
    parts.push(t(key, { count: item.exploredFilesCount }));
  }

  if (item.commandsCount > 0) {
    const key: TranslationKey =
      item.commandsCount === 1 ? "thread.summary.commands" : "thread.summary.commandsPlural";
    parts.push(t(key, { count: item.commandsCount }));
  }

  return parts.join(" · ");
}

export function summarizeToolActivity(item: ActivityToolItem): string {
  const activity = toolActivity(item);
  let summary = "";

  if (typeof item.args === "string") {
    summary = item.args;
  } else if (item.args && typeof item.args === "object") {
    const record = item.args as Record<string, unknown>;
    const keys = activity === "command"
      ? ["cmd", "command", "script", "input"]
      : ["path", "file_path", "filePath", "query", "pattern", "glob", "target"];
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        summary = value;
        break;
      }
    }
  }

  const compact = summary.replace(/\s+/g, " ").trim();
  if (compact) return compact;
  if (activity === "command") return "Command";
  return item.name || "Tool";
}

/**
 * Successful standard tool calls are represented by their compact activity
 * summary. Keep raw output available only when it contains a useful failure
 * detail; otherwise file contents and other verbose results overwhelm the
 * conversation.
 */
export function shouldShowToolActivityOutput(activity: ToolActivity, item: ActivityToolItem): boolean {
  return activity !== "command" && item.isError && Boolean(item.output.trim());
}

/**
 * Collapse consecutive standard file and shell tools into one exploration.
 * Within it, adjacent calls of the same activity share a subgroup while
 * switches preserve sequences such as Command -> Read -> Command. Rendering
 * any other thread item closes the exploration.
 */
export function groupToolActivities(items: UiThreadItem[]): GroupedThreadItem[] {
  const grouped: GroupedThreadItem[] = [];
  let exploration: ToolExplorationGroupItem | undefined;

  for (const item of items) {
    const activity = toolActivity(item);
    if (!activity || item.kind !== "tool") {
      grouped.push(item);
      exploration = undefined;
      continue;
    }

    if (!exploration) {
      exploration = {
        kind: "tool-exploration-group",
        id: `tool-exploration-${item.id}`,
        groups: [],
      };
      grouped.push(exploration);
    }

    const previous = exploration.groups[exploration.groups.length - 1];
    if (previous?.activity === activity) {
      previous.items.push(item);
      continue;
    }

    exploration.groups.push({
      kind: "tool-activity-group",
      id: `tool-activity-${activity}-${item.id}`,
      activity,
      items: [item],
    });
  }

  return grouped;
}

/**
 * Once the current agent lifecycle is complete, merge all thinking blocks and
 * tool exploration groups belonging to that turn into one ExecutionSummaryItem.
 * Per-item streaming/running flags remain as a fallback for restored history.
 */
export function summarizeExecutionTurns(
  items: GroupedThreadItem[],
  currentAgentActive = false,
): GroupedThreadItem[] {
  const result: GroupedThreadItem[] = [];
  let currentTurnItems: GroupedThreadItem[] = [];

  const processTurn = (turnItems: GroupedThreadItem[], deferSummary = false): void => {
    if (turnItems.length === 0) return;

    // The lifecycle flag bridges the quiet hand-off gaps between assistant and
    // tool events. Item flags still guard partially restored active history.
    const isStreaming = deferSummary || turnItems.some((item) => {
      if (item.kind === "assistant" && item.streaming) return true;
      if (item.kind === "tool" && item.running) return true;
      if (item.kind === "tool-exploration-group") {
        return item.groups.some((group) => group.items.some((tool) => tool.running));
      }
      return false;
    });

    if (isStreaming) {
      result.push(...turnItems);
      return;
    }

    // Settled turn: collect process entries in their original timeline order.
    // Valid body text and tool entries break consecutive thinking runs.
    const timelineEntries: SummaryTimelineEntry[] = [];
    let canMergeThinking = false;

    // Body text written before the turn's last tool run is narration about work
    // still in progress, so it belongs inside the summary next to the steps it
    // describes. Only text after the last tool run is the answer to the user.
    const lastExplorationIndex = turnItems.reduce(
      (last, item, index) => (item.kind === "tool-exploration-group" ? index : last),
      -1,
    );
    const foldsIntoSummary = (item: GroupedThreadItem, index: number): boolean =>
      index < lastExplorationIndex
      && item.kind === "assistant"
      // A failed or aborted turn must keep its message visible to carry the
      // error notice and the retry action.
      && !item.errorMessage
      && item.stopReason !== "aborted";

    for (const [index, item] of turnItems.entries()) {
      if (item.kind === "tool-exploration-group") {
        timelineEntries.push({
          kind: "exploration",
          id: item.id,
          group: item,
        });
        canMergeThinking = false;
      } else if (item.kind === "assistant" && Array.isArray(item.blocks)) {
        const folded = foldsIntoSummary(item, index);
        for (const [blockIndex, block] of item.blocks.entries()) {
          if (block.type === "thinking" && block.text.trim()) {
            const previous = timelineEntries[timelineEntries.length - 1];
            if (canMergeThinking && previous?.kind === "thinking") {
              previous.text = `${previous.text.trimEnd()}\n\n${block.text.trimStart()}`;
            } else {
              timelineEntries.push({
                kind: "thinking",
                id: `summary-thinking-${item.id}-${blockIndex}`,
                text: block.text,
              });
            }
            canMergeThinking = true;
          } else if (block.type !== "thinking" && block.text.trim()) {
            if (folded) {
              timelineEntries.push({
                kind: "narration",
                id: `summary-narration-${item.id}-${blockIndex}`,
                text: block.text,
              });
            }
            canMergeThinking = false;
          }
        }
      } else if (item.kind !== "assistant") {
        canMergeThinking = false;
      }
    }

    if (timelineEntries.length === 0) {
      result.push(...turnItems);
      return;
    }

    let commandsCount = 0;
    let exploredFilesCount = 0;

    for (const entry of timelineEntries) {
      if (entry.kind !== "exploration") continue;
      const exploration = entry.group;
      for (const group of exploration.groups) {
        if (group.activity === "command") {
          commandsCount += group.items.length;
        } else {
          exploredFilesCount += group.items.length;
        }
      }
    }

    const firstAssistant = turnItems.find(
      (item): item is Extract<UiThreadItem, { kind: "assistant" }> => item.kind === "assistant",
    );
    const firstExploration = timelineEntries.find((entry) => entry.kind === "exploration");
    const summaryId = `execution-summary-${firstAssistant?.id ?? firstExploration?.id ?? "turn"}`;

    const summaryItem: ExecutionSummaryItem = {
      kind: "execution-summary",
      id: summaryId,
      thoughtCount: timelineEntries.filter((entry) => entry.kind === "thinking").length,
      exploredFilesCount,
      commandsCount,
      timelineEntries,
    };

    let summaryPlaced = false;
    // Explorations are absorbed by the summary, so the answer text they used to
    // separate has to collapse into a single assistant message. Emitting one
    // message per fragment stacks a thread gap plus a reserved copy-button row
    // between every sentence of the same turn.
    let mergedAssistant: Extract<UiThreadItem, { kind: "assistant" }> | undefined;
    for (const [index, item] of turnItems.entries()) {
      if (item.kind === "tool-exploration-group") {
        if (!summaryPlaced) {
          result.push(summaryItem);
          summaryPlaced = true;
        }
        continue;
      }

      if (item.kind === "assistant") {
        const hasThinking = item.blocks.some(
          (block) => block.type === "thinking" && block.text.trim(),
        );
        if (hasThinking && !summaryPlaced) {
          result.push(summaryItem);
          summaryPlaced = true;
        }
        // Narration already rendered inside the summary timeline above.
        const nonThinkingBlocks = foldsIntoSummary(item, index)
          ? []
          : item.blocks.filter(
            (block) => block.type !== "thinking" && block.text.trim(),
          );
        if (nonThinkingBlocks.length === 0) continue;
        if (mergedAssistant) {
          // The first fragment keeps the identity that scroll anchors and React
          // keys already reference; only the turn's outcome is adopted.
          mergedAssistant.blocks = [...mergedAssistant.blocks, ...nonThinkingBlocks];
          if (item.stopReason !== undefined) mergedAssistant.stopReason = item.stopReason;
          if (item.errorMessage !== undefined) mergedAssistant.errorMessage = item.errorMessage;
          if (item.usage !== undefined) mergedAssistant.usage = item.usage;
          continue;
        }
        mergedAssistant = { ...item, blocks: nonThinkingBlocks };
        result.push(mergedAssistant);
        continue;
      }

      // A separately rendered item (notice, ungrouped tool card) is a real
      // visual break, so the next body text starts a new assistant message.
      mergedAssistant = undefined;
      result.push(item);
    }

    if (!summaryPlaced) {
      result.push(summaryItem);
    }
  };

  for (const item of items) {
    if (item.kind === "user") {
      processTurn(currentTurnItems);
      currentTurnItems = [];
      result.push(item);
      continue;
    }
    currentTurnItems.push(item);
  }

  // Only the final turn can belong to the currently running agent. Earlier
  // completed turns stay summarized while a new response is in progress.
  processTurn(currentTurnItems, currentAgentActive);
  return result;
}

/**
 * Render one Moros identity marker at the start of every assistant turn.
 * Historical sessions can place a tool-only assistant message before the
 * final text message, so the marker cannot live inside the text item itself.
 */
export function placeAssistantIdentities(items: GroupedThreadItem[]): RenderThreadItem[] {
  const rendered: RenderThreadItem[] = [];
  let placedForTurn = false;

  for (const item of items) {
    if (item.kind === "user") {
      placedForTurn = false;
      rendered.push(item);
      continue;
    }

    const startsAssistantTurn =
      item.kind === "assistant" ||
      item.kind === "tool-exploration-group" ||
      item.kind === "tool" ||
      item.kind === "execution-summary";
    if (!placedForTurn && startsAssistantTurn) {
      rendered.push({ kind: "assistant-identity", id: `assistant-identity-${item.id}` });
      placedForTurn = true;
    }
    rendered.push(item);
  }

  return rendered;
}
