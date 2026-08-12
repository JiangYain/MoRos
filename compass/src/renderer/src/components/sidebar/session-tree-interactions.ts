import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import {
  type ThreadConfirmationAction,
  type ThreadConfirmations,
  type ThreadConfirmationState,
} from "../thread-confirmation.ts";
import {
  INITIAL_SESSION_TREE_INTERACTION_STATE,
  type SessionRenameState,
  type SessionTreeClientMenu,
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

export interface ClientDialogInteraction {
  close(): void;
  open(): void;
  visible: boolean;
}

export interface ClientMenuInteraction {
  close(): void;
  open(menu: SessionTreeClientMenu): void;
  position: SessionTreeMenuPosition | null;
  ref: React.RefObject<HTMLDivElement | null>;
  state: SessionTreeClientMenu | null;
}

export interface ClientDeleteInteraction {
  clientName: string | null;
  close(): void;
  request(clientName: string): void;
}

export interface SessionTreeInteractions {
  clientDelete: ClientDeleteInteraction;
  clientDialog: ClientDialogInteraction;
  clientMenu: ClientMenuInteraction;
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
  const clientMenuRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    if (!state.clientMenu || !clientMenuRef.current) return;
    const padding = 8;
    const bounds = clientMenuRef.current.getBoundingClientRect();
    dispatch({
      type: "client-menu/position",
      position: {
        left: Math.max(padding, Math.min(state.clientMenu.x, window.innerWidth - bounds.width - padding)),
        top: Math.max(padding, Math.min(state.clientMenu.y, window.innerHeight - bounds.height - padding)),
      },
    });
  }, [state.clientMenu]);

  useEffect(() => {
    const closeMenus = (): void => {
      dispatch({ type: "menu/close" });
      dispatch({ type: "client-menu/close" });
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      closeMenus();
      dispatch({ type: "client-delete/close" });
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
  const openClientMenu = useCallback((menu: SessionTreeClientMenu) => {
    dispatch({ type: "client-menu/open", menu });
  }, []);
  const closeClientMenu = useCallback(() => dispatch({ type: "client-menu/close" }), []);
  const openClientDialog = useCallback(() => {
    dispatch({ type: "client-dialog/set", open: true });
  }, []);
  const closeClientDialog = useCallback(() => {
    dispatch({ type: "client-dialog/set", open: false });
  }, []);
  const requestClientDelete = useCallback((clientName: string) => {
    dispatch({ type: "client-delete/request", clientName });
  }, []);
  const closeClientDelete = useCallback(() => dispatch({ type: "client-delete/close" }), []);

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
  const clientMenu = useMemo<ClientMenuInteraction>(() => ({
    state: state.clientMenu,
    position: state.clientMenuPosition,
    ref: clientMenuRef,
    open: openClientMenu,
    close: closeClientMenu,
  }), [closeClientMenu, openClientMenu, state.clientMenu, state.clientMenuPosition]);
  const clientDialog = useMemo<ClientDialogInteraction>(() => ({
    visible: state.clientDialogOpen,
    open: openClientDialog,
    close: closeClientDialog,
  }), [closeClientDialog, openClientDialog, state.clientDialogOpen]);
  const clientDelete = useMemo<ClientDeleteInteraction>(() => ({
    clientName: state.clientDeleteName,
    request: requestClientDelete,
    close: closeClientDelete,
  }), [closeClientDelete, requestClientDelete, state.clientDeleteName]);

  return useMemo(() => ({ rename, confirmations, menu, clientMenu, clientDialog, clientDelete }), [
    clientDelete,
    clientDialog,
    clientMenu,
    confirmations,
    menu,
    rename,
  ]);
}
