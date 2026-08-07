import {
  AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionFactory,
  getAgentDir,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  Api,
  AssistantMessage,
  AuthInteraction,
  Model,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type {
  AgentStats,
  AgentUiEvent,
  AppLanguage,
  AppSettingsView,
  CommandExplanationLanguage,
  DependencyId,
  DeveloperContextSnapshot,
  InitPayload,
  ModelPreferenceUpdate,
  PermissionMode,
  RuntimePrerequisites,
  ThinkingLevel,
  UiImageAttachment,
  UiApprovalRequest,
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
  isPermissionMode,
  isThinkingLevel,
  modelSelectionKey,
} from "@shared/types";
import { isQuickPromptList } from "@shared/quick-prompts";
import { compactSkillText } from "../shared/skill-display.ts";
import { app } from "electron";
import { mkdir, rename, unlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { buildClientContext, buildLanguageContext, COMPASS_CONTEXT } from "./compass-context";
import {
  buildApprovalExplanationContext,
  normalizeGeneratedApprovalExplanation,
  resolveApprovalExplanationLanguage,
} from "./approval-explanation";
import { buildEstimatedContextBreakdown } from "./context-usage";
import { normalizeImages } from "./image-attachments";
import { evaluateToolApproval, type ToolApprovalRequest } from "./permission-policy";
import { getProviderAuthInfo, getProviderConfigurationIssue } from "./provider-auth";
import { getRuntimePrerequisites } from "./prerequisites";
import { SerialMutationQueue } from "./serial-mutation-queue";
import { mergeActiveSession } from "./session-list";
import { buildSessionTitleTranscript, normalizeGeneratedSessionTitle } from "./session-title";
import { type AppSettings, loadSettings, saveSettings } from "./settings";
import { discoverSkillDirs } from "./skills";
import {
  blocksOf,
  cloneForUi,
  imagesOfContent,
  isAssistantMessage,
  isRecord,
  isUserMessage,
  projectThread,
  textOfContent,
  usageOf,
} from "./thread-projector";

type Emit = (event: AgentUiEvent) => void;

type ToolApprovalDecision = undefined | { block: true; reason: string };

type AgentMessageKey =
  | "compacting" | "compactionFailed" | "compactionComplete" | "retrying"
  | "sessionInvalid" | "sessionDirectory" | "sessionOutside" | "nameEmpty"
  | "sessionArchived" | "sessionNotReady" | "modelNotFound" | "thinkingInvalid"
  | "modelUnavailable" | "modelRequired";

const AGENT_COPY: Record<AppLanguage, Record<AgentMessageKey, string>> = {
  "zh-CN": {
    compacting: "正在压缩会话上下文…", compactionFailed: "上下文压缩失败：{error}", compactionComplete: "上下文压缩完成。",
    retrying: "请求失败，正在自动重试（第 {attempt}/{max} 次）…", sessionInvalid: "会话不存在或路径无效", sessionDirectory: "无法解析会话目录",
    sessionOutside: "路径不在会话目录内", nameEmpty: "名称不能为空", sessionArchived: "会话已在归档目录中", sessionNotReady: "会话尚未就绪",
    modelNotFound: "未找到该模型", thinkingInvalid: "无效的思考深度", modelUnavailable: "该模型当前不可用，请先配置对应 Provider。", modelRequired: "至少需要保留一个可用模型。",
  },
  "zh-TW": {
    compacting: "正在壓縮對話上下文…", compactionFailed: "上下文壓縮失敗：{error}", compactionComplete: "上下文壓縮完成。",
    retrying: "要求失敗，正在自動重試（第 {attempt}/{max} 次）…", sessionInvalid: "對話不存在或路徑無效", sessionDirectory: "無法解析對話目錄",
    sessionOutside: "路徑不在對話目錄內", nameEmpty: "名稱不可為空", sessionArchived: "對話已在封存目錄中", sessionNotReady: "對話尚未就緒",
    modelNotFound: "找不到該模型", thinkingInvalid: "無效的思考深度", modelUnavailable: "此模型目前無法使用，請先設定對應的 Provider。", modelRequired: "至少必須保留一個可用模型。",
  },
  en: {
    compacting: "Compacting conversation context…", compactionFailed: "Context compaction failed: {error}", compactionComplete: "Context compaction complete.",
    retrying: "Request failed. Retrying automatically ({attempt}/{max})…", sessionInvalid: "The conversation does not exist or its path is invalid", sessionDirectory: "Could not resolve the conversation directory",
    sessionOutside: "The path is outside the conversation directory", nameEmpty: "The name cannot be empty", sessionArchived: "The conversation is already archived", sessionNotReady: "The conversation is not ready",
    modelNotFound: "Model not found", thinkingInvalid: "Invalid thinking level", modelUnavailable: "This model is unavailable. Configure its provider first.", modelRequired: "At least one available model must remain enabled.",
  },
  de: {
    compacting: "Unterhaltungskontext wird komprimiert…", compactionFailed: "Kontextkomprimierung fehlgeschlagen: {error}", compactionComplete: "Kontextkomprimierung abgeschlossen.",
    retrying: "Anfrage fehlgeschlagen. Automatischer Neuversuch ({attempt}/{max})…", sessionInvalid: "Die Unterhaltung existiert nicht oder der Pfad ist ungültig", sessionDirectory: "Unterhaltungsverzeichnis konnte nicht aufgelöst werden",
    sessionOutside: "Der Pfad liegt außerhalb des Unterhaltungsverzeichnisses", nameEmpty: "Der Name darf nicht leer sein", sessionArchived: "Die Unterhaltung ist bereits archiviert", sessionNotReady: "Die Unterhaltung ist noch nicht bereit",
    modelNotFound: "Modell nicht gefunden", thinkingInvalid: "Ungültige Denktiefe", modelUnavailable: "Dieses Modell ist nicht verfügbar. Konfigurieren Sie zuerst den Provider.", modelRequired: "Mindestens ein verfügbares Modell muss aktiviert bleiben.",
  },
};

function agentMessage(language: AppLanguage, key: AgentMessageKey, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    AGENT_COPY[language][key],
  );
}

interface PendingApproval {
  request: UiApprovalRequest;
  resolve(decision: ToolApprovalDecision): void;
  timer: ReturnType<typeof setTimeout>;
  explanationAbort: AbortController;
}

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1_000;

const APPROVAL_EXPLANATION_LANGUAGES: Record<AppLanguage, string> = {
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  en: "English",
  de: "German",
};

function normalizeThinkingLevels(levels: readonly unknown[]): ThinkingLevel[] {
  const normalized = [...new Set(levels.filter(isThinkingLevel))];
  return normalized.length > 0 ? normalized : ["off"];
}

function normalizeThinkingLevel(value: unknown, available: ThinkingLevel[]): ThinkingLevel {
  return isThinkingLevel(value) && available.includes(value) ? value : (available[0] ?? "off");
}

function toolResultContent(value: unknown): ToolResultMessage["content"] | undefined {
  return isRecord(value) && Array.isArray(value.content)
    ? (value.content as ToolResultMessage["content"])
    : undefined;
}


export class AgentService {
  private emit: Emit;
  private settings: AppSettings;
  private readonly modelRuntimePromise: Promise<ModelRuntime>;
  private modelRuntime!: ModelRuntime;
  private modelRegistry!: ModelRegistry;
  private session?: AgentSession;
  private unsubscribe?: () => void;
  private loader?: DefaultResourceLoader;
  private idCounter = 0;
  private currentAssistantId?: string;
  private pendingUserMessageIds: string[] = [];
  private pendingApprovals = new Map<string, PendingApproval>();
  private readonly modelPreferenceUpdates = new SerialMutationQueue();
  private sessionTitleRequests = new Set<string>();
  private getClientRegistry: () => InitPayload["clientRegistry"];

  constructor(emit: Emit, getClientRegistry: () => InitPayload["clientRegistry"]) {
    this.emit = emit;
    this.getClientRegistry = getClientRegistry;
    this.settings = loadSettings();
    this.applyDependencyExecutableEnvironment();
    this.modelRuntimePromise = ModelRuntime.create();
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

  private permissionExtension(): ExtensionFactory {
    return (pi) => {
      pi.on("tool_call", async (event) => {
        const approval = evaluateToolApproval(
          this.settings.permissionMode,
          this.settings.workspaceDir,
          event.toolName,
          event.input,
        );
        if (!approval) return undefined;
        return this.requestToolApproval(approval, event.toolName, event.input);
      });
    };
  }

  private clientContextExtension(): ExtensionFactory {
    return (pi) => {
      pi.on("before_agent_start", (event) => {
        const languageContext = buildLanguageContext(this.settings.language);
        const clientContext = this.currentClientContext();
        return {
          systemPrompt: [event.systemPrompt, languageContext, clientContext].filter(Boolean).join("\n\n"),
        };
      });
    };
  }

  private currentClientContext(): string | undefined {
    const sessionId = this.session?.sessionId;
    return sessionId
      ? buildClientContext(this.getClientRegistry(), sessionId, this.settings.language)
      : undefined;
  }

  private requestToolApproval(
    approval: ToolApprovalRequest,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolApprovalDecision> {
    const request: UiApprovalRequest = {
      id: this.nextId("approval"),
      toolName,
      message: approval.message,
      detail: approval.detail,
      args: cloneForUi(args),
      explanationPending: true,
      ts: Date.now(),
    };

    return new Promise<ToolApprovalDecision>((resolveDecision) => {
      const explanationAbort = new AbortController();
      const timer = setTimeout(() => {
        this.finishApproval(request.id, {
          block: true,
          reason: "The approval request expired before the operator responded.",
        });
      }, APPROVAL_TIMEOUT_MS);
      timer.unref();
      this.pendingApprovals.set(request.id, {
        request,
        resolve: resolveDecision,
        timer,
        explanationAbort,
      });
      this.emit({ kind: "approval-request", request });
      void this.generateApprovalExplanation(request.id);
    });
  }

  private publishApprovalExplanation(id: string, explanation?: string): void {
    const pending = this.pendingApprovals.get(id);
    if (!pending) return;
    pending.request.explanation = explanation;
    pending.request.explanationPending = false;
    this.emit({ kind: "approval-explanation", id, explanation });
  }

  private async generateApprovalExplanation(id: string): Promise<void> {
    const pending = this.pendingApprovals.get(id);
    if (!pending) return;
    const { request, explanationAbort } = pending;

    const context = buildApprovalExplanationContext(request);
    let explanation: string | undefined;
    try {
      if (!context) return;
      const selection = this.settings.summaryModel ?? DEFAULT_SUMMARY_MODEL;
      const model = this.modelRegistry.find(selection.provider, selection.id);
      if (!model || !this.isModelConnectable(model)) return;

      const auth = await this.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) return;
      const explanationLanguage = resolveApprovalExplanationLanguage(
        this.settings.commandExplanationLanguage,
        this.settings.language,
      );
      const response = await completeSimple(
        model,
        {
          systemPrompt: [
            "Explain what the requested tool action will do in exactly one concise sentence.",
            `Write in ${APPROVAL_EXPLANATION_LANGUAGES[explanationLanguage]}.`,
            "Describe the concrete intent and main effect without recommending whether to approve it.",
            "Return only the sentence with no markdown, label, or preamble.",
          ].join(" "),
          messages: [{ role: "user", content: context, timestamp: Date.now() }],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          env: auth.env,
          maxTokens: 140,
          reasoning: "minimal",
          signal: explanationAbort.signal,
        },
      );
      if (response.stopReason === "error" || response.stopReason === "aborted") return;
      explanation = normalizeGeneratedApprovalExplanation(
        response.content
          .filter((content) => content.type === "text")
          .map((content) => content.text)
          .join("\n"),
      ) ?? undefined;
    } catch {
      // Approval explanations are best-effort and must never block the decision.
    } finally {
      this.publishApprovalExplanation(id, explanation);
    }
  }

  private finishApproval(id: string, decision: ToolApprovalDecision): boolean {
    const pending = this.pendingApprovals.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pending.explanationAbort.abort();
    this.pendingApprovals.delete(id);
    this.emit({ kind: "approval-resolved", id });
    pending.resolve(decision);
    return true;
  }

  resolveApproval(id: string, allowed: boolean): { ok: boolean; error?: string } {
    const resolved = this.finishApproval(
      id,
      allowed ? undefined : { block: true, reason: "The operator denied this action." },
    );
    return resolved ? { ok: true } : { ok: false, error: "Approval request is no longer active." };
  }

  private cancelPendingApprovals(reason: string): void {
    for (const id of [...this.pendingApprovals.keys()]) {
      this.finishApproval(id, { block: true, reason });
    }
  }

  // ---------------------------------------------------------------- session

  async start(options?: { sessionPath?: string }): Promise<void> {
    this.disposeSession();
    await this.ensureModelRuntime();
    this.ensureModelPreferences();

    const cwd = this.settings.workspaceDir;
    const skillDirs = [
      ...discoverSkillDirs(cwd),
      ...this.settings.skillDirs.flatMap((dir) => discoverSkillDirs(dir)),
    ];

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      additionalSkillPaths: [...new Set(skillDirs)],
      extensionFactories: [
        { name: "compass-permission-policy", factory: this.permissionExtension() },
        { name: "compass-client-context", factory: this.clientContextExtension() },
      ],
      skillsOverride: (base) => ({
        skills: base.skills.filter((skill) => !this.settings.disabledSkills.includes(skill.name)),
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
    this.loader = loader;

    const sessionManager = options?.sessionPath
      ? SessionManager.open(options.sessionPath)
      : SessionManager.create(cwd);

    const preferred = this.settings.defaultModel
      ? this.modelRegistry.find(this.settings.defaultModel.provider, this.settings.defaultModel.id)
      : undefined;
    const model =
      preferred && this.isModelConnectable(preferred)
        ? preferred
        : undefined;

    const { session } = await createAgentSession({
      cwd,
      agentDir: getAgentDir(),
      resourceLoader: loader,
      sessionManager,
      modelRuntime: this.modelRuntime,
      ...(model && !options?.sessionPath ? { model } : {}),
    });

    this.session = session;
    this.unsubscribe = session.subscribe((event) => this.onSessionEvent(event));

    if (!options?.sessionPath && isThinkingLevel(this.settings.thinkingLevel) && session.model) {
      try {
        session.setThinkingLevel(this.settings.thinkingLevel);
      } catch {
        /* model may not support the stored level */
      }
    }
  }

  private disposeSession(): void {
    this.cancelPendingApprovals("The session changed before approval was granted.");
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.session?.dispose();
    this.session = undefined;
    this.currentAssistantId = undefined;
    this.pendingUserMessageIds = [];
  }

  async shutdown(): Promise<void> {
    if (this.session?.isStreaming) {
      try {
        await this.session.abort();
      } catch {
        /* ignore */
      }
    }
    this.disposeSession();
  }

  // ----------------------------------------------------------------- events

  private onSessionEvent(event: AgentSessionEvent): void {
    switch (event.type) {
      case "agent_start":
        this.emit({ kind: "agent-start" });
        break;
      case "agent_end":
        this.emitStats();
        this.emit({ kind: "sessions-changed" });
        break;
      case "agent_settled":
        // AgentSession clears its run-active flag immediately before this
        // event. `agent_end` can still be followed by retries, compaction, or
        // queued continuations, so it is too early to clear the renderer's
        // streaming state there.
        this.emit({ kind: "agent-end" });
        this.emitStats();
        this.emit({ kind: "sessions-changed" });
        void this.generateMissingSessionTitle();
        break;
      case "message_start": {
        if (isAssistantMessage(event.message)) {
          this.currentAssistantId = this.nextId("a");
          this.emit({
            kind: "assistant-start",
            id: this.currentAssistantId,
            ts: event.message.timestamp ?? Date.now(),
          });
        }
        break;
      }
      case "message_update": {
        const update = event.assistantMessageEvent;
        if (!this.currentAssistantId) break;
        if (update.type === "text_delta") {
          this.emit({
            kind: "assistant-delta",
            id: this.currentAssistantId,
            blockType: "text",
            contentIndex: update.contentIndex,
            delta: update.delta,
          });
        } else if (update.type === "thinking_delta") {
          this.emit({
            kind: "assistant-delta",
            id: this.currentAssistantId,
            blockType: "thinking",
            contentIndex: update.contentIndex,
            delta: update.delta,
          });
        }
        break;
      }
      case "message_end": {
        const message = event.message;
        if (isUserMessage(message)) {
          const expandedText = textOfContent(message.content);
          const display = compactSkillText(expandedText);
          const images = imagesOfContent(message.content);
          if (display.text.trim() || display.skillName || images.length > 0) {
            this.emit({
              kind: "user-message",
              id: this.pendingUserMessageIds.shift() ?? this.nextId("u"),
              text: display.text,
              skillName: display.skillName,
              images: images.length > 0 ? images : undefined,
              ts: message.timestamp,
            });
            this.emit({ kind: "sessions-changed" });
          }
        } else if (isAssistantMessage(message) && this.currentAssistantId) {
          this.emit({
            kind: "assistant-end",
            id: this.currentAssistantId,
            blocks: blocksOf(message),
            stopReason: message.stopReason,
            errorMessage: message.errorMessage,
            usage: usageOf(message),
          });
          this.currentAssistantId = undefined;
          this.emitStats();
        }
        break;
      }
      case "tool_execution_start":
        this.emit({
          kind: "tool-start",
          id: this.nextId("t"),
          callId: event.toolCallId,
          name: event.toolName,
          args: cloneForUi(event.args),
          ts: Date.now(),
        });
        break;
      case "tool_execution_update": {
        this.emit({
          kind: "tool-update",
          callId: event.toolCallId,
          output: textOfContent(toolResultContent(event.partialResult)),
        });
        break;
      }
      case "tool_execution_end": {
        this.emit({
          kind: "tool-end",
          callId: event.toolCallId,
          output: textOfContent(toolResultContent(event.result)),
          isError: event.isError,
        });
        break;
      }
      case "queue_update":
        this.emit({
          kind: "queue-update",
          steering: [...event.steering],
          followUp: [...event.followUp],
        });
        break;
      case "compaction_start":
        this.emit({
          kind: "notice",
          tone: "info",
          text: agentMessage(this.settings.language, "compacting"),
          ts: Date.now(),
        });
        break;
      case "compaction_end":
        this.emit({
          kind: "notice",
          tone: event.errorMessage ? "warn" : "info",
          text: event.errorMessage
            ? agentMessage(this.settings.language, "compactionFailed", { error: event.errorMessage })
            : agentMessage(this.settings.language, "compactionComplete"),
          ts: Date.now(),
        });
        this.emitStats();
        break;
      case "auto_retry_start":
        this.emit({
          kind: "notice",
          tone: "warn",
          text: agentMessage(this.settings.language, "retrying", {
            attempt: event.attempt,
            max: event.maxAttempts,
          }),
          ts: Date.now(),
        });
        break;
      case "session_info_changed":
        this.emit({ kind: "sessions-changed" });
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ state

  getStats(): AgentStats {
    const session = this.session;
    if (!session) {
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
        modelAuthConfigured = this.isModelConnectable(model);
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
        this.loader?.getSkills().skills ?? [],
      ),
      cost: stats.cost,
      tokensIn: stats.tokens.input,
      tokensOut: stats.tokens.output,
    };
  }

  private emitStats(): void {
    this.emit({ kind: "stats", stats: this.getStats() });
  }

  getThread(): UiThreadItem[] {
    return projectThread(this.session);
  }

  getApprovals(): UiApprovalRequest[] {
    return [...this.pendingApprovals.values()].map(({ request }) => ({ ...request }));
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
    // skillsOverride filters disabled skills out of the loader result, so
    // surface them here from raw discovery for toggling back on.
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
    return this.modelRegistry
      .getAvailable()
      .filter((model) => this.isModelConnectable(model))
      .map((model) => ({
        provider: String(model.provider),
        providerName: this.modelRegistry.getProviderDisplayName(String(model.provider)),
        id: model.id,
        name: model.name ?? model.id,
        reasoning: Boolean(model.reasoning),
        supportsImages: model.input?.includes("image") ?? false,
        contextWindow: model.contextWindow ?? 0,
      }));
  }

  private connectableModels(): Model<Api>[] {
    return this.modelRegistry.getAvailable().filter((model) => this.isModelConnectable(model));
  }

  private ensureModelPreferences(): void {
    const connectable = this.connectableModels();
    if (connectable.length === 0) return;

    const enabled = new Set(this.settings.enabledModels);
    const preferred = this.settings.defaultModel
      ? connectable.find(
          (model) =>
            String(model.provider) === this.settings.defaultModel?.provider &&
            model.id === this.settings.defaultModel.id,
        )
      : undefined;
    let enabledConnectable = connectable.filter((model) =>
      enabled.has(modelSelectionKey(String(model.provider), model.id)),
    );
    let changed = false;

    if (enabledConnectable.length === 0) {
      const initial = preferred ?? connectable[0];
      enabled.add(modelSelectionKey(String(initial.provider), initial.id));
      enabledConnectable = [initial];
      changed = true;
    }

    const defaultKey = this.settings.defaultModel
      ? modelSelectionKey(this.settings.defaultModel.provider, this.settings.defaultModel.id)
      : undefined;
    if (!defaultKey || !enabled.has(defaultKey) || !preferred) {
      const nextDefault = enabledConnectable[0];
      this.settings.defaultModel = {
        provider: String(nextDefault.provider),
        id: nextDefault.id,
      };
      changed = true;
    }

    const normalized = [...enabled];
    if (
      normalized.length !== this.settings.enabledModels.length ||
      normalized.some((key, index) => key !== this.settings.enabledModels[index])
    ) {
      this.settings.enabledModels = normalized;
      changed = true;
    }
    if (changed) saveSettings(this.settings);
  }

  private enabledModelKeys(): string[] {
    return [...this.settings.enabledModels];
  }

  getProviders(): UiProviderStatus[] {
    const providers = new Map<string, UiProviderStatus>();
    const allModels = this.modelRegistry.getAll();
    const modelsByProvider = new Map<string, Model<Api>[]>();
    const oauthIds = new Set(
      this.modelRuntime
        .getProviders()
        .filter((provider) => provider.auth.oauth !== undefined)
        .map((provider) => provider.id),
    );
    for (const model of allModels) {
      const id = String(model.provider);
      const providerModels = modelsByProvider.get(id) ?? [];
      providerModels.push(model);
      modelsByProvider.set(id, providerModels);
    }
    for (const [id, providerModels] of modelsByProvider) {
      const status = this.modelRegistry.getProviderAuthStatus(id);
      const credentialConfigured = providerModels.some((candidate) => {
        try {
          return this.modelRegistry.hasConfiguredAuth(candidate);
        } catch {
          return false;
        }
      });
      const configurationIssue = getProviderConfigurationIssue(id, providerModels);
      const authInfo = getProviderAuthInfo(id, oauthIds.has(id));
      providers.set(id, {
        id,
        name: this.modelRegistry.getProviderDisplayName(id),
        configured: credentialConfigured && !configurationIssue,
        source:
          status.source ??
          (credentialConfigured
            ? id === "amazon-bedrock"
              ? "environment"
              : "configured"
            : undefined),
        sourceLabel:
          status.label ?? (credentialConfigured && id === "amazon-bedrock" ? "AWS credential chain" : undefined),
        configurationIssue,
        hasModels: true,
        supportsApiKey: authInfo.supportsApiKey,
        supportsOAuth: Boolean(authInfo.supportsOAuth),
        envVars: authInfo.envVars,
        requiredEnv: authInfo.requiredEnv,
        authNote: authInfo.authNote,
      });
    }
    return [...providers.values()].sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  private isModelConnectable(model: Model<Api>): boolean {
    return (
      this.modelRegistry.hasConfiguredAuth(model) &&
      !getProviderConfigurationIssue(String(model.provider), [model])
    );
  }

  async listSessions(): Promise<UiSessionInfo[]> {
    const sessions = (await SessionManager.list(this.settings.workspaceDir))
      .map((info) => {
        const displayName = info.name ? compactSkillText(info.name) : undefined;
        return {
        path: info.path,
        id: info.id,
        name: displayName
          ? displayName.text || (displayName.skillName ? `Skill: ${displayName.skillName}` : info.name)
          : info.name,
        firstMessage: (() => {
          const display = compactSkillText(info.firstMessage);
          return display.text || (display.skillName ? `Skill: ${display.skillName}` : info.firstMessage);
        })(),
        createdAt: info.created.getTime(),
        modifiedAt: info.modified.getTime(),
        messageCount: info.messageCount,
        };
      });
    const projected = this.getThread();
    const firstUser = projected.find((item) => item.kind === "user");
    const sessionPath = this.session?.sessionFile;
    const active = firstUser && sessionPath && this.session
      ? {
          path: sessionPath,
          id: this.session.sessionId,
          name: this.session.sessionName,
          firstMessage: firstUser.text.trim() || (firstUser.images?.length ? "Image attachment" : "Untitled session"),
          createdAt: firstUser.ts,
          modifiedAt: projected.reduce((latest, item) => Math.max(latest, item.ts), firstUser.ts),
          messageCount: projected.filter((item) => item.kind === "user" || item.kind === "assistant").length,
        }
      : undefined;
    return mergeActiveSession(sessions, active);
  }

  private async resolveWorkspaceSessionDir(): Promise<string | null> {
    const sessions = await SessionManager.list(this.settings.workspaceDir);
    if (sessions.length === 0) return null;
    return resolve(dirname(sessions[0].path));
  }

  private async assertListedSessionPath(
    path: string,
  ): Promise<{ ok: true; sessionDir: string } | { ok: false; error: string }> {
    const sessions = await SessionManager.list(this.settings.workspaceDir);
    const listed = sessions.some((session) => session.path === path);
    if (!listed) {
      return { ok: false, error: agentMessage(this.settings.language, "sessionInvalid") };
    }
    const sessionDir = await this.resolveWorkspaceSessionDir();
    if (!sessionDir) {
      return { ok: false, error: agentMessage(this.settings.language, "sessionDirectory") };
    }
    const normalizedPath = resolve(path);
    if (!normalizedPath.startsWith(sessionDir + sep)) {
      return { ok: false, error: agentMessage(this.settings.language, "sessionOutside") };
    }
    return { ok: true, sessionDir };
  }

  private async detachIfActiveSession(path: string): Promise<void> {
    if (this.currentSessionFile !== path) return;
    await this.start();
  }

  async renameSession(path: string, name: string): Promise<{ ok: boolean; error?: string }> {
    const allowed = await this.assertListedSessionPath(path);
    if (!allowed.ok) return allowed;
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: agentMessage(this.settings.language, "nameEmpty") };
    try {
      const manager = SessionManager.open(path);
      manager.appendSessionInfo(trimmed);
      this.emit({ kind: "sessions-changed" });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async generateMissingSessionTitle(): Promise<void> {
    const session = this.session;
    const sessionPath = session?.sessionFile;
    if (!session || !sessionPath || session.sessionName || this.sessionTitleRequests.has(sessionPath)) return;

    const thread = this.getThread();
    const hasAssistantText = thread.some(
      (item) => item.kind === "assistant" && item.blocks.some((block) => block.type === "text" && block.text.trim()),
    );
    if (!hasAssistantText) return;

    const transcript = buildSessionTitleTranscript(thread);
    if (!transcript) return;

    const selection = this.settings.summaryModel ?? DEFAULT_SUMMARY_MODEL;
    const model = this.modelRegistry.find(selection.provider, selection.id);
    if (!model || !this.isModelConnectable(model)) return;

    this.sessionTitleRequests.add(sessionPath);
    try {
      const auth = await this.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) return;
      const response = await completeSimple(
        model,
        {
          systemPrompt: [
            "Generate a concise title for this conversation.",
            "Match the conversation language.",
            "Use 4-12 Chinese characters or 3-8 English words.",
            "Return only the title with no quotes, markdown, labels, or punctuation.",
          ].join(" "),
          messages: [{ role: "user", content: transcript, timestamp: Date.now() }],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          env: auth.env,
          maxTokens: 80,
          reasoning: "minimal",
        },
      );
      if (response.stopReason === "error" || response.stopReason === "aborted") return;
      const title = normalizeGeneratedSessionTitle(
        response.content
          .filter((content) => content.type === "text")
          .map((content) => content.text)
          .join("\n"),
      );
      if (!title) return;

      const persistedSession = SessionManager.open(sessionPath);
      if (persistedSession.getSessionName()) return;
      if (this.session?.sessionFile === sessionPath && !this.session.sessionName) {
        this.session.setSessionName(title);
      } else {
        persistedSession.appendSessionInfo(title);
        this.emit({ kind: "sessions-changed" });
      }
    } catch {
      // Title generation is best-effort and must never interrupt the conversation.
    } finally {
      this.sessionTitleRequests.delete(sessionPath);
    }
  }

  async archiveSession(path: string): Promise<{ ok: boolean; error?: string }> {
    const allowed = await this.assertListedSessionPath(path);
    if (!allowed.ok) return allowed;
    try {
      const archiveDir = join(allowed.sessionDir, "archive");
      await mkdir(archiveDir, { recursive: true });
      const targetPath = join(archiveDir, basename(path));
      if (resolve(targetPath) === resolve(path)) {
        return { ok: false, error: agentMessage(this.settings.language, "sessionArchived") };
      }
      await this.detachIfActiveSession(path);
      await rename(path, targetPath);
      this.emit({ kind: "sessions-changed" });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async deleteSession(path: string): Promise<{ ok: boolean; error?: string }> {
    const allowed = await this.assertListedSessionPath(path);
    if (!allowed.ok) return allowed;
    try {
      await this.detachIfActiveSession(path);
      await unlink(path);
      this.emit({ kind: "sessions-changed" });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  getSettingsView(): AppSettingsView {
    return {
      language: this.settings.language,
      commandExplanationLanguage: this.settings.commandExplanationLanguage,
      workspaceDir: this.settings.workspaceDir,
      skillDirs: [...this.settings.skillDirs],
      disabledSkills: [...this.settings.disabledSkills],
      permissionMode: this.settings.permissionMode,
      enabledModels: this.enabledModelKeys(),
      summaryModel: { ...(this.settings.summaryModel ?? DEFAULT_SUMMARY_MODEL) },
      ...(this.settings.quickPrompts ? { quickPrompts: [...this.settings.quickPrompts] } : {}),
    };
  }

  getPrerequisites(): RuntimePrerequisites {
    return getRuntimePrerequisites(this.settings.workspaceDir);
  }

  getDependencyExecutablePath(dependencyId: DependencyId): string | undefined {
    return this.settings.dependencyExecutablePaths?.[dependencyId];
  }

  setDependencyExecutablePath(dependencyId: DependencyId, path?: string): void {
    const executablePaths = { ...this.settings.dependencyExecutablePaths };
    if (path) executablePaths[dependencyId] = path;
    else delete executablePaths[dependencyId];
    if (Object.keys(executablePaths).length > 0) {
      this.settings.dependencyExecutablePaths = executablePaths;
    } else {
      delete this.settings.dependencyExecutablePaths;
    }
    saveSettings(this.settings);
    this.applyDependencyExecutableEnvironment();
  }

  private appVersion(): string {
    // out/main -> project root; app.getAppPath() is unreliable when electron
    // is launched with an entry file instead of the package dir.
    const candidates = [
      join(import.meta.dirname, "../../package.json"),
      join(app.getAppPath(), "package.json"),
    ];
    for (const file of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(file, "utf8")) as { version?: string; name?: string };
        if (pkg.name === "compass" && pkg.version) return pkg.version;
      } catch {
        /* try next */
      }
    }
    return app.getVersion();
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

  // ---------------------------------------------------------------- actions

  async prompt(
    text: string,
    images?: UiImageAttachment[],
    clientMessageId?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const session = this.session;
    if (!session) return { ok: false, error: agentMessage(this.settings.language, "sessionNotReady") };
    if (clientMessageId) this.pendingUserMessageIds.push(clientMessageId);
    try {
      const normalizedImages = normalizeImages(images, this.settings.language);
      if (session.isStreaming) {
        await session.prompt(text, { images: normalizedImages, streamingBehavior: "steer" });
      } else {
        await session.prompt(text, { images: normalizedImages });
      }
      return { ok: true };
    } catch (error) {
      if (clientMessageId) {
        this.pendingUserMessageIds = this.pendingUserMessageIds.filter((id) => id !== clientMessageId);
      }
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async abort(): Promise<void> {
    this.cancelPendingApprovals("The task was stopped before approval was granted.");
    await this.session?.abort();
  }

  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }> {
    return this.modelPreferenceUpdates.enqueue(() => this.applyModel(provider, id));
  }

  private async applyModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }> {
    const session = this.session;
    const model = this.modelRegistry.find(provider, id);
    if (!session || !model) return { ok: false, error: agentMessage(this.settings.language, "modelNotFound") };
    try {
      await session.setModel(model);
      this.settings.defaultModel = { provider, id };
      const enabledModels = new Set(this.enabledModelKeys());
      enabledModels.add(modelSelectionKey(provider, id));
      this.settings.enabledModels = [...enabledModels];
      saveSettings(this.settings);
      this.emitStats();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  setSummaryModel(provider: string, id: string): AppSettingsView {
    const model = this.modelRegistry.find(provider, id);
    if (!model) throw new Error(agentMessage(this.settings.language, "modelNotFound"));
    this.settings.summaryModel = { provider, id };
    saveSettings(this.settings);
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
        role: typeof message === "object" && message && "role" in message ? String(message.role) : "unknown",
        content: cloneForUi(message),
      })),
    };
  }

  setThinkingLevel(level: unknown): AgentStats {
    if (!isThinkingLevel(level)) {
      throw new Error(agentMessage(this.settings.language, "thinkingInvalid"));
    }
    if (this.session) {
      this.session.setThinkingLevel(level);
      this.settings.thinkingLevel = this.session.thinkingLevel;
      saveSettings(this.settings);
    }
    return this.getStats();
  }

  async setApiKey(provider: string, key: string): Promise<void> {
    await this.modelRuntime.login(provider, "api_key", {
      prompt: async (prompt) => {
        if (prompt.type !== "secret") {
          throw new Error(`Unexpected ${prompt.type} prompt while saving an API key for ${provider}`);
        }
        return key;
      },
      notify: () => {},
    });
    this.ensureModelPreferences();
    await this.syncSessionModelAfterAuth(provider);
    this.emitStats();
  }

  async loginProvider(provider: string, interaction: AuthInteraction): Promise<void> {
    await this.modelRuntime.login(provider, "oauth", interaction);
    this.ensureModelPreferences();
    await this.syncSessionModelAfterAuth(provider);
    this.emitStats();
  }

  async removeApiKey(provider: string): Promise<void> {
    await this.modelRuntime.logout(provider);
    this.ensureModelPreferences();
    const session = this.session;
    const current = session?.model;
    if (session && current && !this.isModelConnectable(current)) {
      const enabled = new Set(this.settings.enabledModels);
      const replacement = this.connectableModels().find((model) =>
        enabled.has(modelSelectionKey(String(model.provider), model.id)),
      );
      if (replacement) {
        await session.setModel(replacement);
        this.settings.defaultModel = {
          provider: String(replacement.provider),
          id: replacement.id,
        };
        saveSettings(this.settings);
      }
    }
    this.emitStats();
  }

  setModelEnabled(
    provider: string,
    id: string,
    enabled: boolean,
  ): Promise<ModelPreferenceUpdate> {
    return this.modelPreferenceUpdates.enqueue(() =>
      this.applyModelEnabled(provider, id, enabled),
    );
  }

  private async applyModelEnabled(
    provider: string,
    id: string,
    enabled: boolean,
  ): Promise<ModelPreferenceUpdate> {
    const model = this.modelRegistry.find(provider, id);
    if (enabled && (!model || !this.isModelConnectable(model))) {
      throw new Error(agentMessage(this.settings.language, "modelUnavailable"));
    }
    const enabledModels = new Set(this.enabledModelKeys());
    const key = modelSelectionKey(provider, id);
    if (enabled) {
      enabledModels.add(key);
    } else {
      if (!enabledModels.has(key)) {
        return { settings: this.getSettingsView(), stats: this.getStats() };
      }
      const replacements = this.connectableModels().filter(
        (candidate) => {
          const candidateKey = modelSelectionKey(String(candidate.provider), candidate.id);
          return candidateKey !== key && enabledModels.has(candidateKey);
        },
      );
      if (replacements.length === 0) {
        throw new Error(agentMessage(this.settings.language, "modelRequired"));
      }
      const replacement = replacements[0];
      const current = this.session?.model;
      const currentKey = current
        ? modelSelectionKey(String(current.provider), current.id)
        : undefined;
      if (currentKey === key && this.session) {
        await this.session.setModel(replacement);
      }
      enabledModels.delete(key);
      const defaultKey = this.settings.defaultModel
        ? modelSelectionKey(this.settings.defaultModel.provider, this.settings.defaultModel.id)
        : undefined;
      if (defaultKey === key || currentKey === key) {
        this.settings.defaultModel = {
          provider: String(replacement.provider),
          id: replacement.id,
        };
      }
    }
    this.settings.enabledModels = [...enabledModels];
    saveSettings(this.settings);
    this.emitStats();
    return { settings: this.getSettingsView(), stats: this.getStats() };
  }

  setPermissionMode(mode: PermissionMode): AppSettingsView {
    if (!isPermissionMode(mode)) throw new Error("无效的权限模式");
    this.settings.permissionMode = mode;
    saveSettings(this.settings);
    return this.getSettingsView();
  }

  setLanguage(language: AppSettingsView["language"]): AppSettingsView {
    if (!isAppLanguage(language)) throw new Error("Invalid application language");
    this.settings.language = language;
    saveSettings(this.settings);
    return this.getSettingsView();
  }

  setCommandExplanationLanguage(language: CommandExplanationLanguage): AppSettingsView {
    if (!isCommandExplanationLanguage(language)) {
      throw new Error("Invalid command explanation language");
    }
    this.settings.commandExplanationLanguage = language;
    saveSettings(this.settings);
    return this.getSettingsView();
  }

  setQuickPrompts(prompts: unknown): AppSettingsView {
    if (prompts === null) {
      delete this.settings.quickPrompts;
      saveSettings(this.settings);
      return this.getSettingsView();
    }
    if (!isQuickPromptList(prompts)) {
      throw new Error("Quick prompts must contain between 1 and 5 non-empty items.");
    }
    this.settings.quickPrompts = prompts.map((prompt) => prompt.trim());
    saveSettings(this.settings);
    return this.getSettingsView();
  }

  async setSkillEnabled(name: string, enabled: boolean): Promise<void> {
    const set = new Set(this.settings.disabledSkills);
    if (enabled) set.delete(name);
    else set.add(name);
    this.settings.disabledSkills = [...set];
    saveSettings(this.settings);
    await this.session?.reload();
  }

  async addSkillDir(dir: string): Promise<void> {
    if (!this.settings.skillDirs.includes(dir)) {
      this.settings.skillDirs.push(dir);
      saveSettings(this.settings);
      await this.restartPreservingSession();
    }
  }

  async removeSkillDir(dir: string): Promise<void> {
    this.settings.skillDirs = this.settings.skillDirs.filter((entry) => entry !== dir);
    saveSettings(this.settings);
    await this.restartPreservingSession();
  }

  async setWorkspaceDir(dir: string): Promise<void> {
    this.settings.workspaceDir = dir;
    saveSettings(this.settings);
    await this.start(); // new workspace ⇒ fresh session bound to new cwd
  }

  private async restartPreservingSession(): Promise<void> {
    const sessionPath = this.session?.sessionFile;
    await this.start(sessionPath ? { sessionPath } : undefined);
  }

  private async syncSessionModelAfterAuth(provider: string): Promise<void> {
    const session = this.session;
    if (!session) return;
    const current = session.model;
    const candidate =
      current && String(current.provider) === provider
        ? this.modelRegistry.find(provider, current.id)
        : !current
          ? this.modelRegistry
              .getAvailable()
              .find((model) => String(model.provider) === provider && this.isModelConnectable(model))
          : undefined;
    if (!candidate || !this.isModelConnectable(candidate)) return;
    try {
      await session.setModel(candidate);
      this.settings.defaultModel = { provider, id: candidate.id };
      const enabledModels = new Set(this.settings.enabledModels);
      enabledModels.add(modelSelectionKey(provider, candidate.id));
      this.settings.enabledModels = [...enabledModels];
      saveSettings(this.settings);
    } catch {
      /* stay on the current model; user can pick manually */
    }
  }

  get currentSessionFile(): string | undefined {
    return this.session?.sessionFile;
  }
}
