import type { UiApprovalRequest, UiThreadItem } from "../../../shared/types.ts";
import { toolActivity, type ToolActivity } from "./threadCommands.ts";

export type ThreadActivityState = "working" | "searching" | "solving" | "composing";

export type ThreadActivity =
  | {
      target: "tool";
      state: "working" | "searching";
      itemId: string;
      callId: string;
      activity?: ToolActivity;
    }
  | {
      target: "assistant-thinking";
      state: "solving";
      itemId: string;
      blockIndex: number;
    }
  | {
      target: "assistant-stream";
      state: "working" | "composing";
      itemId: string;
    };

/**
 * Resolve the one place that owns the live Agent activity indicator.
 * Running tools take priority over assistant streaming; within either class,
 * the latest thread item wins so stale concurrent entries cannot mount orbs.
 */
export function resolveThreadActivity(items: UiThreadItem[]): ThreadActivity | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind !== "tool" || !item.running) continue;

    const activity = toolActivity(item);
    return {
      target: "tool",
      state: activity === "read" || activity === "search" ? "searching" : "working",
      itemId: item.id,
      callId: item.callId,
      activity,
    };
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind !== "assistant" || !item.streaming) continue;

    let blockIndex = -1;
    for (let candidate = item.blocks.length - 1; candidate >= 0; candidate -= 1) {
      if (item.blocks[candidate].text.trim()) {
        blockIndex = candidate;
        break;
      }
    }

    if (blockIndex < 0) {
      return { target: "assistant-stream", state: "working", itemId: item.id };
    }

    if (item.blocks[blockIndex].type === "thinking") {
      return {
        target: "assistant-thinking",
        state: "solving",
        itemId: item.id,
        blockIndex,
      };
    }

    return { target: "assistant-stream", state: "composing", itemId: item.id };
  }

  return undefined;
}

/**
 * Approval explanations share the same global activity budget as the thread.
 * Prefer real agent activity; otherwise only the newest pending explanation may
 * mount an Orb when several approvals are waiting at once.
 */
export function resolveActiveApprovalExplanationId(
  approvals: UiApprovalRequest[],
  activity: ThreadActivity | undefined,
): string | undefined {
  if (activity) return undefined;
  for (let index = approvals.length - 1; index >= 0; index -= 1) {
    const request = approvals[index];
    if (request.explanationPending !== false && !request.explanation?.trim()) {
      return request.id;
    }
  }
  return undefined;
}
