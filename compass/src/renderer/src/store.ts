import type {
  AgentStats,
  AgentUiEvent,
  AppSettingsView,
  InitPayload,
  RuntimePrerequisites,
  ThinkingLevel,
  UiBlock,
  UiModel,
  UiProviderStatus,
  UiSessionInfo,
  UiSkill,
  UiThreadItem,
} from "@shared/types";
import { NO_MODEL_ERROR } from "@shared/messages";
import { create } from "zustand";
import { api } from "./ipc";

export type PanelKind = "none" | "skills" | "settings";

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
  streaming: boolean;
  queue: { steering: string[]; followUp: string[] };
  panel: PanelKind;
  /** one-shot text the composer should insert (e.g. /skill:name) */
  composerSeed: string | null;
  lastError: string | null;
  streamingBlocks: Map<string, StreamingAssistant>;

  applyInit(payload: InitPayload): void;
  applyEvent(event: AgentUiEvent): void;
  setPanel(panel: PanelKind): void;
  seedComposer(text: string): void;
  clearComposerSeed(): void;
  setError(message: string | null): void;

  boot(): Promise<void>;
  send(text: string): Promise<void>;
  abort(): Promise<void>;
  newSession(): Promise<void>;
  openSession(path: string): Promise<void>;
  refreshSessions(): Promise<void>;
  setModel(provider: string, id: string): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
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
  streaming: false,
  queue: { steering: [], followUp: [] },
  panel: "none",
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
        set({
          thread: [
            ...state.thread,
            { kind: "user", id: event.id, text: event.text, ts: event.ts },
          ],
        });
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
    }
  },

  setPanel: (panel) => set({ panel }),
  seedComposer: (text) => set({ composerSeed: text, panel: "none" }),
  clearComposerSeed: () => set({ composerSeed: null }),
  setError: (message) => set({ lastError: message }),

  boot: () => runIpc(async () => {
    const payload = await api.init();
    get().applyInit(payload);
  }),

  send: (text) => runIpc(async () => {
    const state = get();
    if (!state.stats?.model || !state.stats.modelAuthConfigured) {
      set({ lastError: NO_MODEL_ERROR });
      return;
    }
    const result = await api.prompt(text);
    if (!result.ok && result.error) {
      set({ lastError: sanitizeErrorMessage(result.error) });
    }
  }),

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

  setModel: (provider, id) => runIpc(async () => {
    const result = await api.setModel(provider, id);
    if (!result.ok && result.error) set({ lastError: sanitizeErrorMessage(result.error) });
  }),

  setThinkingLevel: (level) => runIpc(async () => {
    const stats = await api.setThinkingLevel(level);
    set({ stats });
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
    const payload = await api.setWorkspaceDir();
    if (payload) get().applyInit(payload);
  }),
  };
});
