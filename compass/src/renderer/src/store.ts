import type {
  AgentStats,
  AgentUiEvent,
  AppLanguage,
  AppSettingsView,
  CommandExplanationLanguage,
  DependencyId,
  DependencySnapshot,
  InitPayload,
  PermissionMode,
  RuntimePrerequisites,
  ThinkingLevel,
  UiBlock,
  UiApprovalRequest,
  UiImageAttachment,
  UiModel,
  UiProviderStatus,
  UiSessionInfo,
  UiSkill,
  UiThreadItem,
} from "@shared/types";
import { isAppLanguage, modelSelectionKey } from "@shared/types";
import {
  CLIENT_REGISTRY_STORAGE_KEY,
  emptyClientRegistry,
  type ClientProfileDraft,
  type ClientRegistry,
} from "@shared/client-registry";
import { normalizeProfileHandle, normalizeProfileName } from "@shared/profile";
import { create } from "zustand";
import { api, clearPendingAgentEvents } from "./ipc";
import {
  rollbackEnabledModelKeys,
  updateEnabledModelKeys,
} from "./model-preference-update";
import { appendOptimisticUser, upsertActiveSession } from "./optimistic-session";

export type SettingsSection = "general" | "appearance" | "profile" | "models" | "skills" | "dependencies";

export type MainView = "assistant" | "hearing-health";

interface StreamingAssistant {
  id: string;
  blocks: Map<number, UiBlock>;
}

interface CompassState {
  ready: boolean;
  version: string;
  settings?: AppSettingsView;
  skills: UiSkill[];
  models: UiModel[];
  providers: UiProviderStatus[];
  prerequisites?: RuntimePrerequisites;
  dependencies: DependencySnapshot;
  sessions: UiSessionInfo[];
  stats?: AgentStats;
  thread: UiThreadItem[];
  approvals: UiApprovalRequest[];
  clientRegistry: ClientRegistry;
  profileAvatar: string | null;
  /** Editable local profile display name (empty until the user sets one). */
  profileName: string;
  /** Editable local profile handle/username (empty until the user sets one). */
  profileHandle: string;
  streaming: boolean;
  queue: { steering: string[]; followUp: string[] };
  settingsSection: SettingsSection | null;
  sidebarOpen: boolean;
  mainView: MainView;
  /** one-shot text the composer should insert (e.g. /skill:name) */
  composerSeed: string | null;
  lastError: string | null;
  streamingBlocks: Map<string, StreamingAssistant>;
  dismissedDependencyPrompts: Record<string, true>;

  applyInit(payload: InitPayload): void;
  applyEvent(event: AgentUiEvent): void;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setSidebarOpen(open: boolean): void;
  setMainView(view: MainView): void;
  seedComposer(text: string): void;
  clearComposerSeed(): void;
  setError(message: string | null): void;
  setProfileAvatar(dataUrl: string | null): void;
  setProfileIdentity(name: string, handle: string): void;

  boot(): Promise<void>;
  send(text: string, images?: UiImageAttachment[]): Promise<void>;
  abort(): Promise<void>;
  resolveApproval(id: string, allowed: boolean): Promise<void>;
  newSession(): Promise<boolean>;
  openSession(path: string): Promise<boolean>;
  refreshSessions(): Promise<void>;
  renameSession(path: string, name: string): Promise<void>;
  deleteSession(path: string): Promise<void>;
  archiveSession(path: string): Promise<void>;
  saveClientProfile(profile: ClientProfileDraft): Promise<void>;
  assignSessionClient(sessionId: string, clientName: string): Promise<void>;
  unassignSessionClient(sessionId: string): Promise<void>;
  setModel(provider: string, id: string): Promise<void>;
  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<void>;
  setSummaryModel(provider: string, id: string): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setLanguage(language: AppLanguage): Promise<void>;
  setCommandExplanationLanguage(language: CommandExplanationLanguage): Promise<void>;
  setQuickPrompts(prompts: string[] | null): Promise<void>;
  setApiKey(provider: string, key: string): Promise<void>;
  loginProvider(provider: string): Promise<void>;
  removeApiKey(provider: string): Promise<void>;
  runPrerequisiteAction(actionId: string): Promise<void>;
  refreshDependencies(): Promise<void>;
  installDependency(dependencyId: DependencyId, sessionId?: string): Promise<void>;
  cancelDependencyInstall(dependencyId: DependencyId): Promise<void>;
  openDependencySource(dependencyId: DependencyId): Promise<void>;
  selectDependencyExecutable(dependencyId: DependencyId, path?: string): Promise<void>;
  resetDependencyExecutable(dependencyId: DependencyId): Promise<void>;
  dismissDependencyPrompt(sessionId: string, dependencyId: DependencyId): void;
  setSkillEnabled(name: string, enabled: boolean): Promise<void>;
  addSkillDir(): Promise<void>;
  removeSkillDir(dir: string): Promise<void>;
  setWorkspaceDir(): Promise<void>;
}

