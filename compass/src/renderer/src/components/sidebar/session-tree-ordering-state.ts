import type { ClientGroup, SessionOrderByClient } from "./session-tree-model.ts";

export interface DraggedSession {
  clientId: string;
  sessionId: string;
}

export interface SessionDragState {
  dragged: DraggedSession | null;
  overClientId: string | null;
}

export type SessionDragEvent =
  | { type: "finish" }
  | { type: "leave"; clientId: string }
  | { type: "over"; clientId: string }
  | { type: "start"; dragged: DraggedSession };

export const INITIAL_SESSION_DRAG_STATE: SessionDragState = {
  dragged: null,
  overClientId: null,
};

export function sessionDragReducer(
  state: SessionDragState,
  event: SessionDragEvent,
): SessionDragState {
  switch (event.type) {
    case "start":
      return { dragged: event.dragged, overClientId: null };
    case "over":
      return state.dragged && state.overClientId !== event.clientId
        ? { ...state, overClientId: event.clientId }
        : state;
    case "leave":
      return state.overClientId === event.clientId ? { ...state, overClientId: null } : state;
    case "finish":
      return state.dragged || state.overClientId ? INITIAL_SESSION_DRAG_STATE : state;
  }
}

export type SessionOwnershipChange =
  | { type: "assign"; clientName: string; sessionId: string }
  | { type: "unassign"; sessionId: string };

export interface SessionDropPlan {
  nextOrder: SessionOrderByClient;
  ownership: SessionOwnershipChange | null;
}

interface BuildSessionDropPlanInput {
  beforeSessionId?: string;
  dragged: DraggedSession;
  groups: ClientGroup[];
  order: SessionOrderByClient;
  target: ClientGroup;
}

export function buildSessionDropPlan({
  beforeSessionId,
  dragged,
  groups,
  order,
  target,
}: BuildSessionDropPlanInput): SessionDropPlan {
  const targetIds = target.sessions
    .map((session) => session.id)
    .filter((sessionId) => sessionId !== dragged.sessionId);
  const targetIndex = beforeSessionId ? targetIds.indexOf(beforeSessionId) : -1;
  if (targetIndex >= 0) targetIds.splice(targetIndex, 0, dragged.sessionId);
  else targetIds.push(dragged.sessionId);

  const nextOrder = { ...order, [target.id]: targetIds };
  if (dragged.clientId === target.id) return { nextOrder, ownership: null };

  const source = groups.find((group) => group.id === dragged.clientId);
  if (source) {
    nextOrder[source.id] = source.sessions
      .map((session) => session.id)
      .filter((sessionId) => sessionId !== dragged.sessionId);
  }
  return {
    nextOrder,
    ownership: target.unassigned
      ? { type: "unassign", sessionId: dragged.sessionId }
      : { type: "assign", sessionId: dragged.sessionId, clientName: target.name },
  };
}

export interface SessionOwnershipCommands {
  assign(sessionId: string, clientName: string): Promise<void>;
  unassign(sessionId: string): Promise<void>;
}

export async function commitSessionDrop(
  plan: SessionDropPlan,
  commands: SessionOwnershipCommands,
  persist: (order: SessionOrderByClient) => void,
): Promise<void> {
  if (plan.ownership?.type === "assign") {
    await commands.assign(plan.ownership.sessionId, plan.ownership.clientName);
  } else if (plan.ownership?.type === "unassign") {
    await commands.unassign(plan.ownership.sessionId);
  }
  persist(plan.nextOrder);
}

export function reorderSessionWithinGroup(
  group: ClientGroup,
  sessionId: string,
  beforeSessionId: string,
  order: SessionOrderByClient,
): SessionOrderByClient | null {
  if (sessionId === beforeSessionId) return null;
  const ids = group.sessions.map((session) => session.id);
  const from = ids.indexOf(sessionId);
  const target = ids.indexOf(beforeSessionId);
  if (from < 0 || target < 0) return null;
  ids.splice(from, 1);
  ids.splice(target, 0, sessionId);
  return { ...order, [group.id]: ids };
}
