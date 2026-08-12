import type { ClientProfileDraft, ClientRegistry } from "./client-registry";
import type { ClientAudiogramDraft, ClientAudiogramRecord } from "./client-audiograms";

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

export const APP_LANGUAGES = ["zh-CN", "zh-TW", "en", "de"] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && (APP_LANGUAGES as readonly string[]).includes(value);
}

export const COMMAND_EXPLANATION_LANGUAGES = ["auto", ...APP_LANGUAGES] as const;

export type CommandExplanationLanguage = (typeof COMMAND_EXPLANATION_LANGUAGES)[number];

export function isCommandExplanationLanguage(
  value: unknown,
): value is CommandExplanationLanguage {
  return typeof value === "string"
    && (COMMAND_EXPLANATION_LANGUAGES as readonly string[]).includes(value);
}

export const COMPOSER_SEND_KEYS = ["enter", "shiftEnter"] as const;

/** Which key combination submits the composer draft; the other inserts a newline. */
export type ComposerSendKey = (typeof COMPOSER_SEND_KEYS)[number];

export function isComposerSendKey(value: unknown): value is ComposerSendKey {
  return typeof value === "string" && (COMPOSER_SEND_KEYS as readonly string[]).includes(value);
}

export const QUEUED_MESSAGE_KINDS = ["steering", "followUp"] as const;

/** Which pending-message queue of the live session a queued entry belongs to. */
export type QueuedMessageKind = (typeof QUEUED_MESSAGE_KINDS)[number];

export function isQueuedMessageKind(value: unknown): value is QueuedMessageKind {
  return typeof value === "string" && (QUEUED_MESSAGE_KINDS as readonly string[]).includes(value);
}

export interface UiImageAttachment {
  /** Base64 payload without a data URL prefix. */
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  name?: string;
}

export const CONTEXT_USAGE_CATEGORY_KEYS = [
  "systemPrompt",
  "toolDefinitions",
  "rules",
  "skills",
  "mcpTools",
  "subagents",
  "conversation",
  "read",
  "write",
  "edit",
  "bash",
  "otherTools",
] as const;

export type ContextUsageCategoryKey = (typeof CONTEXT_USAGE_CATEGORY_KEYS)[number];

export interface ContextUsageDetailItem {
  id: string;
  label: string;
  tokens: number;
}

export type ContextUsageDetails = Record<ContextUsageCategoryKey, ContextUsageDetailItem[]>;

export interface ContextUsageBreakdown {
  systemPrompt: number;
  toolDefinitions: number;
  rules: number;
  skills: number;
  mcpTools: number;
  subagents: number;
  conversation: number;
  read: number;
  write: number;
  edit: number;
  bash: number;
  otherTools: number;
  /** Optional so older persisted/test snapshots remain compatible. */
  details?: ContextUsageDetails;
  estimated: boolean;
}

export interface DeveloperContextMessage {
  index: number;
  role: string;
  content: unknown;
}

export interface DeveloperContextSnapshot {
  sessionId: string;
  sessionPath?: string;
  clientName?: string;
  clientContext?: string;
  effectiveSystemPrompt: string;
  contextTokens: number | null;
  contextWindow: number;
  contextPercent: number | null;
  contextBreakdown?: ContextUsageBreakdown;
  messages: DeveloperContextMessage[];
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
  /** True while this session owns a foreground or background Agent run. */
  isRunning?: boolean;
}

export interface UiArchivedSessionInfo {
  path: string;
  id: string;
  name?: string;
  firstMessage: string;
  /** Best-effort archive timestamp derived from filesystem metadata. */
  archivedAt: number;
}

/** One conversation whose stored user/assistant text matches a search query. */
export interface SessionContentMatch {
  id: string;
  path: string;
  /** Short plain-text excerpt around the first match inside the session file. */
  snippet: string;
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
  explanation?: string;
  explanationPending?: boolean;
  ts: number;
}

export type UiBlock =
  | { type: "thinking"; text: string; contentIndex?: number }
  | { type: "text"; text: string; contentIndex?: number };

export type UiThreadItem =
  | { kind: "user"; id: string; text: string; skillName?: string; images?: UiImageAttachment[]; ts: number }
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
  | { kind: "user-message"; id: string; text: string; skillName?: string; images?: UiImageAttachment[]; ts: number }
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
  | { kind: "approval-explanation"; id: string; explanation?: string }
  | { kind: "approval-resolved"; id: string }
  | { kind: "queue-update"; steering: string[]; followUp: string[] }
  | { kind: "notice"; tone: "info" | "warn"; text: string; ts: number }
  | { kind: "stats"; stats: AgentStats }
  | { kind: "sessions-changed" }
  | { kind: "client-registry-changed"; registry: ClientRegistry }
  | { kind: "dependencies-changed"; dependencies: DependencySnapshot }
  | { kind: "dependency-install-progress"; progress: DependencyInstallProgress }
  | { kind: "state-refresh"; payload: InitPayload };

export interface AppSettingsView {
  language: AppLanguage;
  commandExplanationLanguage: CommandExplanationLanguage;
  workspaceDir: string;
  skillDirs: string[];
  disabledSkills: string[];
  permissionMode: PermissionMode;
  enabledModels: string[];
  summaryModel: ModelSelection;
  quickPrompts?: string[];
  composerSendKey: ComposerSendKey;
}