type StoreMessageKey = "avatarStorage" | "identityStorage" | "workspaceChange" | "noModel" | "approvalInactive";

const STORE_MESSAGES: Record<AppLanguage, Record<StoreMessageKey, string>> = {
  "zh-CN": {
    avatarStorage: "头像无法保存到本地存储。",
    identityStorage: "个人资料无法保存到本地存储。",
    workspaceChange: "当前任务仍在运行。更换工作区会中止本次任务，是否继续？",
    noModel: "请先在设置中配置 API Key，或切换到已配置的模型。",
    approvalInactive: "该批准请求已失效。",
  },
  "zh-TW": {
    avatarStorage: "無法將頭像儲存到本機。",
    identityStorage: "無法將個人資料儲存到本機。",
    workspaceChange: "目前工作仍在執行。變更工作區會中止這項工作，是否繼續？",
    noModel: "請先在設定中配置 API Key，或切換到已配置的模型。",
    approvalInactive: "此核准請求已失效。",
  },
  en: {
    avatarStorage: "The avatar could not be saved locally.",
    identityStorage: "The profile could not be saved locally.",
    workspaceChange: "A task is still running. Changing the workspace will stop it. Continue?",
    noModel: "Configure an API key in Settings or switch to a configured model first.",
    approvalInactive: "This approval request is no longer active.",
  },
  de: {
    avatarStorage: "Der Avatar konnte nicht lokal gespeichert werden.",
    identityStorage: "Das Profil konnte nicht lokal gespeichert werden.",
    workspaceChange: "Eine Aufgabe wird noch ausgeführt. Beim Wechsel des Arbeitsbereichs wird sie beendet. Fortfahren?",
    noModel: "Konfigurieren Sie zuerst einen API-Schlüssel oder wechseln Sie zu einem konfigurierten Modell.",
    approvalInactive: "Diese Freigabeanfrage ist nicht mehr aktiv.",
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

function blocksToArray(streaming: StreamingAssistant): UiBlock[] {
  return [...streaming.blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, block]) => ({ ...block }));
}

