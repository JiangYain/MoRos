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

export interface SessionTreeClientMenu {
  clientName: string;
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
  clientDeleteName: string | null;
  clientDialogOpen: boolean;
  clientMenu: SessionTreeClientMenu | null;
  clientMenuPosition: SessionTreeMenuPosition | null;
  confirmations: ThreadConfirmations;
  menu: SessionTreeMenu | null;
  menuPosition: SessionTreeMenuPosition | null;
  rename: SessionRenameState | null;
}

export const INITIAL_SESSION_TREE_INTERACTION_STATE: SessionTreeInteractionState = {
  clientDeleteName: null,
  clientDialogOpen: false,
  clientMenu: null,
  clientMenuPosition: null,
  confirmations: {},
  menu: null,
  menuPosition: null,
  rename: null,
};

export type SessionTreeInteractionEvent =
  | { type: "client-delete/close" }
  | { type: "client-delete/request"; clientName: string }
  | { type: "client-dialog/set"; open: boolean }
  | { type: "client-menu/close" }
  | { type: "client-menu/open"; menu: SessionTreeClientMenu }
  | { type: "client-menu/position"; position: SessionTreeMenuPosition }
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
    case "client-delete/close":
      return state.clientDeleteName === null ? state : { ...state, clientDeleteName: null };
    case "client-delete/request":
      return { ...state, clientDeleteName: event.clientName };
    case "client-dialog/set":
      return state.clientDialogOpen === event.open
        ? state
        : { ...state, clientDialogOpen: event.open };
    case "client-menu/close":
      return state.clientMenu || state.clientMenuPosition
        ? { ...state, clientMenu: null, clientMenuPosition: null }
        : state;
    case "client-menu/open":
      return { ...state, clientMenu: event.menu, clientMenuPosition: null };
    case "client-menu/position":
      return state.clientMenu ? { ...state, clientMenuPosition: event.position } : state;
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
