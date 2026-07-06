import type {
  AgentStats,
  AgentUiEvent,
  AppSettingsView,
  InitPayload,
  ThinkingLevel,
  UiBlock,
  UiModel,
  UiProviderStatus,
  UiSessionInfo,
  UiSkill,
  UiThreadItem,
} from "@shared/types";
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
  sessions: UiSessionInfo[];
  stats?: AgentStats;
  thread: UiThreadItem[];
  streaming: boolean;
  queue: { steering: string[]; followUp: string[] };
  panel: PanelKind;
  /** one-shot text the composer should insert (e.g. /skill:name) */
  composerSeed: string | null;
  lastError: string | null;

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
  removeApiKey(provider: string): Promise<void>;
  setSkillEnabled(name: string, enabled: boolean): Promise<void>;
  addSkillDir(): Promise<void>;
  removeSkillDir(dir: string): Promise<void>;
  setWorkspaceDir(): Promise<void>;
}

const streamingBlocks = new Map<string, StreamingAssistant>();

function blocksToArray(streaming: StreamingAssistant): UiBlock[] {
  return [...streaming.blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, block]) => ({ ...block }));
}

export const useCompass = create<CompassState>((set, get) => ({
  ready: false,
  version: "",
  skills: [],
  models: [],
  providers: [],
  sessions: [],
  thread: [],
  streaming: false,
  queue: { steering: [], followUp: [] },
  panel: "none",
  composerSeed: null,
  lastError: null,

  applyInit: (payload) => {
    streamingBlocks.clear();
    set({
      ready: true,
      version: payload.version,
      settings: payload.settings,
      skills: payload.skills,
      models: payload.models,
      providers: payload.providers,
      sessions: payload.sessions,
      stats: payload.stats,
      thread: payload.thread,
      streaming: payload.stats.isStreaming,
      queue: { steering: [], followUp: [] },
    });
  },

  applyEvent: (event) => {
    const state = get();
    switch (event.kind) {
      case "agent-start":
        set({ streaming: true, lastError: null });
        break;
      case "agent-end":
        set({ streaming: false });
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
        streamingBlocks.set(event.id, { id: event.id, blocks: new Map() });
        set({
          thread: [
            ...state.thread,
            { kind: "assistant", id: event.id, blocks: [], streaming: true, ts: event.ts },
          ],
        });
        break;
      }
      case "assistant-delta": {
        const record = streamingBlocks.get(event.id);
        if (!record) break;
        const existing = record.blocks.get(event.contentIndex);
        if (existing && existing.type === event.blockType) {
          existing.text += event.delta;
        } else {
          record.blocks.set(event.contentIndex, { type: event.blockType, text: event.delta });
        }
        set({
          thread: state.thread.map((item) =>
            item.kind === "assistant" && item.id === event.id
              ? { ...item, blocks: blocksToArray(record) }
              : item,
          ),
        });
        break;
      }
      case "assistant-end": {
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

  boot: async () => {
    const payload = await api.init();
    get().applyInit(payload);
  },

  send: async (text) => {
    const result = await api.prompt(text);
    if (!result.ok && result.error) {
      set({ lastError: result.error });
    }
  },

  abort: async () => {
    await api.abort();
  },

  newSession: async () => {
    const payload = await api.newSession();
    get().applyInit(payload);
  },

  openSession: async (path) => {
    const payload = await api.openSession(path);
    get().applyInit(payload);
  },

  refreshSessions: async () => {
    const sessions = await api.listSessions();
    set({ sessions });
  },

  setModel: async (provider, id) => {
    const result = await api.setModel(provider, id);
    if (!result.ok && result.error) set({ lastError: result.error });
  },

  setThinkingLevel: async (level) => {
    const stats = await api.setThinkingLevel(level);
    set({ stats });
  },

  setApiKey: async (provider, key) => {
    const payload = await api.setApiKey(provider, key);
    // keep current thread; only refresh config-ish slices
    set({
      models: payload.models,
      providers: payload.providers,
      stats: payload.stats,
    });
  },

  removeApiKey: async (provider) => {
    const payload = await api.removeApiKey(provider);
    set({
      models: payload.models,
      providers: payload.providers,
      stats: payload.stats,
    });
  },

  setSkillEnabled: async (name, enabled) => {
    const payload = await api.setSkillEnabled(name, enabled);
    set({ skills: payload.skills, settings: payload.settings });
  },

  addSkillDir: async () => {
    const payload = await api.addSkillDir();
    if (payload) get().applyInit(payload);
  },

  removeSkillDir: async (dir) => {
    const payload = await api.removeSkillDir(dir);
    get().applyInit(payload);
  },

  setWorkspaceDir: async () => {
    const payload = await api.setWorkspaceDir();
    if (payload) get().applyInit(payload);
  },
}));
