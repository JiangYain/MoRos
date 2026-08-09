import type { AppLanguage, UiSessionInfo } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useI18n } from "../../i18n.ts";
import { ignoreCommandFailure, useCompass } from "../../store.ts";
import type { ClientProfileDraft } from "../client-registry.ts";
import { clientRegistryKey } from "../client-registry.ts";
import type { ThreadConfirmationAction, ThreadConfirmationState } from "../thread-confirmation.ts";
import { runSessionConfirmationCommand } from "./session-confirmation-command.ts";
import type { SessionTreeInteractions } from "./session-tree-interactions.ts";
import type { SessionOwnershipCommands } from "./session-tree-ordering.ts";
import {
  type ClientGroup,
  groupSessionsByClient,
  inferClient,
  sessionTitle,
} from "./session-tree-model.ts";

export interface SessionTreeSessionActions {
  beginRename(session: UiSessionInfo): void;
  commitRename(path: string): void;
  confirm(confirmation: ThreadConfirmationState): void;
  copySessionId(session: UiSessionInfo): void;
  create(group: ClientGroup): void;
  open(session: UiSessionInfo, active: boolean): void;
  requestConfirmation(session: UiSessionInfo, action: ThreadConfirmationAction): void;
  saveClient(profile: ClientProfileDraft): void;
}

export interface SessionTreeStore {
  actions: SessionTreeSessionActions;
  activeSessionId?: string;
  availableClients: string[];
  groups: ClientGroup[];
  language: AppLanguage;
  ownership: SessionOwnershipCommands;
}

export function useSessionTreeStore(
  interactions: SessionTreeInteractions,
): SessionTreeStore {
  const { language, t } = useI18n();
  const sessions = useCompass((state) => state.sessions);
  const activeSessionId = useCompass((state) => state.stats?.sessionId);
  const clientRegistry = useCompass((state) => state.clientRegistry);
  const newSession = useCompass((state) => state.newSession);
  const openSession = useCompass((state) => state.openSession);
  const renameSession = useCompass((state) => state.renameSession);
  const deleteSession = useCompass((state) => state.deleteSession);
  const archiveSession = useCompass((state) => state.archiveSession);
  const saveClientProfile = useCompass((state) => state.saveClientProfile);
  const assignSessionClient = useCompass((state) => state.assignSessionClient);
  const unassignSessionClient = useCompass((state) => state.unassignSessionClient);
  const setError = useCompass((state) => state.setError);
  const setSidebarOpen = useCompass((state) => state.setSidebarOpen);
  const setMainView = useCompass((state) => state.setMainView);
  const migratedAssignments = useRef(new Set<string>());
  const groups = useMemo(
    () => groupSessionsByClient(sessions, clientRegistry),
    [clientRegistry, sessions],
  );
  const availableClients = useMemo(
    () => groups.filter((group) => !group.unassigned).map((group) => group.name),
    [groups],
  );

  useEffect(() => {
    const knownClients = new Map(
      clientRegistry.clients.map((name) => [clientRegistryKey(name), name]),
    );
    for (const session of sessions) {
      if (clientRegistry.assignments[session.id] || migratedAssignments.current.has(session.id)) continue;
      const inferred = inferClient(session, clientRegistry);
      const knownName = inferred.unassigned
        ? undefined
        : knownClients.get(clientRegistryKey(inferred.name));
      if (!knownName) continue;
      migratedAssignments.current.add(session.id);
      void assignSessionClient(session.id, knownName).catch(() => {
        migratedAssignments.current.delete(session.id);
      });
    }
  }, [assignSessionClient, clientRegistry, sessions]);

  const closeMobile = useCallback((): void => {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
  }, [setSidebarOpen]);
  const beginRename = useCallback((session: UiSessionInfo): void => {
    interactions.rename.start(
      session.path,
      sessionTitle(session, t("common.untitledSession")),
    );
    interactions.menu.close();
  }, [interactions.menu, interactions.rename, t]);
  const commitRename = useCallback((path: string): void => {
    const rename = interactions.rename.state;
    if (!rename || rename.path !== path) return;
    const name = rename.draft.trim();
    if (!name) {
      setError(t("sidebar.renameEmpty"));
      requestAnimationFrame(() => interactions.rename.inputRef.current?.focus());
      return;
    }
    setError(null);
    ignoreCommandFailure(renameSession(path, name).then(() => interactions.rename.complete(path)));
  }, [interactions.rename, renameSession, setError, t]);
  const confirm = useCallback((confirmation: ThreadConfirmationState): void => {
    ignoreCommandFailure(runSessionConfirmationCommand(
      confirmation,
      { archive: archiveSession, delete: deleteSession },
      interactions.confirmations,
    ));
  }, [archiveSession, deleteSession, interactions.confirmations]);
  const create = useCallback((group: ClientGroup): void => {
    closeMobile();
    ignoreCommandFailure((async () => {
      const created = await newSession();
      if (!created || group.unassigned) return;
      const sessionId = useCompass.getState().stats?.sessionId;
      if (sessionId) await assignSessionClient(sessionId, group.name);
    })());
  }, [assignSessionClient, closeMobile, newSession]);
  const open = useCallback((session: UiSessionInfo, active: boolean): void => {
    closeMobile();
    if (active) setMainView("assistant");
    else ignoreCommandFailure(openSession(session.path));
  }, [closeMobile, openSession, setMainView]);
  const requestConfirmation = useCallback((
    session: UiSessionInfo,
    action: ThreadConfirmationAction,
  ): void => {
    interactions.menu.close();
    interactions.confirmations.request(session.path, action);
  }, [interactions.confirmations, interactions.menu]);
  const copySessionId = useCallback((session: UiSessionInfo): void => {
    void navigator.clipboard.writeText(session.id)
      .catch(() => setError(t("sidebar.copyIdFailed")))
      .finally(interactions.menu.close);
  }, [interactions.menu.close, setError, t]);
  const saveClient = useCallback((profile: ClientProfileDraft): void => {
    ignoreCommandFailure(saveClientProfile(profile).then(interactions.clientDialog.close));
  }, [interactions.clientDialog.close, saveClientProfile]);
  const ownership = useMemo<SessionOwnershipCommands>(() => ({
    assign: assignSessionClient,
    unassign: unassignSessionClient,
  }), [assignSessionClient, unassignSessionClient]);
  const actions = useMemo<SessionTreeSessionActions>(() => ({
    beginRename,
    commitRename,
    confirm,
    copySessionId,
    create,
    open,
    requestConfirmation,
    saveClient,
  }), [
    beginRename,
    commitRename,
    confirm,
    copySessionId,
    create,
    open,
    requestConfirmation,
    saveClient,
  ]);

  return {
    actions,
    activeSessionId,
    availableClients,
    groups,
    language,
    ownership,
  };
}
