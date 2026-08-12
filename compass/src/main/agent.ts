import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionFactory,
  getAgentDir,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { clampThinkingLevel, type AuthInteraction } from "@earendil-works/pi-ai";
import type {
  AgentStats,
  AgentUiEvent,
  ApprovalScope,
  AppSettingsView,
  CommandExplanationLanguage,
  ComposerSendKey,
  DependencyId,
  DeveloperContextSnapshot,
  InitPayload,
  ModelPreferenceUpdate,
  PermissionMode,
  QueuedMessageKind,
  RuntimePrerequisites,
  SessionContentMatch,
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
import {
  DEFAULT_SUMMARY_MODEL,
  isAppLanguage,
  isCommandExplanationLanguage,
  isComposerSendKey,
  isPermissionMode,
  isThinkingLevel,
} from "@shared/types";
import { isQuickPromptList } from "@shared/quick-prompts";
import { app } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApprovalController, createApprovalExplainer } from "./agent/approval-controller";
import { AgentEventProjector } from "./agent/event-projector";
import {
  type LifecycleMutation,
} from "./agent/lifecycle-coordinator";
import { agentMessage } from "./agent/messages";
import { ModelCoordinator } from "./agent/model-coordinator";
import { compensatedMutationError } from "./agent/mutation-compensation";
import { removeQueuedSessionMessage } from "./agent/queued-messages";
import {
  SessionLibrary,
  createSessionTitleGenerator,
  type ListedSessionPath,
  type SessionRemovalResult,
  type SessionLibraryState,
  sameSessionPath,
} from "./agent/session-library";
import { SessionOwnerMutationCoordinator } from "./agent/session-owner-mutation";
import { SessionRuntimeCoordinator } from "./agent/session-runtime-coordinator";
import { SettingsMutationTransaction } from "./agent/settings-mutation-transaction";
import { buildClientContext, buildLanguageContext, COMPASS_CONTEXT } from "./compass-context";
import { buildEstimatedContextBreakdown } from "./context-usage";
import { normalizeImages } from "./image-attachments";
import { getRuntimePrerequisites } from "./prerequisites";
import { getProviderAuthInfo, getProviderConfigurationIssue } from "./provider-auth";
import { markRunningSessions, mergeActiveSession } from "./session-list";
import { type AppSettings, loadSettings, saveSettings } from "./settings";
import { discoverSkillDirs } from "./skills";
import { cloneForUi, projectThread } from "./thread-projector";

type Emit = (event: AgentUiEvent) => void;

interface SessionOwnership {
  approvals: ApprovalController;
  events: AgentEventProjector;
  session: AgentSession;
  unsubscribe: () => void;
  loader: DefaultResourceLoader;
  settings: AppSettings;
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    skillDirs: [...settings.skillDirs],
    disabledSkills: [...settings.disabledSkills],
    enabledModels: [...settings.enabledModels],
    summaryModel: { ...settings.summaryModel },
    ...(settings.defaultModel ? { defaultModel: { ...settings.defaultModel } } : {}),
    ...(settings.quickPrompts ? { quickPrompts: [...settings.quickPrompts] } : {}),
    ...(settings.dependencyExecutablePaths
      ? { dependencyExecutablePaths: { ...settings.dependencyExecutablePaths } }
      : {}),
  };
}

function normalizeThinkingLevels(levels: readonly unknown[]): ThinkingLevel[] {
  const normalized = [...new Set(levels.filter(isThinkingLevel))];
  return normalized.length > 0 ? normalized : ["off"];
}

function normalizeThinkingLevel(value: unknown, available: ThinkingLevel[]): ThinkingLevel {
  return isThinkingLevel(value) && available.includes(value) ? value : (available[0] ?? "off");
}

/**
 * Coordinates the live Pi session and exposes Compass's existing main-process
 * interface. Approval, event projection, persisted sessions, and model
 * preferences each live behind a dedicated deep module.
 */
export class AgentService {
  private readonly emit: Emit;
  private readonly getClientRegistry: () => InitPayload["clientRegistry"];
  private settings: AppSettings;
  private readonly modelRuntimePromise: Promise<ModelRuntime>;
  private modelRuntime!: ModelRuntime;
  private modelRegistry!: ModelRegistry;
  private idCounter = 0;
  private readonly lifecycle: SessionRuntimeCoordinator<SessionOwnership>;
  private readonly sessionMutations: SessionOwnerMutationCoordinator<
    SessionOwnership,
    ListedSessionPath
  >;
  private readonly models: ModelCoordinator;
  private readonly sessions: SessionLibrary;
  private readonly settingsMutations: SettingsMutationTransaction;

