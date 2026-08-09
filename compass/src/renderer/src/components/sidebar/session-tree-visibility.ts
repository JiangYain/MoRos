import { useCallback, useEffect, useReducer } from "react";
import type { ClientGroup } from "./session-tree-model.ts";

export interface SessionTreeVisibilityState {
  clientsCollapsed: boolean;
  collapsedClients: Record<string, boolean>;
  revealedClients: Record<string, boolean>;
}

export type SessionTreeVisibilityEvent =
  | { type: "client/toggle"; clientId: string }
  | { type: "reveal/ensure"; clientId: string }
  | { type: "reveal/toggle"; clientId: string }
  | { type: "section/toggle" };

export const INITIAL_SESSION_TREE_VISIBILITY: SessionTreeVisibilityState = {
  clientsCollapsed: false,
  collapsedClients: {},
  revealedClients: {},
};

export function sessionTreeVisibilityReducer(
  state: SessionTreeVisibilityState,
  event: SessionTreeVisibilityEvent,
): SessionTreeVisibilityState {
  switch (event.type) {
    case "client/toggle":
      return {
        ...state,
        collapsedClients: {
          ...state.collapsedClients,
          [event.clientId]: !state.collapsedClients[event.clientId],
        },
      };
    case "reveal/ensure":
      return state.revealedClients[event.clientId]
        ? state
        : {
            ...state,
            revealedClients: { ...state.revealedClients, [event.clientId]: true },
          };
    case "reveal/toggle":
      return {
        ...state,
        revealedClients: {
          ...state.revealedClients,
          [event.clientId]: !state.revealedClients[event.clientId],
        },
      };
    case "section/toggle":
      return { ...state, clientsCollapsed: !state.clientsCollapsed };
  }
}

export interface SessionTreeVisibility {
  state: SessionTreeVisibilityState;
  toggleClient(clientId: string): void;
  toggleRevealed(clientId: string): void;
  toggleSection(): void;
}

export function useSessionTreeVisibility(
  groups: ClientGroup[],
  activeSessionId: string | undefined,
  previewLimit: number,
): SessionTreeVisibility {
  const [state, dispatch] = useReducer(
    sessionTreeVisibilityReducer,
    INITIAL_SESSION_TREE_VISIBILITY,
  );

  useEffect(() => {
    if (!activeSessionId) return;
    const group = groups.find((candidate) => (
      candidate.sessions.some((session) => session.id === activeSessionId)
    ));
    if (group && group.sessions.findIndex((session) => session.id === activeSessionId) >= previewLimit) {
      dispatch({ type: "reveal/ensure", clientId: group.id });
    }
  }, [activeSessionId, groups, previewLimit]);

  return {
    state,
    toggleSection: useCallback(() => dispatch({ type: "section/toggle" }), []),
    toggleClient: useCallback((clientId) => dispatch({ type: "client/toggle", clientId }), []),
    toggleRevealed: useCallback((clientId) => dispatch({ type: "reveal/toggle", clientId }), []),
  };
}
