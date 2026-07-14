import type { UiThreadItem } from "../../../shared/types.ts";

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

export interface AssistantIdentityItem {
  kind: "assistant-identity";
  id: string;
}

export type GroupedThreadItem = UiThreadItem | ToolExplorationGroupItem;
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
 * Render one Compass identity marker at the start of every assistant turn.
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

    const startsAssistantTurn = item.kind === "assistant" || item.kind === "tool-exploration-group" || item.kind === "tool";
    if (!placedForTurn && startsAssistantTurn) {
      rendered.push({ kind: "assistant-identity", id: `assistant-identity-${item.id}` });
      placedForTurn = true;
    }
    rendered.push(item);
  }

  return rendered;
}
