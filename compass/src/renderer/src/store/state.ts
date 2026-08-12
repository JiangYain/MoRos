import type { ClientProfileDraft, ClientRegistry } from "@shared/client-registry";
import type { ClientAudiogramDraft, ClientAudiogramRecord } from "@shared/client-audiograms";
import type {
  AgentStats,
  AgentUiEvent,
  AppLanguage,
  AppSettingsView,
  CommandExplanationLanguage,
  ComposerSendKey,
  DependencyId,
  DependencySnapshot,
  InitPayload,
  PermissionMode,
  QueuedMessageKind,
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

export type MainView = "assistant" | "hearing-health";

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

export interface CompassState {
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
  settingsGuard: SettingsNavigationGuard | null;
  pendingSettingsNavigation: PendingSettingsNavigation | null;
  pendingWorkspaceChange: PendingWorkspaceChange | null;
  sidebarOpen: boolean;
  mainView: MainView;
  /** Client shown by the hearing health workspace (null falls back to the active session's client). */
  hearingHealthClient: string | null;
  /** Whether the inline client profile editor on the hearing health page is expanded. */
  hearingHealthProfileOpen: boolean;
  /** One-shot text the composer should insert (for example, /skill:name). */
  composerSeed: string | null;
  lastError: string | null;
  streamingBlocks: Map<string, StreamingAssistantState>;
  dismissedDependencyPrompts: Record<string, true>;

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
  setMainView(view: MainView): void;
  setHearingHealthClient(clientName: string | null): void;
  setHearingHealthProfileOpen(open: boolean): void;
  seedComposer(text: string): void;
  clearComposerSeed(): void;
  setError(message: string | null): void;
  setProfileAvatar(dataUrl: string | null): void;
  setProfileIdentity(name: string, handle: string): void;

  boot(): Promise<void>;
  send(text: string, images?: UiImageAttachment[]): Promise<void>;
  abort(): Promise<void>;
  resolveApproval(id: string, allowed: boolean): Promise<void>;
  /** Resolves to true when the queued message was withdrawn; failures land in lastError. */
  removeQueuedMessage(kind: QueuedMessageKind, index: number, text: string): Promise<boolean>;
  newSession(): Promise<boolean>;
  openSession(path: string): Promise<boolean>;
  refreshSessions(): Promise<void>;
  renameSession(path: string, name: string): Promise<void>;
  deleteSession(path: string): Promise<void>;
  archiveSession(path: string): Promise<void>;
  listArchivedSessions(): Promise<UiArchivedSessionInfo[]>;
  restoreArchivedSession(path: string): Promise<void>;
  saveClientProfile(profile: ClientProfileDraft): Promise<void>;
  updateClientProfile(originalName: string, profile: ClientProfileDraft): Promise<void>;
  deleteClientProfile(name: string): Promise<void>;
  assignSessionClient(sessionId: string, clientName: string): Promise<void>;
  unassignSessionClient(sessionId: string): Promise<void>;
  listClientAudiograms(clientName: string): Promise<ClientAudiogramRecord[]>;
  saveClientAudiogram(clientName: string, record: ClientAudiogramDraft): Promise<ClientAudiogramRecord>;
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
  selectDependencyExecutable(dependencyId: DependencyId, path?: string): Promise<void>;
  resetDependencyExecutable(dependencyId: DependencyId): Promise<void>;
  dismissDependencyPrompt(sessionId: string, dependencyId: DependencyId): void;
  setSkillEnabled(name: string, enabled: boolean): Promise<void>;
  addSkillDir(): Promise<void>;
  removeSkillDir(dir: string): Promise<void>;
  setWorkspaceDir(): Promise<void>;
}
