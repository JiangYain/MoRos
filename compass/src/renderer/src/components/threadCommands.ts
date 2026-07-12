import type { UiThreadItem } from "../../../shared/types.ts";

export type ActivityToolItem = Extract<UiThreadItem, { kind: "tool" }>;
export type ToolActivity = "command" | "read" | "write" | "edit" | "search";

export interface ToolActivityGroupItem {
  kind: "tool-activity-group";
  id: string;
  activity: ToolActivity;
  items: ActivityToolItem[];
}

export type RenderThreadItem = UiThreadItem | ToolActivityGroupItem;

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
 * Collapse the standard file and shell tools into one visual grammar. Groups
 * are scoped by both user turn and activity, so Read, Edit and Bash remain
 * distinct disclosures while sharing the same top-level hierarchy.
 */
export function groupToolActivities(items: UiThreadItem[]): RenderThreadItem[] {
  const groups = new Map<string, { activity: ToolActivity; items: ActivityToolItem[] }>();
  let turn = -1;

  for (const item of items) {
    if (item.kind === "user") turn += 1;
    const activity = toolActivity(item);
    if (!activity || item.kind !== "tool") continue;
    const key = `${turn}:${activity}`;
    const group = groups.get(key) ?? { activity, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  const grouped: RenderThreadItem[] = [];
  const emitted = new Set<string>();
  turn = -1;

  for (const item of items) {
    if (item.kind === "user") turn += 1;
    const activity = toolActivity(item);
    if (!activity || item.kind !== "tool") {
      grouped.push(item);
      continue;
    }

    const key = `${turn}:${activity}`;
    if (emitted.has(key)) continue;
    const group = groups.get(key) ?? { activity, items: [item] };
    grouped.push({
      kind: "tool-activity-group",
      id: `tool-activity-${activity}-${group.items[0].id}`,
      activity,
      items: group.items,
    });
    emitted.add(key);
  }

  return grouped;
}