  constructor(emit: Emit, getClientRegistry: () => InitPayload["clientRegistry"]) {
    this.emit = emit;
    this.getClientRegistry = getClientRegistry;
    this.settings = loadSettings();
    this.applyDependencyExecutableEnvironment();
    this.settingsMutations = new SettingsMutationTransaction(() => saveSettings(this.settings));
    this.modelRuntimePromise = ModelRuntime.create();
    this.lifecycle = new SessionRuntimeCoordinator({
      dispose: (ownership) => this.disposeSessionOwnership(ownership),
      discardCandidate: (ownership) => this.discardSessionOwnership(ownership),
      isRunning: (ownership) => ownership.session.isStreaming,
      keyOf: (ownership) => ownership.session.sessionFile ?? `session:${ownership.session.sessionId}`,
      onBackgroundChange: () => this.emit({ kind: "sessions-changed" }),
      reportCleanupError: (error) => {
        console.error("Failed to clean up a replaced Agent session:", error);
      },
    });
    this.sessionMutations = new SessionOwnerMutationCoordinator({
      lifecycle: this.lifecycle,
      pathOf: (ownership) => ownership.session.sessionFile,
      samePath: sameSessionPath,
      isRetained: (path) => this.lifecycle.background.some(
        (ownership) => {
          const sessionPath = ownership.session.sessionFile;
          return Boolean(sessionPath && sameSessionPath(sessionPath, path));
        },
      ),
      retainedMutationError: () => new Error(
        agentMessage(this.settings.language, "sessionRunningInBackground"),
      ),
      detach: (lifecycle) => this.replaceSession(lifecycle),
      restore: (lifecycle, path) => this.replaceSession(lifecycle, path),
    });

    this.models = new ModelCoordinator({
      state: () => ({
        settings: this.settings,
        runtime: this.modelRuntime,
        registry: this.modelRegistry,
        session: this.session,
      }),
      persist: saveSettings,
      emitStats: () => this.lifecycle.current?.events.emitStats(),
      snapshot: () => ({ settings: this.getSettingsView(), stats: this.getStats() }),
      providerAuthInfo: getProviderAuthInfo,
      providerConfigurationIssue: getProviderConfigurationIssue,
    });
    this.sessions = new SessionLibrary({
      state: () => this.sessionLibraryState(this.lifecycle.current),
      withActiveSessionDetached: (path, mutation) =>
        this.sessionMutations.run(path, mutation),
      emitSessionsChanged: () => this.emit({ kind: "sessions-changed" }),
      generateTitle: createSessionTitleGenerator({
        settings: () => this.settings,
        registry: () => this.modelRegistry,
        isConnectable: (model) => this.models.isConnectable(model),
      }),
    });
  }

  private get session(): AgentSession | undefined {
    return this.lifecycle.current?.session;
  }

  private get loader(): DefaultResourceLoader | undefined {
    return this.lifecycle.current?.loader;
  }

  async start(options?: { sessionPath?: string }): Promise<void> {
    const sessionPath = options?.sessionPath
      ? await this.sessions.requireListedPath(options.sessionPath)
      : undefined;
    await this.navigateSession(sessionPath);
  }