export interface ModelPreferenceUpdate {
  settings: AppSettingsView;
  stats: AgentStats;
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

export const DEPENDENCY_IDS = [
  "git",
  "bash",
  "phonak-target",
  "signia-connexx",
  "widex-compass-gps",
  "noahlink-wireless-driver",
] as const;

export type DependencyId = (typeof DEPENDENCY_IDS)[number];

export function isDependencyId(value: unknown): value is DependencyId {
  return typeof value === "string" && (DEPENDENCY_IDS as readonly string[]).includes(value);
}

export type DependencyCategory = "runtime" | "fitting-software" | "driver";
export type DependencyAvailability = "installed" | "missing" | "unsupported";
export type DependencyInstallKind = "winget" | "archive" | "executable" | "external";

export interface DependencyExecutableCandidate {
  path: string;
  version?: string;
  fileVersion?: string;
}

export interface DependencyExecutableSelection {
  candidates: DependencyExecutableCandidate[];
  configuredPath?: string;
  selectedPath?: string;
  source?: "automatic" | "user";
  multipleDetected: boolean;
}

export interface DependencyResource {
  id: DependencyId;
  category: DependencyCategory;
  name: string;
  vendor: string;
  availability: DependencyAvailability;
  installKind: DependencyInstallKind;
  required: boolean;
  recommendedVersion?: string;
  installedVersion?: string;
  installedPath?: string;
  executableSelection?: DependencyExecutableSelection;
  sourceUrl: string;
  documentationUrl: string;
}

export type DependencyInstallPhase =
  | "queued"
  | "downloading"
  | "extracting"
  | "installing"
  | "launching"
  | "awaiting-user"
  | "completed"
  | "failed"
  | "cancelled";

export interface DependencyInstallProgress {
  dependencyId: DependencyId;
  phase: DependencyInstallPhase;
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  sessionId?: string;
  artifactPath?: string;
  error?: string;
  updatedAt: number;
}

export interface DependencySnapshot {
  items: DependencyResource[];
  installs: DependencyInstallProgress[];
  checkedAt: number;
}

export interface InitPayload {
  settings: AppSettingsView;
  prerequisites: RuntimePrerequisites;
  /** Populated by the app backend. Optional for older persisted/test payloads. */
  dependencies?: DependencySnapshot;
  skills: UiSkill[];
  models: UiModel[];
  providers: UiProviderStatus[];
  sessions: UiSessionInfo[];
  stats: AgentStats;
  thread: UiThreadItem[];
  approvals: UiApprovalRequest[];
  clientRegistry: ClientRegistry;
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
  getDeveloperContext(): Promise<DeveloperContextSnapshot>;
  prompt(
    text: string,
    images?: UiImageAttachment[],
    clientMessageId?: string,
  ): Promise<{ ok: boolean; error?: string }>;
  abort(): Promise<void>;
  resolveApproval(id: string, allowed: boolean): Promise<{ ok: boolean; error?: string }>;
  removeQueuedMessage(
    kind: QueuedMessageKind,
    index: number,
    text: string,
  ): Promise<{ ok: boolean; error?: string }>;
  newSession(): Promise<InitPayload>;
  openSession(path: string): Promise<InitPayload>;
  listSessions(): Promise<UiSessionInfo[]>;
  searchSessionContent(query: string): Promise<SessionContentMatch[]>;
  renameSession(path: string, name: string): Promise<{ ok: boolean; error?: string }>;
  deleteSession(path: string): Promise<{ ok: boolean; error?: string }>;
  archiveSession(path: string): Promise<{ ok: boolean; error?: string }>;
  listArchivedSessions(): Promise<UiArchivedSessionInfo[]>;
  restoreArchivedSession(path: string): Promise<{ ok: boolean; error?: string }>;
  importLegacyClientRegistry(serializedRegistry: string): Promise<ClientRegistry>;
  saveClientProfile(profile: ClientProfileDraft): Promise<ClientRegistry>;
  updateClientProfile(originalName: string, profile: ClientProfileDraft): Promise<ClientRegistry>;
  deleteClientProfile(name: string): Promise<ClientRegistry>;
  assignSessionClient(sessionId: string, clientName: string): Promise<ClientRegistry>;
  unassignSessionClient(sessionId: string): Promise<ClientRegistry>;
  listClientAudiograms(clientName: string): Promise<ClientAudiogramRecord[]>;
  saveClientAudiogram(clientName: string, record: ClientAudiogramDraft): Promise<ClientAudiogramRecord>;
  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }>;
  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<ModelPreferenceUpdate>;
  setSummaryModel(provider: string, id: string): Promise<AppSettingsView>;
  setThinkingLevel(level: ThinkingLevel): Promise<AgentStats>;
  setPermissionMode(mode: PermissionMode): Promise<AppSettingsView>;
  setLanguage(language: AppLanguage): Promise<AppSettingsView>;
  setCommandExplanationLanguage(language: CommandExplanationLanguage): Promise<AppSettingsView>;
  setComposerSendKey(sendKey: ComposerSendKey): Promise<AppSettingsView>;
  setQuickPrompts(prompts: string[] | null): Promise<AppSettingsView>;
  setApiKey(provider: string, key: string): Promise<InitPayload>;
  loginProvider(provider: string): Promise<InitPayload>;
  removeApiKey(provider: string): Promise<InitPayload>;
  runPrerequisiteAction(actionId: string): Promise<InitPayload>;
  refreshDependencies(): Promise<DependencySnapshot>;
  installDependency(
    dependencyId: DependencyId,
    sessionId?: string,
  ): Promise<{ ok: boolean; error?: string }>;
  cancelDependencyInstall(dependencyId: DependencyId): Promise<{ ok: boolean; error?: string }>;
  openDependencySource(dependencyId: DependencyId): Promise<void>;
  selectDependencyExecutable(
    dependencyId: DependencyId,
    path?: string,
  ): Promise<DependencySnapshot | null>;
  resetDependencyExecutable(dependencyId: DependencyId): Promise<DependencySnapshot>;
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
