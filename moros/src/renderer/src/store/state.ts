import type { WorkbenchStoreFields } from "../workbench/state";
import type {
  AgentStats,
  AgentUiEvent,
  AppLanguage,
  ApprovalScope,
  AppSettingsView,
  CommandExplanationLanguage,
  ComposerSendKey,
  DependencyId,
  DependencySnapshot,
  InitPayload,
  PermissionMode,
  QueuedMessageKind,
  QueuedMessageRemoval,
  RuntimePrerequisites,
  ThinkingLevel,
  UiApprovalRequest,
  UiArchivedSessionInfo,
  UiImageAttachment,
  UiModel,
  UiProviderStatus,
  UiSessionInfo,
  UiSkill,
  UiThreadItem,
} from "@shared/types";
import type { StreamingAssistantState } from "./agent-event-projection";

export type SettingsSection =
  | "general"
  | "appearance"
  | "profile"
  | "models"
  | "skills"
  | "dependencies"
  | "archive";

/**
 * Lets a settings surface with unsaved local edits intercept navigation away
 * from itself. Registered while the surface is mounted; the store consults it
 * before honoring openSettings/closeSettings.
 */
export interface SettingsNavigationGuard {
  isBlocked(): boolean;
  canSave(): boolean;
  save(): Promise<void>;
}

export interface PendingSettingsNavigation {
  proceed(): void;
}

/**
 * Pending confirmation for changing the workspace while a task is still
 * streaming. Present only while the in-app confirm dialog is open.
 */
export interface PendingWorkspaceChange {
  proceed(): void;
  cancel(): void;
}

export type SettingsNavigationResolution = "save" | "discard" | "stay";

/** One-shot content the composer should insert (for example, /skill:name plus images). */
export interface ComposerSeed {
  text: string;
  images?: UiImageAttachment[];
}

/** In-memory composer draft for one session; never persisted to localStorage. */
export interface ComposerDraft {
  text: string;
  attachments: Array<UiImageAttachment & { id: string }>;
  skillName: string | null;
}

export interface MorosState extends WorkbenchStoreFields {
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
  profileAvatar: string | null;
  /** Editable local profile display name (empty until the user sets one). */
  profileName: string;
  /** Editable local profile handle/username (empty until the user sets one). */
  profileHandle: string;
  streaming: boolean;
  queue: { steering: string[]; followUp: string[] };
  settingsSection: SettingsSection | null;
  settingsGuard: SettingsNavigationGuard | null;
  pendingSettingsNavigation: PendingSettingsNavigation | null;
  pendingWorkspaceChange: PendingWorkspaceChange | null;
  sidebarOpen: boolean;
  /** One-shot content the composer should insert (for example, /skill:name). */
  composerSeed: ComposerSeed | null;
  /** Per-session composer drafts keyed by sessionId ("pending" before a session exists). */
  composerDrafts: Record<string, ComposerDraft>;
  lastError: string | null;
  streamingBlocks: Map<string, StreamingAssistantState>;

  applyInit(payload: InitPayload): void;
  applyEvent(event: AgentUiEvent): void;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  registerSettingsGuard(guard: SettingsNavigationGuard): void;
  unregisterSettingsGuard(guard: SettingsNavigationGuard): void;
  resolveSettingsNavigation(resolution: SettingsNavigationResolution): Promise<void>;
  /**
   * Defers a compound leave-settings navigation (close settings plus caller
   * follow-up work) while the settings guard blocks it. Returns true when a
   * confirmation is pending and the caller must not navigate itself.
   */
  armSettingsNavigation(afterLeave: () => void): boolean;
  setSidebarOpen(open: boolean): void;
  seedComposer(text: string, images?: UiImageAttachment[]): void;
  clearComposerSeed(): void;
  /** Stores the draft for a session key; an empty draft removes the entry instead. */
  setComposerDraft(key: string, draft: ComposerDraft): void;
  clearComposerDraft(key: string): void;
  setError(message: string | null): void;
  setProfileAvatar(dataUrl: string | null): void;
  setProfileIdentity(name: string, handle: string): void;

  boot(shouldApply?: () => boolean): Promise<void>;
  send(text: string, images?: UiImageAttachment[], feedbackIds?: string[]): Promise<void>;
  abort(): Promise<void>;
  resolveApproval(id: string, allowed: boolean, scope?: ApprovalScope): Promise<void>;
  /** Resolves to true when the queued message was withdrawn; failures land in lastError. */
  removeQueuedMessage(kind: QueuedMessageKind, index: number, text: string): Promise<Extract<QueuedMessageRemoval, { ok: true }> | undefined>;
  newSession(workspaceDir?: string): Promise<boolean>;
  openSession(path: string): Promise<boolean>;
  refreshSessions(): Promise<void>;
  renameSession(path: string, name: string): Promise<void>;
  deleteSession(path: string): Promise<void>;
  archiveSession(path: string): Promise<void>;
  listArchivedSessions(): Promise<UiArchivedSessionInfo[]>;
  restoreArchivedSession(path: string): Promise<void>;
  setModel(provider: string, id: string): Promise<void>;
  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<void>;
  setSummaryModel(provider: string, id: string): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setLanguage(language: AppLanguage): Promise<void>;
  setCommandExplanationLanguage(language: CommandExplanationLanguage): Promise<void>;
  setComposerSendKey(sendKey: ComposerSendKey): Promise<void>;
  setQuickPrompts(prompts: string[] | null): Promise<void>;
  setApiKey(provider: string, key: string): Promise<void>;
  loginProvider(provider: string): Promise<void>;
  removeApiKey(provider: string): Promise<void>;
  runPrerequisiteAction(actionId: string): Promise<void>;
  refreshDependencies(): Promise<void>;
  installDependency(dependencyId: DependencyId, sessionId?: string): Promise<void>;
  cancelDependencyInstall(dependencyId: DependencyId): Promise<void>;
  openPath(path: string): Promise<void>;
  openDependencySource(dependencyId: DependencyId): Promise<void>;
  refreshSkills(): Promise<void>;
  setSkillEnabled(name: string, enabled: boolean): Promise<void>;
  addSkillDir(): Promise<void>;
  removeSkillDir(dir: string): Promise<void>;
  setWorkspaceDir(): Promise<void>;
}
