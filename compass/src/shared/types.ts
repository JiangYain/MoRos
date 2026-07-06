/**
 * Shared IPC contract between the Electron main process (Pi agent host)
 * and the renderer (Compass UI). Everything here must be structured-clone safe.
 */

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface UiModel {
  provider: string;
  providerName: string;
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
}

export interface UiProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  /** where the credential comes from: stored | runtime | environment | ... */
  source?: string;
  /** whether at least one model of this provider exists in the registry */
  hasModels: boolean;
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

export type UiBlock =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string };

export type UiThreadItem =
  | { kind: "user"; id: string; text: string; ts: number }
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
  sessionName?: string;
  model?: { provider: string; id: string; name: string; reasoning: boolean };
  /** whether the active model's provider has a usable credential */
  modelAuthConfigured: boolean;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  contextPercent: number | null;
  contextTokens: number | null;
  contextWindow: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
}

/** Streaming events pushed from main -> renderer on channel "agent:event". */
export type AgentUiEvent =
  | { kind: "agent-start" }
  | { kind: "agent-end" }
  | { kind: "user-message"; id: string; text: string; ts: number }
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
  | { kind: "queue-update"; steering: string[]; followUp: string[] }
  | { kind: "notice"; tone: "info" | "warn"; text: string; ts: number }
  | { kind: "stats"; stats: AgentStats }
  | { kind: "sessions-changed" };

export interface AppSettingsView {
  workspaceDir: string;
  skillDirs: string[];
  disabledSkills: string[];
}

export interface InitPayload {
  settings: AppSettingsView;
  skills: UiSkill[];
  models: UiModel[];
  providers: UiProviderStatus[];
  sessions: UiSessionInfo[];
  stats: AgentStats;
  thread: UiThreadItem[];
  version: string;
}

/** API exposed on window.compass by the preload script. */
export interface CompassApi {
  init(): Promise<InitPayload>;
  prompt(text: string): Promise<{ ok: boolean; error?: string }>;
  abort(): Promise<void>;
  newSession(): Promise<InitPayload>;
  openSession(path: string): Promise<InitPayload>;
  listSessions(): Promise<UiSessionInfo[]>;
  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }>;
  setThinkingLevel(level: ThinkingLevel): Promise<AgentStats>;
  setApiKey(provider: string, key: string): Promise<InitPayload>;
  removeApiKey(provider: string): Promise<InitPayload>;
  setSkillEnabled(name: string, enabled: boolean): Promise<InitPayload>;
  addSkillDir(): Promise<InitPayload | null>;
  removeSkillDir(dir: string): Promise<InitPayload>;
  setWorkspaceDir(): Promise<InitPayload | null>;
  openPath(path: string): Promise<void>;
  onAgentEvent(listener: (event: AgentUiEvent) => void): () => void;
  windowControl(action: "minimize" | "maximize" | "close"): void;
  onMaximizeChange(listener: (maximized: boolean) => void): () => void;
}
