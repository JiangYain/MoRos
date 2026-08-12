import type { AppLanguage } from "@shared/types";
import { isAppLanguage } from "@shared/types";
import { emptyClientRegistry } from "@shared/client-registry";
import { create } from "zustand";
import { clearPendingAgentEvents } from "./ipc";
import {
  projectAgentEvent,
  projectInitPayload,
} from "./store/agent-event-projection";
import {
  createStoreCommandRunner,
  ignoreCommandFailure,
} from "./store/command";
import { createCompassCommandActions } from "./store/commands";
import {
  loadProfileAvatar,
  loadProfileIdentity,
  persistProfileAvatar,
  persistProfileIdentity,
} from "./store/profile-persistence";
import { decideSettingsNavigation } from "./store/settings-navigation";
import type { CompassState, SettingsSection } from "./store/state";

export { ignoreCommandFailure } from "./store/command";
export type {
  CompassState,
  ComposerDraft,
  ComposerSeed,
  MainView,
  PendingSettingsNavigation,
  SettingsNavigationGuard,
  SettingsNavigationResolution,
  SettingsSection,
} from "./store/state";

type StoreMessageKey =
  | "avatarStorage"
  | "identityStorage"
  | "workspaceChange"
  | "noModel"
  | "approvalInactive"
  | "commandFailed";

const STORE_MESSAGES: Record<AppLanguage, Record<StoreMessageKey, string>> = {
  "zh-CN": {
    avatarStorage: "头像无法保存到本地存储。",
    identityStorage: "个人资料无法保存到本地存储。",
    workspaceChange: "当前任务仍在运行。更换工作区会中止本次任务，是否继续？",
    noModel: "请先在设置中配置 API Key，或切换到已配置的模型。",
    approvalInactive: "该批准请求已失效。",
    commandFailed: "操作失败，请重试。",
  },
  "zh-TW": {
    avatarStorage: "無法將頭像儲存到本機。",
    identityStorage: "無法將個人資料儲存到本機。",
    workspaceChange: "目前工作仍在執行。變更工作區會中止這項工作，是否繼續？",
    noModel: "請先在設定中配置 API Key，或切換到已配置的模型。",
    approvalInactive: "此核准請求已失效。",
    commandFailed: "操作失敗，請重試。",
  },
  en: {
    avatarStorage: "The avatar could not be saved locally.",
    identityStorage: "The profile could not be saved locally.",
    workspaceChange: "A task is still running. Changing the workspace will stop it. Continue?",
    noModel: "Configure an API key in Settings or switch to a configured model first.",
    approvalInactive: "This approval request is no longer active.",
    commandFailed: "The operation failed. Please try again.",
  },
  de: {
    avatarStorage: "Der Avatar konnte nicht lokal gespeichert werden.",
    identityStorage: "Das Profil konnte nicht lokal gespeichert werden.",
    workspaceChange: "Eine Aufgabe wird noch ausgeführt. Beim Wechsel des Arbeitsbereichs wird sie beendet. Fortfahren?",
    noModel: "Konfigurieren Sie zuerst einen API-Schlüssel oder wechseln Sie zu einem konfigurierten Modell.",
    approvalInactive: "Diese Freigabeanfrage ist nicht mehr aktiv.",
    commandFailed: "Der Vorgang ist fehlgeschlagen. Bitte versuchen Sie es erneut.",
  },
};

function currentDocumentLanguage(): AppLanguage {
  const language = typeof document === "undefined" ? undefined : document.documentElement.lang;
  return isAppLanguage(language) ? language : "zh-CN";
}

function storeMessage(key: StoreMessageKey): string {
  return STORE_MESSAGES[currentDocumentLanguage()][key];
}

