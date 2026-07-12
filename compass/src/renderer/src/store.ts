import type {
  AgentStats,
  AgentUiEvent,
  AppSettingsView,
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
import { NO_MODEL_ERROR } from "@shared/messages";
import { create } from "zustand";
import { api } from "./ipc";
import { appendOptimisticUser, upsertActiveSession } from "./optimistic-session";

export type SettingsSection = "general" | "profile" | "models" | "skills";

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
  sessions: UiSessionInfo[];
  stats?: AgentStats;
  thread: UiThreadItem[];
  approvals: UiApprovalRequest[];
  profileAvatar: string | null;
  streaming: boolean;
  queue: { steering: string[]; followUp: string[] };
  settingsSection: SettingsSection | null;
  sidebarOpen: boolean;
  /** one-shot text the composer should insert (e.g. /skill:name) */
  composerSeed: string | null;
  lastError: string | null;
  streamingBlocks: Map<string, StreamingAssistant>;

  applyInit(payload: InitPayload): void;
  applyEvent(event: AgentUiEvent): void;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setSidebarOpen(open: boolean): void;
  seedComposer(text: string): void;
  clearComposerSeed(): void;
  setError(message: string | null): void;
  setProfileAvatar(dataUrl: string | null): void;

  boot(): Promise<void>;
  send(text: string, images?: UiImageAttachment[]): Promise<void>;
  abort(): Promise<void>;
  resolveApproval(id: string, allowed: boolean): Promise<void>;
  newSession(): Promise<void>;
  openSession(path: string): Promise<void>;
  refreshSessions(): Promise<void>;
  renameSession(path: string, name: string): Promise<void>;
  deleteSession(path: string): Promise<void>;
  archiveSession(path: string): Promise<void>;
  setModel(provider: string, id: string): Promise<void>;
  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<void>;
  setSummaryModel(provider: string, id: string): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setApiKey(provider: string, key: string): Promise<void>;
  loginProvider(provider: string): Promise<void>;
  removeApiKey(provider: string): Promise<void>;
  runPrerequisiteAction(actionId: string): Promise<void>;
  setSkillEnabled(name: string, enabled: boolean): Promise<void>;
  addSkillDir(): Promise<void>;
  removeSkillDir(dir: string): Promise<void>;
  setWorkspaceDir(): Promise<void>;
}

function sanitizeErrorMessage(message: string): string {
  if (/No API key found/i.test(message)) return NO_MODEL_ERROR;
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

function loadProfileAvatar(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const avatar = window.localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY);
    return avatar?.startsWith("data:image/") ? avatar : null;
  } catch {
    return null;
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

  return {
  ready: false,
  version: "",
  skills: [],
  models: [],
  providers: [],
  prerequisites: undefined,
  sessions: [],
  thread: [],
  approvals: [],
  profileAvatar: loadProfileAvatar(),
  streaming: false,
  queue: { steering: [], followUp: [] },
  settingsSection: null,
  sidebarOpen: false,
  composerSeed: null,
  lastError: null,
  streamingBlocks: new Map(),

  applyInit: (payload) => {
    set({
      ready: true,
      version: payload.version,
      settings: payload.settings,
      prerequisites: payload.prerequisites,
      skills: payload.skills,
      models: payload.models,
      providers: payload.providers,
      sessions: payload.sessions,
      stats: payload.stats,
      thread: payload.thread,
      approvals: payload.approvals ?? [],
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
                  ? { ...item, text: event.text, images: event.images, ts: event.ts }
                  : item,
              )
            : [
                ...state.thread,
                {
                  kind: "user" as const,
                  id: event.id,
                  text: event.text,
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
              event.text,
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
      case "state-refresh":
        get().applyInit(event.payload);
        break;
    }
  },

  openSettings: (settingsSection = "general") => set({ settingsSection }),
  closeSettings: () => set({ settingsSection: null }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  seedComposer: (text) => set({ composerSeed: text, settingsSection: null }),
  clearComposerSeed: () => set({ composerSeed: null }),
  setError: (message) => set({ lastError: message }),
  setProfileAvatar: (profileAvatar) => {
    try {
      if (profileAvatar) window.localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, profileAvatar);
      else window.localStorage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
    } catch {
      set({ lastError: "头像无法保存到本地存储。" });
      return;
    }
    set({ profileAvatar });
  },

  boot: () => runIpc(async () => {
    const payload = await api.init();
    get().applyInit(payload);
  }),

  send: async (text, images) => {
    const state = get();
    if (!state.stats?.model || !state.stats.modelAuthConfigured) {
      set({ lastError: NO_MODEL_ERROR });
      throw new Error(NO_MODEL_ERROR);
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

  abort: () => runIpc(async () => {
    await api.abort();
  }),

  newSession: () => runIpc(async () => {
    const payload = await api.newSession();
    get().applyInit(payload);
  }),

  openSession: (path) => runIpc(async () => {
    const payload = await api.openSession(path);
    get().applyInit(payload);
  }),

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

  setModel: (provider, id) => runIpc(async () => {
    const result = await api.setModel(provider, id);
    if (!result.ok && result.error) set({ lastError: sanitizeErrorMessage(result.error) });
  }),

  resolveApproval: (id, allowed) => runIpc(async () => {
    const result = await api.resolveApproval(id, allowed);
    if (!result.ok) set({ lastError: result.error ?? "Approval request is no longer active." });
  }),

  setModelEnabled: (provider, id, enabled) => runIpc(async () => {
    const payload = await api.setModelEnabled(provider, id, enabled);
    set({
      settings: payload.settings,
      models: payload.models,
      providers: payload.providers,
      stats: payload.stats,
    });
  }),

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
      !window.confirm("当前任务仍在运行。更换工作区会中止本次任务，是否继续？")
    ) {
      return;
    }
    const payload = await api.setWorkspaceDir();
    if (payload) get().applyInit(payload);
  }),
  };
});
