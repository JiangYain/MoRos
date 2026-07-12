/**
 * Shared IPC contract between the Electron main process (Pi agent host)
 * and the renderer (Compass UI). Everything here must be structured-clone safe.
 */

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

export const PERMISSION_MODES = ["ask", "approve", "full"] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && (PERMISSION_MODES as readonly string[]).includes(value);
}

export interface UiImageAttachment {
  /** Base64 payload without a data URL prefix. */
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  name?: string;
}

export interface ContextUsageBreakdown {
  systemPrompt: number;
  toolDefinitions: number;
  rules: number;
  skills: number;
  mcpTools: number;
  subagents: number;
  conversation: number;
  estimated: boolean;
}

export interface UiModel {
  provider: string;
  providerName: string;
  id: string;
  name: string;
  reasoning: boolean;
  supportsImages: boolean;
  contextWindow: number;
}

export interface ModelSelection {
  provider: string;
  id: string;
}

export const DEFAULT_SUMMARY_MODEL: ModelSelection = {
  provider: "openai-codex",
  id: "gpt-5.3-codex-spark",
};

export function modelSelectionKey(provider: string, id: string): string {
  return `${provider}::${id}`;
}

export interface UiProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  /** where the credential comes from: stored | runtime | environment | ... */
  source?: string;
  /** optional credential source detail, such as the environment variable name */
  sourceLabel?: string;
  /** missing provider-specific configuration that prevents reliable requests */
  configurationIssue?: string;
  /** whether at least one model of this provider exists in the registry */
  hasModels: boolean;
  supportsApiKey: boolean;
  supportsOAuth: boolean;
  envVars: string[];
  requiredEnv: string[];
  authNote?: string;
}

export interface UiSkill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  enabled: boolean;
}

export interface UiSessionInfo {
  path: string;
  id: string;
  name?: string;
  firstMessage: string;
  createdAt: number;
  modifiedAt: number;
  messageCount: number;
}

export interface UiUsage {
  input: number;
  output: number;
  cost: number;
}

export interface UiApprovalRequest {
  id: string;
  toolName: string;
  message: string;
  detail: string;
  args?: unknown;
  ts: number;
}

export type UiBlock =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string };

export type UiThreadItem =
  | { kind: "user"; id: string; text: string; images?: UiImageAttachment[]; ts: number }
  | {
      kind: "assistant";
      id: string;
      blocks: UiBlock[];
      streaming: boolean;
      stopReason?: string;
      errorMessage?: string;
      usage?: UiUsage;
      ts: number;
    }
  | {
      kind: "tool";
      id: string;
      callId: string;
      name: string;
      args?: unknown;
      output: string;
      isError: boolean;
      running: boolean;
      ts: number;
    }
  | { kind: "notice"; id: string; tone: "info" | "warn"; text: string; ts: number };

export interface AgentStats {
  sessionId: string;
  sessionPath?: string;
  sessionName?: string;
  model?: {
    provider: string;
    id: string;
    name: string;
    reasoning: boolean;
    supportsImages: boolean;
    thinkingLevels: ThinkingLevel[];
  };
  /** whether the active model's provider has a usable credential */
  modelAuthConfigured: boolean;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  contextPercent: number | null;
  contextTokens: number | null;
  contextWindow: number;
  contextBreakdown?: ContextUsageBreakdown;
  cost: number;
  tokensIn: number;
  tokensOut: number;
}

/** Streaming events pushed from main -> renderer on channel "agent:event". */
export type AgentUiEvent =
  | { kind: "agent-start" }
  | { kind: "agent-end" }
  | { kind: "user-message"; id: string; text: string; images?: UiImageAttachment[]; ts: number }
  | { kind: "assistant-start"; id: string; ts: number }
  | {
      kind: "assistant-delta";
      id: string;
      blockType: "text" | "thinking";
      contentIndex: number;
      delta: string;
    }
  | {
      kind: "assistant-end";
      id: string;
      blocks: UiBlock[];
      stopReason?: string;
      errorMessage?: string;
      usage?: UiUsage;
    }
  | { kind: "tool-start"; id: string; callId: string; name: string; args?: unknown; ts: number }
  | { kind: "tool-update"; callId: string; output: string }
  | { kind: "tool-end"; callId: string; output: string; isError: boolean }
  | { kind: "approval-request"; request: UiApprovalRequest }
  | { kind: "approval-resolved"; id: string }
  | { kind: "queue-update"; steering: string[]; followUp: string[] }
  | { kind: "notice"; tone: "info" | "warn"; text: string; ts: number }
  | { kind: "stats"; stats: AgentStats }
  | { kind: "sessions-changed" }
  | { kind: "state-refresh"; payload: InitPayload };

