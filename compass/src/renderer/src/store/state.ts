import type { ClientProfileDraft, ClientRegistry } from "@shared/client-registry";
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
  UiApprovalRequest,
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
  | "dependencies";

export type MainView = "assistant" | "hearing-health";

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
  sidebarOpen: boolean;
  mainView: MainView;
  /** One-shot text the composer should insert (for example, /skill:name). */
  composerSeed: string | null;
  lastError: string | null;
  streamingBlocks: Map<string, StreamingAssistantState>;
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
