import { modelSelectionKey } from "../../../shared/types.ts";
import { clientRegistryKey } from "../../../shared/client-registry.ts";
import type { StoreApi } from "zustand/vanilla";
import { api, clearPendingAgentEvents } from "../ipc.ts";
import {
  rollbackEnabledModelKeys,
  updateEnabledModelKeys,
} from "../model-preference-update.ts";
import { appendOptimisticUser } from "../optimistic-session.ts";
import type { StoreCommandRunner } from "./command.ts";
import { ignoreCommandFailure, requireCommandSuccess } from "./command.ts";
import {
  clearLegacyClientRegistry,
  loadLegacyClientRegistry,
} from "./profile-persistence.ts";
import type { CompassState } from "./state.ts";

export type CompassCommandMessageKey =
  | "approvalInactive"
  | "commandFailed"
  | "noModel";

type CompassCommandActions = Pick<
  CompassState,
  | "abort"
  | "addSkillDir"
  | "archiveSession"
  | "assignSessionClient"
  | "boot"
  | "cancelDependencyInstall"
  | "deleteClientProfile"
  | "deleteSession"
  | "installDependency"
  | "listArchivedSessions"
  | "listClientAudiograms"
  | "loginProvider"
  | "newSession"
  | "openPath"
  | "openDependencySource"
  | "openSession"
  | "refreshDependencies"
  | "refreshSessions"
  | "removeApiKey"
  | "removeQueuedMessage"
  | "removeSkillDir"
  | "renameSession"
  | "resetDependencyExecutable"
  | "resolveApproval"
  | "restoreArchivedSession"
  | "runPrerequisiteAction"
  | "saveClientAudiogram"
  | "saveClientProfile"
  | "selectDependencyExecutable"
  | "send"
  | "setApiKey"
  | "setCommandExplanationLanguage"
  | "setComposerSendKey"
  | "setLanguage"
  | "setModel"
  | "setModelEnabled"
  | "setPermissionMode"
  | "setQuickPrompts"
  | "setSkillEnabled"
  | "setSummaryModel"
  | "setThinkingLevel"
  | "setWorkspaceDir"
  | "unassignSessionClient"
  | "updateClientProfile"
>;

interface CompassCommandOptions {
  get: StoreApi<CompassState>["getState"];
  message(key: CompassCommandMessageKey): string;
  runCommand: StoreCommandRunner;
  sanitizeError(error: unknown): string;
  set: StoreApi<CompassState>["setState"];
}

