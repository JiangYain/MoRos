import type { WorkbenchFeedback } from "../../../shared/workbench.ts";

export function mergePendingFeedback(saved: WorkbenchFeedback[] = [], recalled: WorkbenchFeedback[] = []): WorkbenchFeedback[] {
  return [...new Map([...saved, ...recalled].map((item) => [item.id, item])).values()];
}

export function selectPendingFeedback(saved: WorkbenchFeedback[], recalled: WorkbenchFeedback[], ids: string[]) {
  const recalledIds = new Set(recalled.map((item) => item.id));
  return {
    feedback: mergePendingFeedback(saved, recalled).filter((item) => ids.includes(item.id)),
    savedIds: ids.filter((id) => !recalledIds.has(id)),
    recalled: recalled.filter((item) => ids.includes(item.id)),
  };
}
