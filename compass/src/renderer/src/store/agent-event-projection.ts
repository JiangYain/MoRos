import type {
  AgentStats,
  AgentUiEvent,
  AppSettingsView,
  DependencySnapshot,
  InitPayload,
  RuntimePrerequisites,
  UiApprovalRequest,
  UiBlock,
  UiModel,
  UiProviderStatus,
  UiSessionInfo,
  UiSkill,
  UiThreadItem,
} from "../../../shared/types.ts";
import type { ClientRegistry } from "../../../shared/client-registry.ts";
import { upsertActiveSession } from "../optimistic-session.ts";

export interface StreamingAssistantState {
  id: string;
  blocks: Map<number, UiBlock>;
}

export interface AgentEventState {
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
  streaming: boolean;
  queue: { steering: string[]; followUp: string[] };
  lastError: string | null;
  streamingBlocks: Map<string, StreamingAssistantState>;
}

export type AgentEventEffect = "clear-pending-events" | "refresh-sessions";

export interface AgentEventProjection {
  patch?: Partial<AgentEventState>;
  effects: AgentEventEffect[];
}

function blocksToArray(streaming: StreamingAssistantState): UiBlock[] {
  return [...streaming.blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, block]) => ({ ...block }));
}

export function projectInitPayload(
  payload: InitPayload,
  currentDependencies: DependencySnapshot,
): Partial<AgentEventState> {
  return {
    ready: true,
    version: payload.version,
    settings: payload.settings,
    prerequisites: payload.prerequisites,
    dependencies: payload.dependencies ?? currentDependencies,
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
  };
}

/** Pure projection of an Agent event into a state patch plus explicit effects. */
export function projectAgentEvent(
  state: AgentEventState,
  event: AgentUiEvent,
): AgentEventProjection {
  switch (event.kind) {
    case "agent-start":
      return { patch: { streaming: true, lastError: null }, effects: [] };
    case "agent-end":
      return { patch: { streaming: false, streamingBlocks: new Map() }, effects: [] };
    case "user-message": {
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
      return {
        patch: {
          thread,
          sessions: upsertActiveSession(
            state.sessions,
            state.stats,
            thread,
            event.text || (event.skillName ? `Skill: ${event.skillName}` : ""),
            event.images,
            event.ts,
          ),
        },
        effects: [],
      };
    }
    case "assistant-start": {
      const streamingBlocks = new Map(state.streamingBlocks);
      streamingBlocks.set(event.id, { id: event.id, blocks: new Map() });
      return {
        patch: {
          thread: [
            ...state.thread,
            { kind: "assistant", id: event.id, blocks: [], streaming: true, ts: event.ts },
          ],
          streamingBlocks,
        },
        effects: [],
      };
    }
    case "assistant-delta": {
      const streamingBlocks = new Map(state.streamingBlocks);
      const record = streamingBlocks.get(event.id);
      if (!record) return { effects: [] };
      const blocks = new Map(record.blocks);
      const existing = blocks.get(event.contentIndex);
      if (existing && existing.type === event.blockType) {
        blocks.set(event.contentIndex, { ...existing, text: existing.text + event.delta });
      } else {
        blocks.set(event.contentIndex, { type: event.blockType, text: event.delta });
      }
      const nextRecord = { ...record, blocks };
      streamingBlocks.set(event.id, nextRecord);
      return {
        patch: {
          thread: state.thread.map((item) =>
            item.kind === "assistant" && item.id === event.id
              ? { ...item, blocks: blocksToArray(nextRecord) }
              : item,
          ),
          streamingBlocks,
        },
        effects: [],
      };
    }
    case "assistant-end": {
      const streamingBlocks = new Map(state.streamingBlocks);
      streamingBlocks.delete(event.id);
      return {
        patch: {
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
                  item.kind === "assistant"
                  && item.id === event.id
                  && event.blocks.length === 0
                  && !event.errorMessage
                ),
            ),
          streamingBlocks,
        },
        effects: [],
      };
    }
    case "tool-start":
      return {
        patch: {
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
        },
        effects: [],
      };
    case "tool-update":
      return {
        patch: {
          thread: state.thread.map((item) =>
            item.kind === "tool" && item.callId === event.callId && item.running
              ? { ...item, output: event.output }
              : item,
          ),
        },
        effects: [],
      };
    case "tool-end":
      return {
        patch: {
          thread: state.thread.map((item) =>
            item.kind === "tool" && item.callId === event.callId
              ? { ...item, output: event.output, isError: event.isError, running: false }
              : item,
          ),
        },
        effects: [],
      };
    case "approval-request":
      return {
        patch: {
          approvals: [
            ...state.approvals.filter((request) => request.id !== event.request.id),
            event.request,
          ],
        },
        effects: [],
      };
    case "approval-explanation":
      return {
        patch: {
          approvals: state.approvals.map((request) => request.id === event.id
            ? { ...request, explanation: event.explanation, explanationPending: false }
            : request),
        },
        effects: [],
      };
    case "approval-resolved":
      return {
        patch: { approvals: state.approvals.filter((request) => request.id !== event.id) },
        effects: [],
      };
    case "queue-update":
      return {
        patch: { queue: { steering: event.steering, followUp: event.followUp } },
        effects: [],
      };
    case "notice":
      return {
        patch: {
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
        },
        effects: [],
      };
    case "stats":
      return {
        patch: { stats: event.stats, streaming: event.stats.isStreaming },
        effects: [],
      };
    case "sessions-changed":
      return { effects: ["refresh-sessions"] };
    case "client-registry-changed":
      return { patch: { clientRegistry: event.registry }, effects: [] };
    case "dependencies-changed":
      return { patch: { dependencies: event.dependencies }, effects: [] };
    case "dependency-install-progress":
      return {
        patch: {
          dependencies: {
            ...state.dependencies,
            installs: [
              ...state.dependencies.installs.filter(
                (progress) => progress.dependencyId !== event.progress.dependencyId,
              ),
              event.progress,
            ],
          },
        },
        effects: [],
      };
    case "state-refresh":
      return {
        patch: projectInitPayload(event.payload, state.dependencies),
        effects: ["clear-pending-events"],
      };
  }
}
