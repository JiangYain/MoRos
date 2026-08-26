import type { UiSessionInfo } from "../../../../shared/types.ts";
import {
  type ThreadConfirmationEvent,
  type ThreadConfirmations,
  threadConfirmationsReducer,
} from "../thread-confirmation.ts";

export interface SessionTreeMenu {
  alignRight: boolean;
  session: UiSessionInfo;
  x: number;
  y: number;
}

export interface SessionTreeMenuPosition {
  left: number;
  top: number;
}

export interface SessionRenameState {
  draft: string;
  path: string;
}

export interface SessionTreeInteractionState {
  confirmations: ThreadConfirmations;
  menu: SessionTreeMenu | null;
  menuPosition: SessionTreeMenuPosition | null;
  rename: SessionRenameState | null;
}

export const INITIAL_SESSION_TREE_INTERACTION_STATE: SessionTreeInteractionState = {
  confirmations: {},
  menu: null,
  menuPosition: null,
  rename: null,
};

export type SessionTreeInteractionEvent =
  | { type: "confirmation"; event: ThreadConfirmationEvent }
  | { type: "menu/close" }
  | { type: "menu/open"; menu: SessionTreeMenu }
  | { type: "menu/position"; position: SessionTreeMenuPosition }
  | { type: "rename/begin"; path: string; draft: string }
  | { type: "rename/cancel" }
  | { type: "rename/change"; draft: string }
  | { type: "rename/complete"; path: string };

export function sessionTreeInteractionReducer(
  state: SessionTreeInteractionState,
  event: SessionTreeInteractionEvent,
): SessionTreeInteractionState {
  switch (event.type) {
    case "confirmation": {
      const confirmations = threadConfirmationsReducer(state.confirmations, event.event);
      return confirmations === state.confirmations ? state : { ...state, confirmations };
    }
    case "menu/close":
      return state.menu || state.menuPosition
        ? { ...state, menu: null, menuPosition: null }
        : state;
    case "menu/open":
      return { ...state, menu: event.menu, menuPosition: null };
    case "menu/position":
      return state.menu ? { ...state, menuPosition: event.position } : state;
    case "rename/begin":
      return { ...state, rename: { path: event.path, draft: event.draft } };
    case "rename/cancel":
      return state.rename ? { ...state, rename: null } : state;
    case "rename/change":
      return state.rename ? { ...state, rename: { ...state.rename, draft: event.draft } } : state;
    case "rename/complete":
      return state.rename?.path === event.path ? { ...state, rename: null } : state;
  }
}
