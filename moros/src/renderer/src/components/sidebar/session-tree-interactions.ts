import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import {
  type ThreadConfirmationAction,
  type ThreadConfirmations,
  type ThreadConfirmationState,
} from "../thread-confirmation.ts";
import {
  INITIAL_SESSION_TREE_INTERACTION_STATE,
  type SessionRenameState,
  type SessionTreeMenu,
  type SessionTreeMenuPosition,
  sessionTreeInteractionReducer,
} from "./session-tree-interaction-state.ts";

export interface RenameInteraction {
  cancel(): void;
  complete(path: string): void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setDraft(draft: string): void;
  start(path: string, draft: string): void;
  state: SessionRenameState | null;
}

export interface ConfirmationInteraction {
  clear(confirmation: ThreadConfirmationState): void;
  fail(confirmation: ThreadConfirmationState): void;
  items: ThreadConfirmations;
  request(path: string, action: ThreadConfirmationAction): void;
  start(confirmation: ThreadConfirmationState): void;
}

export interface MenuInteraction {
  close(): void;
  open(menu: SessionTreeMenu): void;
  position: SessionTreeMenuPosition | null;
  ref: React.RefObject<HTMLDivElement | null>;
  state: SessionTreeMenu | null;
}

export interface SessionTreeInteractions {
  confirmations: ConfirmationInteraction;
  menu: MenuInteraction;
  rename: RenameInteraction;
}

export function useSessionTreeInteractions(): SessionTreeInteractions {
  const [state, dispatch] = useReducer(
    sessionTreeInteractionReducer,
    INITIAL_SESSION_TREE_INTERACTION_STATE,
  );
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!state.menu || !menuRef.current) return;
    const padding = 8;
    const bounds = menuRef.current.getBoundingClientRect();
    const preferredLeft = state.menu.alignRight ? state.menu.x - bounds.width : state.menu.x;
    dispatch({
      type: "menu/position",
      position: {
        left: Math.max(padding, Math.min(preferredLeft, window.innerWidth - bounds.width - padding)),
        top: Math.max(padding, Math.min(state.menu.y, window.innerHeight - bounds.height - padding)),
      },
    });
  }, [state.menu]);

  useEffect(() => {
    const closeMenus = (): void => {
      dispatch({ type: "menu/close" });
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      closeMenus();
      dispatch({ type: "confirmation", event: { type: "clear-idle" } });
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const startRename = useCallback((path: string, draft: string) => {
    dispatch({ type: "rename/begin", path, draft });
  }, []);
  const setRenameDraft = useCallback((draft: string) => {
    dispatch({ type: "rename/change", draft });
  }, []);
  const cancelRename = useCallback(() => dispatch({ type: "rename/cancel" }), []);
  const completeRename = useCallback((path: string) => {
    dispatch({ type: "rename/complete", path });
  }, []);
  const requestConfirmation = useCallback((path: string, action: ThreadConfirmationAction) => {
    dispatch({ type: "confirmation", event: { type: "request", path, action } });
  }, []);
  const startConfirmation = useCallback((confirmation: ThreadConfirmationState) => {
    dispatch({
      type: "confirmation",
      event: { type: "start", path: confirmation.path, action: confirmation.action },
    });
  }, []);
  const clearConfirmation = useCallback((confirmation: ThreadConfirmationState) => {
    dispatch({
      type: "confirmation",
      event: { type: "clear", path: confirmation.path, action: confirmation.action },
    });
  }, []);
  const failConfirmation = useCallback((confirmation: ThreadConfirmationState) => {
    dispatch({
      type: "confirmation",
      event: { type: "fail", path: confirmation.path, action: confirmation.action },
    });
  }, []);
  const openMenu = useCallback((menu: SessionTreeMenu) => {
    dispatch({ type: "menu/open", menu });
  }, []);
  const closeMenu = useCallback(() => dispatch({ type: "menu/close" }), []);
  const rename = useMemo<RenameInteraction>(() => ({
    state: state.rename,
    inputRef: renameInputRef,
    start: startRename,
    setDraft: setRenameDraft,
    cancel: cancelRename,
    complete: completeRename,
  }), [cancelRename, completeRename, setRenameDraft, startRename, state.rename]);
  const confirmations = useMemo<ConfirmationInteraction>(() => ({
    items: state.confirmations,
    request: requestConfirmation,
    start: startConfirmation,
    fail: failConfirmation,
    clear: clearConfirmation,
  }), [clearConfirmation, failConfirmation, requestConfirmation, startConfirmation, state.confirmations]);
  const menu = useMemo<MenuInteraction>(() => ({
    state: state.menu,
    position: state.menuPosition,
    ref: menuRef,
    open: openMenu,
    close: closeMenu,
  }), [closeMenu, openMenu, state.menu, state.menuPosition]);
  return useMemo(() => ({ rename, confirmations, menu }), [
    confirmations,
    menu,
    rename,
  ]);
}