export interface AppSettingsView {
  workspaceDir: string;
  skillDirs: string[];
  disabledSkills: string[];
  permissionMode: PermissionMode;
  enabledModels: string[];
  summaryModel: ModelSelection;
}

interface RuntimePrerequisiteActionBase {
  id: string;
  label: string;
  description: string;
}

export type RuntimePrerequisiteAction =
  | (RuntimePrerequisiteActionBase & { kind: "refresh" })
  | (RuntimePrerequisiteActionBase & { kind: "shell-command"; command: string })
  | (RuntimePrerequisiteActionBase & { kind: "open-url"; url: string });

export interface RuntimePrerequisiteCheck {
  id: "bash";
  name: string;
  ok: boolean;
  detail: string;
  shellPath?: string;
  shellArgs?: string[];
  actions: RuntimePrerequisiteAction[];
}

export interface RuntimePrerequisites {
  shell: RuntimePrerequisiteCheck;
}

export interface InitPayload {
  settings: AppSettingsView;
  prerequisites: RuntimePrerequisites;
  skills: UiSkill[];
  models: UiModel[];
  providers: UiProviderStatus[];
  sessions: UiSessionInfo[];
  stats: AgentStats;
  thread: UiThreadItem[];
  approvals: UiApprovalRequest[];
  version: string;
}

export interface VoiceInputResult {
  ok: boolean;
  error?: string;
  /** Browser speech recognition returns text; desktop dictation types into the focused field. */
  text?: string;
}

export interface VoiceInputUpdate {
  phase: "starting" | "listening" | "processing";
  interimText?: string;
}

/** API exposed on window.compass by the preload script. */
export interface CompassApi {
  init(): Promise<InitPayload>;
  prompt(
    text: string,
    images?: UiImageAttachment[],
    clientMessageId?: string,
  ): Promise<{ ok: boolean; error?: string }>;
  abort(): Promise<void>;
  resolveApproval(id: string, allowed: boolean): Promise<{ ok: boolean; error?: string }>;
  newSession(): Promise<InitPayload>;
  openSession(path: string): Promise<InitPayload>;
  listSessions(): Promise<UiSessionInfo[]>;
  renameSession(path: string, name: string): Promise<{ ok: boolean; error?: string }>;
  deleteSession(path: string): Promise<{ ok: boolean; error?: string }>;
  archiveSession(path: string): Promise<{ ok: boolean; error?: string }>;
  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }>;
  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<InitPayload>;
  setSummaryModel(provider: string, id: string): Promise<AppSettingsView>;
  setThinkingLevel(level: ThinkingLevel): Promise<AgentStats>;
  setPermissionMode(mode: PermissionMode): Promise<AppSettingsView>;
  setApiKey(provider: string, key: string): Promise<InitPayload>;
  loginProvider(provider: string): Promise<InitPayload>;
  removeApiKey(provider: string): Promise<InitPayload>;
  runPrerequisiteAction(actionId: string): Promise<InitPayload>;
  setSkillEnabled(name: string, enabled: boolean): Promise<InitPayload>;
  addSkillDir(): Promise<InitPayload | null>;
  removeSkillDir(dir: string): Promise<InitPayload>;
  setWorkspaceDir(): Promise<InitPayload | null>;
  openPath(path: string): Promise<void>;
  startDictation(onUpdate?: (update: VoiceInputUpdate) => void): Promise<VoiceInputResult>;
  onAgentEvent(listener: (event: AgentUiEvent) => void): () => void;
  windowControl(action: "minimize" | "maximize" | "close"): void;
  onMaximizeChange(listener: (maximized: boolean) => void): () => void;
}

/** Operations implemented by the local Compass backend, excluding renderer-only event/window hooks. */
export type CompassBackendApi = Omit<
  CompassApi,
  "onAgentEvent" | "windowControl" | "onMaximizeChange"
>;

/** Backend operations transported over the browser RPC bridge. */
export type WebRpcMethod = Exclude<keyof CompassBackendApi, "startDictation">;
