import { useCallback, useMemo, useReducer, useState } from "react";
import { ignoreCommandFailure } from "../../store.ts";
import {
  buildSessionDropPlan,
  commitSessionDrop,
  INITIAL_SESSION_DRAG_STATE,
  type DraggedSession,
  reorderSessionWithinGroup,
  type SessionDragState,
  sessionDragReducer,
  type SessionOwnershipCommands,
} from "./session-tree-ordering-state.ts";
import {
  type ClientGroup,
  type SessionOrderByClient,
  orderSessions,
  readSessionOrder,
  SESSION_ORDER_STORAGE_KEY,
} from "./session-tree-model.ts";

export type { DraggedSession, SessionOwnershipCommands } from "./session-tree-ordering-state.ts";

export interface SessionTreeOrdering {
  drag: SessionDragState;
  drop(group: ClientGroup, beforeSessionId?: string): void;
  enterClient(clientId: string): void;
  finishDrag(): void;
  groups: ClientGroup[];
  leaveClient(clientId: string): void;
  reorder(group: ClientGroup, sessionId: string, beforeSessionId: string): void;
  startDrag(dragged: DraggedSession): void;
}

export function useSessionTreeOrdering(
  groups: ClientGroup[],
  commands: SessionOwnershipCommands,
): SessionTreeOrdering {
  const [order, setOrder] = useState<SessionOrderByClient>(readSessionOrder);
  const [drag, dispatchDrag] = useReducer(sessionDragReducer, INITIAL_SESSION_DRAG_STATE);
  const orderedGroups = useMemo(
    () => groups.map((group) => ({
      ...group,
      sessions: orderSessions(group.sessions, order[group.id]),
    })),
    [groups, order],
  );

  const persist = useCallback((nextOrder: SessionOrderByClient): void => {
    setOrder(nextOrder);
    try {
      window.localStorage.setItem(SESSION_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
    } catch {
      // The current window still keeps the ordering when storage is unavailable.
    }
  }, []);
  const startDrag = useCallback((dragged: DraggedSession) => {
    dispatchDrag({ type: "start", dragged });
  }, []);
  const enterClient = useCallback((clientId: string) => {
    dispatchDrag({ type: "over", clientId });
  }, []);
  const leaveClient = useCallback((clientId: string) => {
    dispatchDrag({ type: "leave", clientId });
  }, []);
  const finishDrag = useCallback(() => dispatchDrag({ type: "finish" }), []);
  const drop = useCallback((target: ClientGroup, beforeSessionId?: string): void => {
    if (!drag.dragged) return;
    const plan = buildSessionDropPlan({
      beforeSessionId,
      dragged: drag.dragged,
      groups: orderedGroups,
      order,
      target,
    });
    ignoreCommandFailure(commitSessionDrop(plan, commands, persist).finally(finishDrag));
  }, [commands, drag.dragged, finishDrag, order, orderedGroups, persist]);
  const reorder = useCallback((
    group: ClientGroup,
    sessionId: string,
    beforeSessionId: string,
  ): void => {
    const nextOrder = reorderSessionWithinGroup(group, sessionId, beforeSessionId, order);
    if (nextOrder) persist(nextOrder);
  }, [order, persist]);

  return useMemo(() => ({
    groups: orderedGroups,
    drag,
    startDrag,
    enterClient,
    leaveClient,
    finishDrag,
    reorder,
    drop,
  }), [
    drag,
    drop,
    enterClient,
    finishDrag,
    leaveClient,
    orderedGroups,
    reorder,
    startDrag,
  ]);
}