  private async createSessionOwnership(
    _generation: number,
    sessionPath?: ListedSessionPath,
    settings: AppSettings = this.settings,
  ): Promise<SessionOwnership> {
    await this.ensureModelRuntime();

    let ownership!: SessionOwnership;
    let sessionForContext: AgentSession | undefined;
    const approvals = new ApprovalController({
      emit: (event) => this.emitSessionEvent(ownership, event),
      nextId: (prefix) => this.nextId(prefix),
      policy: () => ({
        mode: settings.permissionMode,
        workspaceDir: settings.workspaceDir,
      }),
      explain: createApprovalExplainer({
        settings: () => ownership?.settings ?? settings,
        registry: () => this.modelRegistry,
        isConnectable: (model) => this.models.isConnectable(model),
      }),
    });

    const cwd = settings.workspaceDir;
    const skillDirs = [
      ...discoverSkillDirs(cwd),
      ...settings.skillDirs.flatMap((dir) => discoverSkillDirs(dir)),
    ];
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      additionalSkillPaths: [...new Set(skillDirs)],
      extensionFactories: [
        {
          name: "compass-permission-policy",
          factory: approvals.extension(() => ({
            mode: settings.permissionMode,
            workspaceDir: settings.workspaceDir,
          })),
        },
        {
          name: "compass-client-context",
          factory: this.clientContextExtension(settings, () => sessionForContext?.sessionId),
        },
      ],
      skillsOverride: (base) => ({
        skills: base.skills.filter((skill) => !settings.disabledSkills.includes(skill.name)),
        diagnostics: base.diagnostics,
      }),
      agentsFilesOverride: (base) => ({
        agentsFiles: [
          ...base.agentsFiles,
          { path: "compass://persona/COMPASS.md", content: COMPASS_CONTEXT },
        ],
      }),
    });
    await loader.reload();

    const sessionManager = sessionPath
      ? SessionManager.open(sessionPath)
      : SessionManager.create(cwd);
    const preferred = settings.defaultModel
      ? this.modelRegistry.find(settings.defaultModel.provider, settings.defaultModel.id)
      : undefined;
    const model = preferred && this.models.isConnectable(preferred) ? preferred : undefined;
    const { session } = await createAgentSession({
      cwd,
      agentDir: getAgentDir(),
      resourceLoader: loader,
      sessionManager,
      modelRuntime: this.modelRuntime,
      ...(model && !sessionPath ? { model } : {}),
    });
    sessionForContext = session;

    const events = new AgentEventProjector({
      emit: (event) => this.emitSessionEvent(ownership, event),
      nextId: (prefix) => this.nextId(prefix),
      language: () => ownership.settings.language,
      stats: () => this.getStatsFor(ownership),
      onSettled: () => this.sessions.generateMissingTitle(this.sessionLibraryState(ownership)),
      onSettledError: (error) => console.error("Failed to generate the session title:", error),
    });
    ownership = {
      approvals,
      events,
      session,
      unsubscribe: () => {},
      loader,
      settings,
    };
    try {
      ownership.unsubscribe = session.subscribe((event) => {
        if (!this.lifecycle.isManaged(ownership)) return;
        events.handle(event);
        if (event.type === "agent_settled" && !this.lifecycle.isForeground(ownership)) {
          void this.lifecycle.settle(ownership).catch((error: unknown) => {
            console.error("Failed to release a settled background Agent session:", error);
          });
        }
      });
    } catch (error) {
      this.discardSessionOwnership(ownership);
      throw error;
    }
    if (!sessionPath && isThinkingLevel(settings.thinkingLevel) && session.model) {
      try {
        session.setThinkingLevel(settings.thinkingLevel);
      } catch {
        // The selected model may not support the stored thinking level.
      }
    }
    return ownership;
  }

  async shutdown(): Promise<void> {
    for (const ownership of this.lifecycle.managed) {
      ownership.approvals.cancelAll("The application is shutting down before approval was granted.");
      if (ownership.session.isStreaming) {
        try {
          await ownership.session.abort();
        } catch {
          // Shutdown remains best-effort.
        }
      }
    }
    await this.lifecycle.clear();
  }

  resolveApproval(id: string, allowed: boolean, scope?: ApprovalScope): { ok: boolean; error?: string } {
    for (const ownership of this.lifecycle.managed) {
      const result = ownership.approvals.resolve(id, allowed, scope);
      if (result.ok) return result;
    }
    return { ok: false, error: "Approval request is no longer active." };
  }

  /**
   * Withdraws one pending steering/follow-up message from the foreground
   * session. Background owners keep their queues untouched; their chips are
   * not visible, so a removal request can only target the foreground owner.
   * On success the session emits its own queue_update, which the projector
   * broadcasts to both renderer entries through the existing event path.
   */
  removeQueuedMessage(
    kind: QueuedMessageKind,
    index: number,
    text: string,
  ): { ok: boolean; error?: string } {
    const ownership = this.lifecycle.current;
    if (!ownership) {
      return { ok: false, error: agentMessage(this.settings.language, "sessionNotReady") };
    }
    const result = removeQueuedSessionMessage(ownership.session, kind, index, text);
    if (!result.ok) {
      return {
        ok: false,
        error: agentMessage(
          this.settings.language,
          result.reason === "unavailable" ? "queuedMessageRemoveFailed" : "queuedMessageNotFound",
        ),
      };
    }
    return { ok: true };
  }

  getStats(): AgentStats {
    const ownership = this.lifecycle.current;
    if (!ownership) {
      return {
        sessionId: "",
        modelAuthConfigured: false,
        thinkingLevel: "off",
        isStreaming: false,
        contextPercent: null,
        contextTokens: null,
        contextWindow: 0,
        cost: 0,
        tokensIn: 0,
        tokensOut: 0,
      };
    }
    return this.getStatsFor(ownership);
  }

  private getStatsFor(ownership: SessionOwnership): AgentStats {
    const { session } = ownership;
    const stats = session.getSessionStats();
    const context = session.getContextUsage();
    const model = session.model;
    const thinkingLevels: ThinkingLevel[] = model
      ? normalizeThinkingLevels(session.getAvailableThinkingLevels())
      : ["off"];
    const thinkingLevel = normalizeThinkingLevel(session.thinkingLevel, thinkingLevels);
    let modelAuthConfigured = false;
    if (model) {
      try {
        modelAuthConfigured = this.models.isConnectable(model);
      } catch {
        modelAuthConfigured = false;
      }
    }
    return {
      sessionId: session.sessionId,
      sessionPath: session.sessionFile,
      sessionName: session.sessionName,
      model: model
        ? {
            provider: String(model.provider),
            id: model.id,
            name: model.name ?? model.id,
            reasoning: Boolean(model.reasoning),
            supportsImages: model.input?.includes("image") ?? false,
            thinkingLevels,
          }
        : undefined,
      modelAuthConfigured,
      thinkingLevel,
      isStreaming: session.isStreaming,
      contextPercent: context?.percent ?? null,
      contextTokens: context?.tokens ?? null,
      contextWindow: context?.contextWindow ?? model?.contextWindow ?? 0,
      contextBreakdown: buildEstimatedContextBreakdown(
        session,
        context?.tokens ?? null,
        COMPASS_CONTEXT,
        ownership.loader.getSkills().skills,
      ),
      cost: stats.cost,
      tokensIn: stats.tokens.input,
      tokensOut: stats.tokens.output,
    };
  }

  getThread(): UiThreadItem[] {
    const ownership = this.lifecycle.current;
    return ownership
      ? ownership.events.snapshotThread(projectThread(ownership.session))
      : [];
  }

  getApprovals(): UiApprovalRequest[] {
    return this.lifecycle.current?.approvals.snapshot() ?? [];
  }

  getSkills(): UiSkill[] {
    const loaded = this.loader?.getSkills().skills ?? [];
    const disabled = this.settings.disabledSkills;
    const visible: UiSkill[] = loaded.map((skill) => ({
      name: skill.name,
      description: skill.description,
      filePath: skill.filePath,
      baseDir: skill.baseDir,
      source: skill.sourceInfo?.source ?? "skill",
      enabled: !disabled.includes(skill.name),
    }));
    // Disabled skills are filtered from the loader result, so surface them
    // from settings to let the operator turn them back on.
    const knownNames = new Set(visible.map((skill) => skill.name));
    for (const name of disabled) {
      if (!knownNames.has(name)) {
        visible.push({
          name,
          description: "（已停用）",
          filePath: "",
          baseDir: "",
          source: "disabled",
          enabled: false,
        });
      }
    }
    return visible.sort((a, b) => a.name.localeCompare(b.name));
  }

  getModels(): UiModel[] {
    return this.models.models();
  }

  getProviders(): UiProviderStatus[] {
    return this.models.providers();
  }

  async listSessions(): Promise<UiSessionInfo[]> {
    let sessions = await this.sessions.list();
    for (const ownership of this.lifecycle.managed) {
      sessions = mergeActiveSession(sessions, this.sessionInfoFor(ownership));
    }
    const runningSessionIds = new Set(
      this.lifecycle.managed
        .filter((ownership) => ownership.session.isStreaming)
        .map((ownership) => ownership.session.sessionId),
    );
    return markRunningSessions(sessions, runningSessionIds);
  }

  searchSessionContent(query: string): Promise<SessionContentMatch[]> {
    return this.sessions.searchContent(query);
  }

  renameSession(path: string, name: string): Promise<{ ok: boolean; error?: string }> {
    return this.sessions.rename(path, name);
  }

  archiveSession(path: string): Promise<SessionRemovalResult> {
    return this.sessions.archive(path);
  }

  listArchivedSessions(): Promise<UiArchivedSessionInfo[]> {
    return this.sessions.listArchived();
  }

  restoreArchivedSession(path: string): Promise<{ ok: boolean; error?: string }> {
    return this.sessions.restore(path);
  }

  deleteSession(path: string): Promise<SessionRemovalResult> {
    return this.sessions.delete(path);
  }

  getSettingsView(): AppSettingsView {
    return {
      language: this.settings.language,
      commandExplanationLanguage: this.settings.commandExplanationLanguage,
      workspaceDir: this.settings.workspaceDir,
      skillDirs: [...this.settings.skillDirs],
      disabledSkills: [...this.settings.disabledSkills],
      permissionMode: this.settings.permissionMode,
      enabledModels: this.models.enabledKeys(),
      summaryModel: { ...(this.settings.summaryModel ?? DEFAULT_SUMMARY_MODEL) },
      ...(this.settings.quickPrompts ? { quickPrompts: [...this.settings.quickPrompts] } : {}),
      composerSendKey: this.settings.composerSendKey,
    };
  }

  getPrerequisites(): RuntimePrerequisites {
    return getRuntimePrerequisites(this.settings.workspaceDir);
  }

  getDependencyExecutablePath(dependencyId: DependencyId): string | undefined {
    return this.settings.dependencyExecutablePaths?.[dependencyId];
  }

  async setDependencyExecutablePath(dependencyId: DependencyId, path?: string): Promise<void> {
    await this.settingsMutations.commit({
      context: `Dependency executable path mutation (${dependencyId})`,
      capture: () => ({
        executablePaths: this.settings.dependencyExecutablePaths
          ? { ...this.settings.dependencyExecutablePaths }
          : undefined,
        targetEnvironment: process.env.COMPASS_PHONAK_TARGET_PATH,
      }),
      mutate: () => {
        const executablePaths = { ...this.settings.dependencyExecutablePaths };
        if (path) executablePaths[dependencyId] = path;
        else delete executablePaths[dependencyId];
        if (Object.keys(executablePaths).length > 0) {
          this.settings.dependencyExecutablePaths = executablePaths;
        } else {
          delete this.settings.dependencyExecutablePaths;
        }
      },
      restore: (snapshot) => {
        if (snapshot.executablePaths) {
          this.settings.dependencyExecutablePaths = { ...snapshot.executablePaths };
        } else {
          delete this.settings.dependencyExecutablePaths;
        }
      },
      effect: {
        failureMode: "compensate",
        apply: () => this.applyDependencyExecutableEnvironment(),
        compensate: (snapshot) => {
          if (snapshot.targetEnvironment === undefined) {
            delete process.env.COMPASS_PHONAK_TARGET_PATH;
          } else {
            process.env.COMPASS_PHONAK_TARGET_PATH = snapshot.targetEnvironment;
          }
        },
      },
    });
  }

  async buildInitPayload(): Promise<InitPayload> {
    await this.ensureModelRuntime();
    return {
      settings: this.getSettingsView(),
      prerequisites: this.getPrerequisites(),
      skills: this.getSkills(),
      models: this.getModels(),
      providers: this.getProviders(),
      sessions: await this.listSessions(),
      stats: this.getStats(),
      thread: this.getThread(),
      approvals: this.getApprovals(),
      clientRegistry: this.getClientRegistry(),
      version: this.appVersion(),
    };
  }

  async prompt(
    text: string,
    images?: UiImageAttachment[],
    clientMessageId?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const ownership = this.lifecycle.current;
    if (!ownership) {
      return { ok: false, error: agentMessage(this.settings.language, "sessionNotReady") };
    }
    const { session } = ownership;
    if (clientMessageId) ownership.events.trackUserMessage(clientMessageId);
    try {
      const normalizedImages = normalizeImages(images, this.settings.language);
      if (session.isStreaming) {
        await session.prompt(text, { images: normalizedImages, streamingBehavior: "steer" });
      } else {
        await session.prompt(text, { images: normalizedImages });
      }
      return { ok: true };
    } catch (error) {
      if (clientMessageId) ownership.events.discardUserMessage(clientMessageId);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async abort(): Promise<void> {
    const ownership = this.lifecycle.current;
    ownership?.approvals.cancelAll("The task was stopped before approval was granted.");
    await ownership?.session.abort();
  }

  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }> {
    return this.models.select(provider, id);
  }

  async setSummaryModel(provider: string, id: string): Promise<AppSettingsView> {
    await this.models.setSummary(provider, id);
    return this.getSettingsView();
  }

  getDeveloperContext(): DeveloperContextSnapshot {
    const session = this.session;
    const stats = this.getStats();
    const registry = this.getClientRegistry();
    const sessionId = session?.sessionId ?? "";
    const clientName = sessionId ? registry.assignments[sessionId] : undefined;
    const clientContext = this.currentClientContext();
    const languageContext = buildLanguageContext(this.settings.language);
    const currentPrompt = session?.systemPrompt ?? "";
    const supplementalContext = [languageContext, clientContext]
      .filter((value): value is string => typeof value === "string" && !currentPrompt.includes(value))
      .join("\n\n");
    const effectiveSystemPrompt = supplementalContext
      ? `${currentPrompt}\n\n${supplementalContext}`
      : currentPrompt;
    return {
      sessionId,
      sessionPath: session?.sessionFile,
      clientName,
      clientContext,
      effectiveSystemPrompt,
      contextTokens: stats.contextTokens,
      contextWindow: stats.contextWindow,
      contextPercent: stats.contextPercent,
      contextBreakdown: stats.contextBreakdown,
      messages: (session?.messages ?? []).map((message, index) => ({
        index,
        role: typeof message === "object" && message && "role" in message
          ? String(message.role)
          : "unknown",
        content: cloneForUi(message),
      })),
    };
  }

  async setThinkingLevel(level: unknown): Promise<AgentStats> {
    if (!isThinkingLevel(level)) {
      throw new Error(agentMessage(this.settings.language, "thinkingInvalid"));
    }
    await this.lifecycle.mutate(async (lifecycle) => {
      const session = lifecycle.current?.session;
      if (!session) return;
      const availableLevels = session.getAvailableThinkingLevels();
      const effectiveLevel = availableLevels.includes(level)
        ? level
        : session.model
          ? clampThinkingLevel(session.model, level)
          : "off";
      await this.settingsMutations.commit({
        context: "Thinking-level mutation",
        capture: () => ({
          persisted: this.settings.thinkingLevel,
          live: session.thinkingLevel,
        }),
        mutate: () => {
          this.settings.thinkingLevel = effectiveLevel;
        },
        restore: (snapshot) => {
          if (snapshot.persisted === undefined) delete this.settings.thinkingLevel;
          else this.settings.thinkingLevel = snapshot.persisted;
        },
        effect: {
          failureMode: "compensate",
          apply: () => {
            session.setThinkingLevel(level);
            if (session.thinkingLevel !== effectiveLevel) {
              throw new Error(
                `Thinking level resolved to ${session.thinkingLevel}; expected ${effectiveLevel}.`,
              );
            }
          },
          compensate: (snapshot) => session.setThinkingLevel(snapshot.live),
        },
      });
    });
    return this.getStats();
  }

  setApiKey(provider: string, key: string): Promise<void> {
    return this.models.saveApiKey(provider, key);
  }

  loginProvider(provider: string, interaction: AuthInteraction): Promise<void> {
    return this.models.login(provider, interaction);
  }

  removeApiKey(provider: string): Promise<void> {
    return this.models.logout(provider);
  }

  setModelEnabled(
    provider: string,
    id: string,
    enabled: boolean,
  ): Promise<ModelPreferenceUpdate> {
    return this.models.setEnabled(provider, id, enabled);
  }

  async setPermissionMode(mode: PermissionMode): Promise<AppSettingsView> {
    if (!isPermissionMode(mode)) throw new Error("无效的权限模式");
    await this.settingsMutations.commit({
      context: "Permission-mode mutation",
      capture: () => this.settings.permissionMode,
      mutate: () => {
        this.settings.permissionMode = mode;
      },
      restore: (original) => {
        this.settings.permissionMode = original;
      },
    });
    return this.getSettingsView();
  }

  async setLanguage(language: AppSettingsView["language"]): Promise<AppSettingsView> {
    if (!isAppLanguage(language)) throw new Error("Invalid application language");
    await this.settingsMutations.commit({
      context: "Application-language mutation",
      capture: () => this.settings.language,
      mutate: () => {
        this.settings.language = language;
      },
      restore: (original) => {
        this.settings.language = original;
      },
    });
    return this.getSettingsView();
  }

  async setCommandExplanationLanguage(
    language: CommandExplanationLanguage,
  ): Promise<AppSettingsView> {
    if (!isCommandExplanationLanguage(language)) {
      throw new Error("Invalid command explanation language");
    }
    await this.settingsMutations.commit({
      context: "Command-explanation-language mutation",
      capture: () => this.settings.commandExplanationLanguage,
      mutate: () => {
        this.settings.commandExplanationLanguage = language;
      },
      restore: (original) => {
        this.settings.commandExplanationLanguage = original;
      },
    });
    return this.getSettingsView();
  }

  async setComposerSendKey(sendKey: ComposerSendKey): Promise<AppSettingsView> {
    if (!isComposerSendKey(sendKey)) throw new Error("Invalid composer send key");
    await this.settingsMutations.commit({
      context: "Composer-send-key mutation",
      capture: () => this.settings.composerSendKey,
      mutate: () => {
        this.settings.composerSendKey = sendKey;
      },
      restore: (original) => {
        this.settings.composerSendKey = original;
      },
    });
    return this.getSettingsView();
  }

  async setQuickPrompts(prompts: unknown): Promise<AppSettingsView> {
    if (prompts === null) {
      await this.settingsMutations.commit({
        context: "Quick-prompt reset",
        capture: () => this.settings.quickPrompts ? [...this.settings.quickPrompts] : undefined,
        mutate: () => {
          delete this.settings.quickPrompts;
        },
        restore: (original) => {
          if (original) this.settings.quickPrompts = [...original];
          else delete this.settings.quickPrompts;
        },
      });
    } else if (!isQuickPromptList(prompts)) {
      throw new Error("Quick prompts must contain between 1 and 5 non-empty items.");
    } else {
      const normalized = prompts.map((prompt) => prompt.trim());
      await this.settingsMutations.commit({
        context: "Quick-prompt mutation",
        capture: () => this.settings.quickPrompts ? [...this.settings.quickPrompts] : undefined,
        mutate: () => {
          this.settings.quickPrompts = [...normalized];
        },
        restore: (original) => {
          if (original) this.settings.quickPrompts = [...original];
          else delete this.settings.quickPrompts;
        },
      });
    }
    return this.getSettingsView();
  }

  async setSkillEnabled(name: string, enabled: boolean): Promise<void> {
    await this.lifecycle.mutate(async (lifecycle) => {
      const disabled = new Set(this.settings.disabledSkills);
      if (enabled) disabled.delete(name);
      else disabled.add(name);
      const nextDisabled = [...disabled];
      if (
        nextDisabled.length === this.settings.disabledSkills.length
        && nextDisabled.every((entry, index) => entry === this.settings.disabledSkills[index])
      ) return;
      const sessionPath = await this.resolvePreservedSessionPath(lifecycle);
      await this.reconfigureSession(lifecycle, (staged) => {
        staged.disabledSkills = [...nextDisabled];
      }, sessionPath);
    });
  }

  async addSkillDir(dir: string): Promise<void> {
    await this.lifecycle.mutate(async (lifecycle) => {
      if (!this.settings.skillDirs.includes(dir)) {
        const sessionPath = await this.resolvePreservedSessionPath(lifecycle);
        await this.reconfigureSession(lifecycle, (staged) => {
          staged.skillDirs = [...staged.skillDirs, dir];
        }, sessionPath);
      }
    });
  }

  async removeSkillDir(dir: string): Promise<void> {
    await this.lifecycle.mutate(async (lifecycle) => {
      const sessionPath = await this.resolvePreservedSessionPath(lifecycle);
      const nextSkillDirs = this.settings.skillDirs.filter((entry) => entry !== dir);
      if (nextSkillDirs.length === this.settings.skillDirs.length) return;
      await this.reconfigureSession(lifecycle, (staged) => {
        staged.skillDirs = [...nextSkillDirs];
      }, sessionPath);
    });
  }

  async setWorkspaceDir(dir: string): Promise<void> {
    await this.lifecycle.mutate(async (lifecycle) => {
      await this.reconfigureSession(lifecycle, (staged) => {
        staged.workspaceDir = dir;
      });
    });
  }

  get currentSessionFile(): string | undefined {
    return this.session?.sessionFile;
  }

  private applyDependencyExecutableEnvironment(): void {
    const targetPath = this.settings.dependencyExecutablePaths?.["phonak-target"]?.trim();
    if (targetPath) process.env.COMPASS_PHONAK_TARGET_PATH = targetPath;
    else delete process.env.COMPASS_PHONAK_TARGET_PATH;
  }

  private async ensureModelRuntime(): Promise<void> {
    if (this.modelRuntime && this.modelRegistry) return;
    this.modelRuntime = await this.modelRuntimePromise;
    this.modelRegistry = new ModelRegistry(this.modelRuntime);
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.idCounter}`;
  }

  private clientContextExtension(
    settings: AppSettings,
    sessionId: () => string | undefined,
  ): ExtensionFactory {
    return (pi) => {
      pi.on("before_agent_start", (event) => {
        const languageContext = buildLanguageContext(settings.language);
        const currentSessionId = sessionId();
        const clientContext = currentSessionId
          ? buildClientContext(this.getClientRegistry(), currentSessionId, settings.language)
          : undefined;
        return {
          systemPrompt: [event.systemPrompt, languageContext, clientContext]
            .filter(Boolean)
            .join("\n\n"),
        };
      });
    };
  }

  private currentClientContext(language = this.settings.language): string | undefined {
    const sessionId = this.session?.sessionId;
    return sessionId
      ? buildClientContext(this.getClientRegistry(), sessionId, language)
      : undefined;
  }

  private disposeSessionOwnership(ownership: SessionOwnership): void {
    try {
      ownership.approvals.cancelAll("The session closed before approval was granted.");
    } finally {
      try {
        this.discardSessionOwnership(ownership);
      } finally {
        ownership.events.reset();
      }
    }
  }

  private discardSessionOwnership(ownership: SessionOwnership): void {
    try {
      ownership.unsubscribe();
    } finally {
      ownership.session.dispose();
    }
  }

  private emitSessionEvent(ownership: SessionOwnership, event: AgentUiEvent): void {
    if (!ownership || !this.lifecycle.isManaged(ownership)) return;
    if (event.kind === "sessions-changed" || this.lifecycle.isForeground(ownership)) {
      this.emit(event);
    }
  }

  private sessionLibraryState(ownership: SessionOwnership | undefined): SessionLibraryState {
    const settings = ownership?.settings ?? this.settings;
    const session = ownership?.session;
    return {
      workspaceDir: settings.workspaceDir,
      language: settings.language,
      active: session
        ? {
            path: session.sessionFile,
            id: session.sessionId,
            name: session.sessionName,
            setName: (name) => session.setSessionName(name),
          }
        : undefined,
      thread: ownership
        ? ownership.events.snapshotThread(projectThread(session))
        : [],
    };
  }

  private sessionInfoFor(ownership: SessionOwnership): UiSessionInfo | undefined {
    const state = this.sessionLibraryState(ownership);
    const firstUser = state.thread.find((item) => item.kind === "user");
    if (!firstUser || !state.active?.path) return undefined;
    return {
      path: state.active.path,
      id: state.active.id,
      name: state.active.name,
      firstMessage: firstUser.text.trim()
        || (firstUser.images?.length ? "Image attachment" : "Untitled session"),
      createdAt: firstUser.ts,
      modifiedAt: state.thread.reduce((latest, item) => Math.max(latest, item.ts), firstUser.ts),
      messageCount: state.thread.filter(
        (item) => item.kind === "user" || item.kind === "assistant",
      ).length,
      isRunning: ownership.session.isStreaming,
    };
  }

  private appVersion(): string {
    // out/main -> project root; app.getAppPath() is unreliable when Electron
    // is launched with an entry file instead of the package directory.
    const candidates = [
      join(import.meta.dirname, "../../package.json"),
      join(app.getAppPath(), "package.json"),
    ];
    for (const file of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(file, "utf8")) as { version?: string; name?: string };
        if (pkg.name === "compass" && pkg.version) return pkg.version;
      } catch {
        // Try the next location.
      }
    }
    return app.getVersion();
  }

  private async resolvePreservedSessionPath(
    lifecycle: LifecycleMutation<SessionOwnership>,
  ): Promise<ListedSessionPath | undefined> {
    const sessionPath = lifecycle.current?.session.sessionFile;
    return sessionPath ? this.sessions.requireListedPath(sessionPath) : undefined;
  }

  private async navigateSession(sessionPath?: ListedSessionPath): Promise<void> {
    await this.ensureModelRuntime();
    await this.models.withStablePreferences(async () => {
      await this.lifecycle.navigate(
        (generation) => this.createSessionOwnership(generation, sessionPath, this.settings),
        sessionPath,
      );
    });
  }

  private async replaceSession(
    lifecycle: LifecycleMutation<SessionOwnership>,
    sessionPath?: ListedSessionPath,
  ): Promise<void> {
    await this.ensureModelRuntime();
    await this.models.withStablePreferences(async () => {
      await lifecycle.replace((generation) =>
        this.createSessionOwnership(generation, sessionPath, this.settings));
    });
  }

  private async reconfigureSession(
    lifecycle: LifecycleMutation<SessionOwnership>,
    stage: (settings: AppSettings) => void,
    sessionPath?: ListedSessionPath,
  ): Promise<void> {
    await this.ensureModelRuntime();
    await this.settingsMutations.runExclusive(() =>
      this.models.withStablePreferences(async () => {
        const staged = cloneSettings(this.settings);
        stage(staged);
        await lifecycle.replace(
          (generation) => this.createSessionOwnership(generation, sessionPath, staged),
          () => this.commitStagedSettings(staged),
        );
      }),
    );
  }

  private commitStagedSettings(staged: AppSettings): void {
    const previous = this.settings;
    try {
      saveSettings(staged);
    } catch (cause) {
      const failures: unknown[] = [];
      try {
        saveSettings(previous);
      } catch (error) {
        failures.push(new Error(
          `Could not restore settings after staged publication failed: ${String(error)}`,
          { cause: error },
        ));
      }
      throw compensatedMutationError("Session settings publication", cause, failures);
    }
    this.settings = staged;
  }
}