function clientMessageId(): string {
  return typeof crypto.randomUUID === "function"
    ? `user-${crypto.randomUUID()}`
    : `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const PROFILE_AVATAR_STORAGE_KEY = "compass.profile.avatar.v1";
const PROFILE_IDENTITY_STORAGE_KEY = "compass.profile.identity.v1";

interface StoredProfileIdentity {
  name?: unknown;
  handle?: unknown;
}

function loadProfileAvatar(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const avatar = window.localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY);
    return avatar?.startsWith("data:image/") ? avatar : null;
  } catch {
    return null;
  }
}

function loadProfileIdentity(): { name: string; handle: string } {
  if (typeof window === "undefined") return { name: "", handle: "" };
  try {
    const raw = window.localStorage.getItem(PROFILE_IDENTITY_STORAGE_KEY);
    if (!raw) return { name: "", handle: "" };
    const parsed = JSON.parse(raw) as StoredProfileIdentity;
    // Reuse the shared normalizers so old/malformed data is always safe.
    return {
      name: normalizeProfileName(parsed.name),
      handle: normalizeProfileHandle(parsed.handle),
    };
  } catch {
    return { name: "", handle: "" };
  }
}

export const useCompass = create<CompassState>((set, get) => {
  const runIpc = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      set({ lastError: sanitizeUnknownError(error) });
    }
  };

  const initialIdentity = loadProfileIdentity();

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
  sidebarOpen: false,
  mainView: "assistant",
  composerSeed: null,
  lastError: null,
  streamingBlocks: new Map(),
  dismissedDependencyPrompts: {},

  applyInit: (payload) => {
    clearPendingAgentEvents();
    set({
      ready: true,
      version: payload.version,
      settings: payload.settings,
      prerequisites: payload.prerequisites,
      dependencies: payload.dependencies ?? get().dependencies,
      skills: payload.skills,
      models: payload.models,
      providers: payload.providers,
      sessions: payload.sessions,
      stats: payload.stats,
      thread: payload.thread,
      approvals: payload.approvals ?? [],
      clientRegistry: payload.clientRegistry,
      streaming: payload.stats.isStreaming,
      queue: { steering: [], followUp: [] },
      streamingBlocks: new Map(),
    });
  },

  applyEvent: (event) => {
    const state = get();
    switch (event.kind) {
      case "agent-start":
        set({ streaming: true, lastError: null });
        break;
      case "agent-end":
        set({ streaming: false, streamingBlocks: new Map() });
        break;
      case "user-message":
        {
          const existing = state.thread.some((item) => item.kind === "user" && item.id === event.id);
          const thread = existing
            ? state.thread.map((item) =>
                item.kind === "user" && item.id === event.id
                  ? { ...item, text: event.text, skillName: event.skillName, images: event.images, ts: event.ts }
                  : item,
              )
            : [
                ...state.thread,
                {
                  kind: "user" as const,
                  id: event.id,
                  text: event.text,
                  skillName: event.skillName,
                  images: event.images,
                  ts: event.ts,
                },
              ];
        set({
            thread,
            sessions: upsertActiveSession(
              state.sessions,
              state.stats,
              thread,
              event.text || (event.skillName ? `Skill: ${event.skillName}` : ""),
              event.images,
              event.ts,
            ),
        });
        }
        break;
      case "assistant-start": {
        const streamingBlocks = new Map(state.streamingBlocks);
        streamingBlocks.set(event.id, { id: event.id, blocks: new Map() });
        set({
          thread: [
            ...state.thread,
            { kind: "assistant", id: event.id, blocks: [], streaming: true, ts: event.ts },
          ],
          streamingBlocks,
        });
        break;
      }
      case "assistant-delta": {
        const streamingBlocks = new Map(state.streamingBlocks);
        const record = streamingBlocks.get(event.id);
        if (!record) break;
        const blocks = new Map(record.blocks);
        const existing = blocks.get(event.contentIndex);
        if (existing && existing.type === event.blockType) {
          blocks.set(event.contentIndex, { ...existing, text: existing.text + event.delta });
        } else {
          blocks.set(event.contentIndex, { type: event.blockType, text: event.delta });
        }
        const nextRecord = { ...record, blocks };
        streamingBlocks.set(event.id, nextRecord);
        set({
          thread: state.thread.map((item) =>
            item.kind === "assistant" && item.id === event.id
              ? { ...item, blocks: blocksToArray(nextRecord) }
              : item,
          ),
          streamingBlocks,
        });
        break;
      }
      case "assistant-end": {
        const streamingBlocks = new Map(state.streamingBlocks);
        streamingBlocks.delete(event.id);
        set({
          thread: state.thread
            .map((item) =>
              item.kind === "assistant" && item.id === event.id
                ? {
                    ...item,
                    blocks: event.blocks,
                    streaming: false,
                    stopReason: event.stopReason,
                    errorMessage: event.errorMessage,
                    usage: event.usage,
                  }
                : item,
            )
            .filter(
              (item) =>
                !(
                  item.kind === "assistant" &&
                  item.id === event.id &&
                  event.blocks.length === 0 &&
                  !event.errorMessage
                ),
            ),
          streamingBlocks,
        });
        break;
      }
      case "tool-start":
        set({
          thread: [
            ...state.thread,
            {
              kind: "tool",
              id: event.id,
              callId: event.callId,
              name: event.name,
              args: event.args,
              output: "",
              isError: false,
              running: true,
              ts: event.ts,
            },
          ],
        });
        break;
      case "tool-update":
        set({
          thread: state.thread.map((item) =>
            item.kind === "tool" && item.callId === event.callId && item.running
              ? { ...item, output: event.output }
              : item,
          ),
        });
        break;
      case "tool-end":
        set({
          thread: state.thread.map((item) =>
            item.kind === "tool" && item.callId === event.callId
              ? { ...item, output: event.output, isError: event.isError, running: false }
              : item,
          ),
        });
        break;
      case "approval-request":
        set({
          approvals: [
            ...state.approvals.filter((request) => request.id !== event.request.id),
            event.request,
          ],
        });
        break;
      case "approval-explanation":
        set({
          approvals: state.approvals.map((request) => request.id === event.id
            ? {
                ...request,
                explanation: event.explanation,
                explanationPending: false,
              }
            : request),
        });
        break;
      case "approval-resolved":
        set({ approvals: state.approvals.filter((request) => request.id !== event.id) });
        break;
      case "queue-update":
        set({ queue: { steering: event.steering, followUp: event.followUp } });
        break;
      case "notice":
        set({
          thread: [
            ...state.thread,
            {
              kind: "notice",
              id: `n-${event.ts}-${state.thread.length}`,
              tone: event.tone,
              text: event.text,
              ts: event.ts,
            },
          ],
        });
        break;
      case "stats":
        set({ stats: event.stats, streaming: event.stats.isStreaming });
        break;
      case "sessions-changed":
        void get().refreshSessions();
        break;
      case "client-registry-changed":
        set({ clientRegistry: event.registry });
        break;
      case "dependencies-changed":
        set({ dependencies: event.dependencies });
        break;
      case "dependency-install-progress":
        set({
          dependencies: {
            ...state.dependencies,
            installs: [
              ...state.dependencies.installs.filter(
                (progress) => progress.dependencyId !== event.progress.dependencyId,
              ),
              event.progress,
            ],
          },
        });
        break;
      case "state-refresh":
        get().applyInit(event.payload);
        break;
    }
  },

  openSettings: (settingsSection = "general") => set({ settingsSection }),
  closeSettings: () => set({ settingsSection: null }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setMainView: (mainView) => set({ mainView }),
  seedComposer: (text) => set({ composerSeed: text, settingsSection: null, mainView: "assistant" }),
  clearComposerSeed: () => set({ composerSeed: null }),
  setError: (message) => set({ lastError: message }),
  setProfileAvatar: (profileAvatar) => {
    try {
      if (profileAvatar) window.localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, profileAvatar);
      else window.localStorage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
    } catch {
      set({ lastError: storeMessage("avatarStorage") });
      return;
    }
    set({ profileAvatar });
  },

  setProfileIdentity: (name, handle) => {
    const normalizedName = normalizeProfileName(name);
    const normalizedHandle = normalizeProfileHandle(handle);
    try {
      window.localStorage.setItem(
        PROFILE_IDENTITY_STORAGE_KEY,
        JSON.stringify({ name: normalizedName, handle: normalizedHandle }),
      );
    } catch {
      set({ lastError: storeMessage("identityStorage") });
      return;
    }
    set({ profileName: normalizedName, profileHandle: normalizedHandle });
  },

  boot: () => runIpc(async () => {
    const payload = await api.init();
    get().applyInit(payload);
    let legacyRegistry: string | null = null;
    try {
      legacyRegistry = window.localStorage.getItem(CLIENT_REGISTRY_STORAGE_KEY);
    } catch {
      // Database-backed profiles remain available even when localStorage is blocked.
    }
    if (legacyRegistry) {
      const clientRegistry = await api.importLegacyClientRegistry(legacyRegistry);
      set({ clientRegistry });
      try {
        window.localStorage.removeItem(CLIENT_REGISTRY_STORAGE_KEY);
      } catch {
        // Re-importing is idempotent if the legacy key cannot be removed.
      }
    }
  }),

  send: async (text, images) => {
    const state = get();
    if (!state.stats?.model || !state.stats.modelAuthConfigured) {
      const noModelError = storeMessage("noModel");
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
      if (!result.ok) throw new Error(result.error ?? "Compass could not send this message.");
    } catch (error) {
      clearPendingAgentEvents();
      set((current) => ({
        thread: current.thread.filter((item) => item.id !== id),
        sessions: hadActiveSession
          ? current.sessions
          : current.sessions.filter((session) => session.id !== state.stats?.sessionId),
        lastError: sanitizeUnknownError(error),
      }));
      throw error;
    }
  },

  abort: () => {
    clearPendingAgentEvents();
    return runIpc(async () => {
      await api.abort();
    });
  },

  newSession: async () => {
    clearPendingAgentEvents();
    try {
      const payload = await api.newSession();
      set({ mainView: "assistant" });
      get().applyInit(payload);
      return true;
    } catch (error) {
      set({ lastError: sanitizeUnknownError(error) });
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
      set({ lastError: sanitizeUnknownError(error) });
      return false;
    }
  },

  refreshSessions: () => runIpc(async () => {
    const sessions = await api.listSessions();
    set({ sessions });
  }),

  renameSession: (path, name) => runIpc(async () => {
    const result = await api.renameSession(path, name);
    if (!result.ok && result.error) {
      set({ lastError: sanitizeErrorMessage(result.error) });
      return;
    }
    await get().refreshSessions();
  }),

  deleteSession: (path) => runIpc(async () => {
    const result = await api.deleteSession(path);
    if (!result.ok && result.error) {
      set({ lastError: sanitizeErrorMessage(result.error) });
      return;
    }
    const payload = await api.init();
    get().applyInit(payload);
  }),

  archiveSession: (path) => runIpc(async () => {
    const result = await api.archiveSession(path);
    if (!result.ok && result.error) {
      set({ lastError: sanitizeErrorMessage(result.error) });
      return;
    }
    const payload = await api.init();
    get().applyInit(payload);
  }),

  saveClientProfile: (profile) => runIpc(async () => {
    const clientRegistry = await api.saveClientProfile(profile);
    set({ clientRegistry });
  }),

  assignSessionClient: (sessionId, clientName) => runIpc(async () => {
    const clientRegistry = await api.assignSessionClient(sessionId, clientName);
    set({ clientRegistry });
  }),

  unassignSessionClient: (sessionId) => runIpc(async () => {
    const clientRegistry = await api.unassignSessionClient(sessionId);
    set({ clientRegistry });
  }),

  setModel: (provider, id) => runIpc(async () => {
    const result = await api.setModel(provider, id);
    if (!result.ok && result.error) set({ lastError: sanitizeErrorMessage(result.error) });
  }),

  resolveApproval: (id, allowed) => runIpc(async () => {
    const result = await api.resolveApproval(id, allowed);
    if (!result.ok) set({ lastError: result.error ?? storeMessage("approvalInactive") });
  }),

  setModelEnabled: async (provider, id, enabled) => {
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
      // The backend publishes an authoritative state-refresh before this RPC
      // resolves. Reapplying the response here could overwrite a newer model
      // selection delivered on the event channel.
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
        lastError: sanitizeUnknownError(error),
      }));
    }
  },

  setSummaryModel: (provider, id) => runIpc(async () => {
    const settings = await api.setSummaryModel(provider, id);
    set({ settings });
  }),

  setThinkingLevel: (level) => runIpc(async () => {
    const stats = await api.setThinkingLevel(level);
    set({ stats });
  }),

  setPermissionMode: (mode) => runIpc(async () => {
    const settings = await api.setPermissionMode(mode);
    set({ settings });
  }),

  setLanguage: (language) => runIpc(async () => {
    const settings = await api.setLanguage(language);
    document.documentElement.lang = settings.language;
    set({ settings });
  }),

  setCommandExplanationLanguage: (language) => runIpc(async () => {
    const settings = await api.setCommandExplanationLanguage(language);
    set({ settings });
  }),

  setQuickPrompts: (prompts) => runIpc(async () => {
    const settings = await api.setQuickPrompts(prompts);
    set({ settings });
  }),

  setApiKey: (provider, key) => runIpc(async () => {
    const payload = await api.setApiKey(provider, key);
    // keep current thread; only refresh config-ish slices
    set({
      models: payload.models,
      providers: payload.providers,
      stats: payload.stats,
    });
  }),

  loginProvider: (provider) => runIpc(async () => {
    const payload = await api.loginProvider(provider);
    set({
      models: payload.models,
      providers: payload.providers,
      stats: payload.stats,
    });
  }),

  removeApiKey: (provider) => runIpc(async () => {
    const payload = await api.removeApiKey(provider);
    set({
      models: payload.models,
      providers: payload.providers,
      stats: payload.stats,
    });
  }),

  runPrerequisiteAction: (actionId) => runIpc(async () => {
    const payload = await api.runPrerequisiteAction(actionId);
    set({
      settings: payload.settings,
      prerequisites: payload.prerequisites,
    });
  }),

  refreshDependencies: () => runIpc(async () => {
    const dependencies = await api.refreshDependencies();
    set({ dependencies });
  }),

  installDependency: (dependencyId, sessionId) => runIpc(async () => {
    const result = await api.installDependency(dependencyId, sessionId);
    if (!result.ok && result.error) set({ lastError: sanitizeErrorMessage(result.error) });
  }),

  cancelDependencyInstall: (dependencyId) => runIpc(async () => {
    const result = await api.cancelDependencyInstall(dependencyId);
    if (!result.ok && result.error) set({ lastError: sanitizeErrorMessage(result.error) });
  }),

  openDependencySource: (dependencyId) => runIpc(async () => {
    await api.openDependencySource(dependencyId);
  }),

  selectDependencyExecutable: (dependencyId, path) => runIpc(async () => {
    const dependencies = await api.selectDependencyExecutable(dependencyId, path);
    if (dependencies) set({ dependencies });
  }),

  resetDependencyExecutable: (dependencyId) => runIpc(async () => {
    const dependencies = await api.resetDependencyExecutable(dependencyId);
    set({ dependencies });
  }),

  dismissDependencyPrompt: (sessionId, dependencyId) => {
    set((state) => ({
      dismissedDependencyPrompts: {
        ...state.dismissedDependencyPrompts,
        [`${sessionId}:${dependencyId}`]: true,
      },
    }));
  },

  setSkillEnabled: (name, enabled) => runIpc(async () => {
    const payload = await api.setSkillEnabled(name, enabled);
    set({ skills: payload.skills, settings: payload.settings });
  }),

  addSkillDir: () => runIpc(async () => {
    const payload = await api.addSkillDir();
    if (payload) get().applyInit(payload);
  }),

  removeSkillDir: (dir) => runIpc(async () => {
    const payload = await api.removeSkillDir(dir);
    get().applyInit(payload);
  }),

  setWorkspaceDir: () => runIpc(async () => {
    if (
      get().streaming &&
      !window.confirm(storeMessage("workspaceChange"))
    ) {
      return;
    }
    clearPendingAgentEvents();
    const payload = await api.setWorkspaceDir();
    if (payload) get().applyInit(payload);
  }),
  };
});