function sanitizeErrorMessage(message: string): string {
  if (/No API key found/i.test(message)) return storeMessage("noModel");
  return message.replace(/[A-Za-z]:\\[^\s"'<>`]+/g, "[local path]");
}

function sanitizeUnknownError(error: unknown): string {
  return sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
}

export const useCompass = create<CompassState>((set, get) => {
  const runIpc = createStoreCommandRunner({
    reportError: (lastError) => set({ lastError }),
    sanitizeError: sanitizeUnknownError,
  });

  const initialIdentity = loadProfileIdentity();

  // Every settings entry/exit path funnels through here so a registered
  // leave-guard (for example unsaved quick prompts) is always consulted.
  const requestSettingsNavigation = (settingsSection: SettingsSection | null): void => {
    const state = get();
    const decision = decideSettingsNavigation({
      currentSection: state.settingsSection,
      targetSection: settingsSection,
      guardBlocked: Boolean(state.settingsGuard?.isBlocked()),
    });
    if (decision === "ignore") return;
    if (decision === "block") {
      set({
        pendingSettingsNavigation: {
          proceed: () => set({ settingsSection, pendingSettingsNavigation: null }),
        },
      });
      return;
    }
    set({ settingsSection });
  };

  return {
  ready: false,
  version: "",
  skills: [],
  models: [],
  providers: [],
  prerequisites: undefined,
  dependencies: { items: [], installs: [], checkedAt: 0 },
  sessions: [],
  thread: [],
  approvals: [],
  clientRegistry: emptyClientRegistry(),
  profileAvatar: loadProfileAvatar(),
  profileName: initialIdentity.name,
  profileHandle: initialIdentity.handle,
  streaming: false,
  queue: { steering: [], followUp: [] },
  settingsSection: null,
  settingsGuard: null,
  pendingSettingsNavigation: null,
  sidebarOpen: false,
  mainView: "assistant",
  hearingHealthClient: null,
  hearingHealthProfileOpen: false,
  composerSeed: null,
  composerDrafts: {},
  lastError: null,
  streamingBlocks: new Map(),
  dismissedDependencyPrompts: {},

  applyInit: (payload) => {
    clearPendingAgentEvents();
    set(projectInitPayload(payload, get().dependencies));
  },

  applyEvent: (event) => {
    const projection = projectAgentEvent(get(), event);
    if (projection.effects.includes("clear-pending-events")) clearPendingAgentEvents();
    if (projection.patch) set(projection.patch);
    if (projection.effects.includes("refresh-sessions")) {
      ignoreCommandFailure(get().refreshSessions());
    }
  },

  openSettings: (settingsSection = "general") => {
    requestSettingsNavigation(settingsSection);
  },
  closeSettings: () => {
    requestSettingsNavigation(null);
  },
  registerSettingsGuard: (guard) => set({ settingsGuard: guard }),
  unregisterSettingsGuard: (guard) => set((state) => (
    state.settingsGuard === guard
      ? { settingsGuard: null, pendingSettingsNavigation: null }
      : {}
  )),
  resolveSettingsNavigation: async (resolution) => {
    const { pendingSettingsNavigation, settingsGuard } = get();
    if (!pendingSettingsNavigation) return;
    if (resolution === "stay") {
      set({ pendingSettingsNavigation: null });
      return;
    }
    if (resolution === "save") {
      if (!settingsGuard?.canSave()) return;
      try {
        await settingsGuard.save();
      } catch {
        // The failed command already reported through the error banner.
        set({ pendingSettingsNavigation: null });
        return;
      }
    }
    pendingSettingsNavigation.proceed();
  },
  armSettingsNavigation: (afterLeave) => {
    const state = get();
    if (state.settingsSection === null || !state.settingsGuard?.isBlocked()) return false;
    set({
      pendingSettingsNavigation: {
        proceed: () => {
          set({ settingsSection: null, pendingSettingsNavigation: null });
          afterLeave();
        },
      },
    });
    return true;
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setMainView: (mainView) => set({ mainView }),
  setHearingHealthClient: (hearingHealthClient) => set({ hearingHealthClient }),
  setHearingHealthProfileOpen: (hearingHealthProfileOpen) => set({ hearingHealthProfileOpen }),
  seedComposer: (text, images) => set({ composerSeed: { text, images }, settingsSection: null, mainView: "assistant" }),
  clearComposerSeed: () => set({ composerSeed: null }),
  setComposerDraft: (key, draft) => set((state) => {
    const empty = !draft.text && draft.attachments.length === 0 && !draft.skillName;
    if (empty) {
      if (!(key in state.composerDrafts)) return state;
      const composerDrafts = { ...state.composerDrafts };
      delete composerDrafts[key];
      return { composerDrafts };
    }
    return { composerDrafts: { ...state.composerDrafts, [key]: draft } };
  }),
  clearComposerDraft: (key) => set((state) => {
    if (!(key in state.composerDrafts)) return state;
    const composerDrafts = { ...state.composerDrafts };
    delete composerDrafts[key];
    return { composerDrafts };
  }),
  setError: (message) => set({ lastError: message }),
  setProfileAvatar: (profileAvatar) => {
    if (!persistProfileAvatar(profileAvatar)) {
      set({ lastError: storeMessage("avatarStorage") });
      return;
    }
    set({ profileAvatar });
  },

  setProfileIdentity: (name, handle) => {
    const identity = persistProfileIdentity(name, handle);
    if (!identity) {
      set({ lastError: storeMessage("identityStorage") });
      return;
    }
    set({ profileName: identity.name, profileHandle: identity.handle });
  },

  dismissDependencyPrompt: (sessionId, dependencyId) => {
    set((state) => ({
      dismissedDependencyPrompts: {
        ...state.dismissedDependencyPrompts,
        [`${sessionId}:${dependencyId}`]: true,
      },
    }));
  },

  ...createCompassCommandActions({
    get,
    message: storeMessage,
    runCommand: runIpc,
    sanitizeError: sanitizeUnknownError,
    set,
  }),
  };
});