function clientMessageId(): string {
  return typeof crypto.randomUUID === "function"
    ? `user-${crypto.randomUUID()}`
    : `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCompassCommandActions({
  get,
  message,
  runCommand,
  sanitizeError,
  set,
}: CompassCommandOptions): CompassCommandActions {
  return {
    boot: async () => {
      await runCommand(async () => {
        const payload = await api.init();
        get().applyInit(payload);
      });
      const legacyRegistry = loadLegacyClientRegistry();
      if (legacyRegistry) {
        // Migration is retryable and must not prevent the initialized renderer
        // from subscribing to live events.
        ignoreCommandFailure(runCommand(async () => {
          const clientRegistry = await api.importLegacyClientRegistry(legacyRegistry);
          set({ clientRegistry });
          clearLegacyClientRegistry();
        }));
      }
    },

    send: async (text, images) => {
      const state = get();
      if (!state.stats?.model || !state.stats.modelAuthConfigured) {
        const noModelError = message("noModel");
        set({ lastError: noModelError });
        throw new Error(noModelError);
      }
      const id = clientMessageId();
      const ts = Date.now();
      const optimistic = appendOptimisticUser({
        id,
        images,
        sessions: state.sessions,
        stats: state.stats,
        text,
        thread: state.thread,
        ts,
      });
      const hadActiveSession = state.sessions.some(
        (session) => session.id === state.stats?.sessionId || session.path === state.stats?.sessionPath,
      );
      set({
        thread: optimistic.thread,
        sessions: optimistic.sessions,
        lastError: null,
      });
      try {
        const result = await api.prompt(text, images, id);
        requireCommandSuccess(result, "Compass could not send this message.");
      } catch (error) {
        clearPendingAgentEvents();
        const reported = sanitizeError(error);
        set((current) => ({
          thread: current.thread.filter((item) => item.id !== id),
          sessions: hadActiveSession
            ? current.sessions
            : current.sessions.filter((session) => session.id !== state.stats?.sessionId),
          lastError: reported,
        }));
        throw new Error(reported);
      }
    },

    abort: () => {
      clearPendingAgentEvents();
      return runCommand(async () => {
        await api.abort();
      });
    },

    removeQueuedMessage: async (kind, index, text) => {
      try {
        await runCommand(async () => {
          const result = await api.removeQueuedMessage(kind, index, text);
          requireCommandSuccess(result, message("commandFailed"));
        });
        return true;
      } catch {
        // runCommand already surfaced the failure through lastError; callers
        // only need to know whether the draft backfill may proceed.
        return false;
      }
    },

    newSession: async () => {
      clearPendingAgentEvents();
      try {
        const payload = await api.newSession();
        set({ mainView: "assistant" });
        get().applyInit(payload);
        return true;
      } catch (error) {
        set({ lastError: sanitizeError(error) });
        return false;
      }
    },

    openSession: async (path) => {
      clearPendingAgentEvents();
      try {
        const payload = await api.openSession(path);
        set({ mainView: "assistant" });
        get().applyInit(payload);
        return true;
      } catch (error) {
        set({ lastError: sanitizeError(error) });
        return false;
      }
    },

    refreshSessions: () => runCommand(async () => {
      const sessions = await api.listSessions();
      set({ sessions });
    }),

    renameSession: (path, name) => runCommand(async () => {
      const result = await api.renameSession(path, name);
      requireCommandSuccess(result, message("commandFailed"));
      await get().refreshSessions();
    }),

    deleteSession: (path) => runCommand(async () => {
      const result = await api.deleteSession(path);
      requireCommandSuccess(result, message("commandFailed"));
      const payload = await api.init();
      get().applyInit(payload);
    }),

    archiveSession: (path) => runCommand(async () => {
      const result = await api.archiveSession(path);
      requireCommandSuccess(result, message("commandFailed"));
      const payload = await api.init();
      get().applyInit(payload);
    }),

    listArchivedSessions: () => runCommand(() => api.listArchivedSessions()),

    restoreArchivedSession: (path) => runCommand(async () => {
      // A successful restore emits sessions-changed from the main process,
      // which already refreshes the sidebar session list.
      const result = await api.restoreArchivedSession(path);
      requireCommandSuccess(result, message("commandFailed"));
    }),

    saveClientProfile: (profile) => runCommand(async () => {
      const clientRegistry = await api.saveClientProfile(profile);
      set({ clientRegistry });
    }),

    updateClientProfile: (originalName, profile) => runCommand(async () => {
      const clientRegistry = await api.updateClientProfile(originalName, profile);
      set((current) => ({
        clientRegistry,
        // Follow a rename so the hearing health workspace keeps showing the client.
        hearingHealthClient: current.hearingHealthClient
          && clientRegistryKey(current.hearingHealthClient) === clientRegistryKey(originalName)
          ? profile.name
          : current.hearingHealthClient,
      }));
    }),

    deleteClientProfile: (name) => runCommand(async () => {
      const clientRegistry = await api.deleteClientProfile(name);
      set((current) => ({
        clientRegistry,
        hearingHealthClient: current.hearingHealthClient
          && clientRegistryKey(current.hearingHealthClient) === clientRegistryKey(name)
          ? null
          : current.hearingHealthClient,
      }));
    }),

    assignSessionClient: (sessionId, clientName) => runCommand(async () => {
      const clientRegistry = await api.assignSessionClient(sessionId, clientName);
      set({ clientRegistry });
    }),

    unassignSessionClient: (sessionId) => runCommand(async () => {
      const clientRegistry = await api.unassignSessionClient(sessionId);
      set({ clientRegistry });
    }),

    listClientAudiograms: (clientName) => runCommand(() => api.listClientAudiograms(clientName)),

    saveClientAudiogram: (clientName, record) => runCommand(
      () => api.saveClientAudiogram(clientName, record),
    ),

    setModel: (provider, id) => runCommand(async () => {
      const result = await api.setModel(provider, id);
      requireCommandSuccess(result, message("commandFailed"));
    }),

    resolveApproval: (id, allowed, scope) => runCommand(async () => {
      const result = await api.resolveApproval(id, allowed, scope);
      requireCommandSuccess(result, message("approvalInactive"));
    }),

    setModelEnabled: (provider, id, enabled) => runCommand(async () => {
      const modelKey = modelSelectionKey(provider, id);
      const previousSettings = get().settings;
      if (!previousSettings) return;
      const previousEnabled = previousSettings.enabledModels.includes(modelKey);
      if (previousEnabled === enabled) return;

      set({
        settings: {
          ...previousSettings,
          enabledModels: updateEnabledModelKeys(
            previousSettings.enabledModels,
            modelKey,
            enabled,
          ),
        },
      });

      try {
        // A state-refresh may arrive before this RPC resolves; its snapshot is
        // authoritative, so only roll back if the optimistic value remains.
        await api.setModelEnabled(provider, id, enabled);
      } catch (error) {
        set((current) => ({
          settings: current.settings
            ? {
                ...current.settings,
                enabledModels: rollbackEnabledModelKeys(
                  current.settings.enabledModels,
                  modelKey,
                  enabled,
                  previousEnabled,
                ),
              }
            : current.settings,
        }));
        throw error;
      }
    }),

    setSummaryModel: (provider, id) => runCommand(async () => {
      const settings = await api.setSummaryModel(provider, id);
      set({ settings });
    }),

    setThinkingLevel: (level) => runCommand(async () => {
      const nextStats = await api.setThinkingLevel(level);
      set({ stats: nextStats });
    }),

    setPermissionMode: (mode) => runCommand(async () => {
      const settings = await api.setPermissionMode(mode);
      set({ settings });
    }),

    setLanguage: (language) => runCommand(async () => {
      const settings = await api.setLanguage(language);
      document.documentElement.lang = settings.language;
      set({ settings });
    }),

    setCommandExplanationLanguage: (language) => runCommand(async () => {
      const settings = await api.setCommandExplanationLanguage(language);
      set({ settings });
    }),

    setComposerSendKey: (sendKey) => runCommand(async () => {
      const settings = await api.setComposerSendKey(sendKey);
      set({ settings });
    }),

    setQuickPrompts: (prompts) => runCommand(async () => {
      const settings = await api.setQuickPrompts(prompts);
      set({ settings });
    }),

    setApiKey: (provider, key) => runCommand(async () => {
      const payload = await api.setApiKey(provider, key);
      set({ models: payload.models, providers: payload.providers, stats: payload.stats });
    }),

    loginProvider: (provider) => runCommand(async () => {
      const payload = await api.loginProvider(provider);
      set({ models: payload.models, providers: payload.providers, stats: payload.stats });
    }),

    removeApiKey: (provider) => runCommand(async () => {
      const payload = await api.removeApiKey(provider);
      set({ models: payload.models, providers: payload.providers, stats: payload.stats });
    }),

    runPrerequisiteAction: (actionId) => runCommand(async () => {
      const payload = await api.runPrerequisiteAction(actionId);
      set({ settings: payload.settings, prerequisites: payload.prerequisites });
    }),

    refreshDependencies: () => runCommand(async () => {
      const dependencies = await api.refreshDependencies();
      set({ dependencies });
    }),

    installDependency: (dependencyId, sessionId) => runCommand(async () => {
      const result = await api.installDependency(dependencyId, sessionId);
      requireCommandSuccess(result, message("commandFailed"));
    }),

    cancelDependencyInstall: (dependencyId) => runCommand(async () => {
      const result = await api.cancelDependencyInstall(dependencyId);
      requireCommandSuccess(result, message("commandFailed"));
    }),

    openPath: (path) => runCommand(async () => {
      await api.openPath(path);
    }),

    openDependencySource: (dependencyId) => runCommand(async () => {
      await api.openDependencySource(dependencyId);
    }),

    selectDependencyExecutable: (dependencyId, path) => runCommand(async () => {
      const dependencies = await api.selectDependencyExecutable(dependencyId, path);
      if (dependencies) set({ dependencies });
    }),

    resetDependencyExecutable: (dependencyId) => runCommand(async () => {
      const dependencies = await api.resetDependencyExecutable(dependencyId);
      set({ dependencies });
    }),

    setSkillEnabled: (name, enabled) => runCommand(async () => {
      const payload = await api.setSkillEnabled(name, enabled);
      set({ skills: payload.skills, settings: payload.settings });
    }),

    addSkillDir: () => runCommand(async () => {
      const payload = await api.addSkillDir();
      if (payload) get().applyInit(payload);
    }),

    removeSkillDir: (dir) => runCommand(async () => {
      const payload = await api.removeSkillDir(dir);
      get().applyInit(payload);
    }),

    setWorkspaceDir: () => {
      const changeWorkspaceDir = (): Promise<void> => runCommand(async () => {
        clearPendingAgentEvents();
        const payload = await api.setWorkspaceDir();
        if (payload) get().applyInit(payload);
      });
      if (!get().streaming) return changeWorkspaceDir();
      set({
        pendingWorkspaceChange: {
          proceed: () => {
            set({ pendingWorkspaceChange: null });
            // Nothing awaits the dialog; failures report via the error banner.
            ignoreCommandFailure(changeWorkspaceDir());
          },
          cancel: () => set({ pendingWorkspaceChange: null }),
        },
      });
      return Promise.resolve();
    },
  };
}
