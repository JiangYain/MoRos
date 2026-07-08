import {
  AgentSession,
  type AgentSessionEvent,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { Api, Model, OAuthLoginCallbacks } from "@mariozechner/pi-ai";
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
  UiUsage,
} from "@shared/types";
import { app } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPASS_CONTEXT } from "./compass-context";
import { getProviderAuthInfo } from "./provider-auth";
import { type AppSettings, loadSettings, saveSettings } from "./settings";
import { discoverSkillDirs } from "./skills";

type Emit = (event: AgentUiEvent) => void;

interface AnyContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

interface AnyMessage {
  role?: string;
  content?: string | AnyContentBlock[];
  timestamp?: number;
  stopReason?: string;
  errorMessage?: string;
  usage?: { input: number; output: number; cost: { total: number } };
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
}

function textOfContent(content: string | AnyContentBlock[] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

function usageOf(message: AnyMessage): UiUsage | undefined {
  const usage = message.usage;
  if (!usage) return undefined;
  return { input: usage.input ?? 0, output: usage.output ?? 0, cost: usage.cost?.total ?? 0 };
}

function blocksOf(message: AnyMessage): UiBlock[] {
  const blocks: UiBlock[] = [];
  if (!message.content || typeof message.content === "string") {
    const text = textOfContent(message.content);
    if (text) blocks.push({ type: "text", text });
    return blocks;
  }
  for (const block of message.content) {
    if (block.type === "thinking" && block.thinking?.trim()) {
      blocks.push({ type: "thinking", text: block.thinking });
    } else if (block.type === "text" && block.text?.trim()) {
      blocks.push({ type: "text", text: block.text });
    }
  }
  return blocks;
}

export class AgentService {
  private emit: Emit;
  private settings: AppSettings;
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private session?: AgentSession;
  private unsubscribe?: () => void;
  private loader?: DefaultResourceLoader;
  private idCounter = 0;
  private currentAssistantId?: string;

  constructor(emit: Emit) {
    this.emit = emit;
    this.settings = loadSettings();
    this.authStorage = AuthStorage.create();
    this.modelRegistry = ModelRegistry.create(this.authStorage);
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.idCounter}`;
  }

  // ---------------------------------------------------------------- session

  async start(options?: { sessionPath?: string }): Promise<void> {
    this.disposeSession();

    const cwd = this.settings.workspaceDir;
    const skillDirs = [
      ...discoverSkillDirs(cwd),
      ...this.settings.skillDirs.flatMap((dir) => discoverSkillDirs(dir)),
    ];

    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: getAgentDir(),
      additionalSkillPaths: [...new Set(skillDirs)],
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
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      ...(model && !options?.sessionPath ? { model } : {}),
    });

    this.session = session;
    this.unsubscribe = session.subscribe((event) => this.onSessionEvent(event));

    if (!options?.sessionPath && this.settings.thinkingLevel && session.model) {
      try {
        session.setThinkingLevel(this.settings.thinkingLevel as ThinkingLevel);
      } catch {
        /* model may not support the stored level */
      }
    }
  }

  private disposeSession(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.session?.dispose();
    this.session = undefined;
    this.currentAssistantId = undefined;
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
        this.emit({ kind: "agent-end" });
        this.emitStats();
        this.emit({ kind: "sessions-changed" });
        break;
      case "message_start": {
        const message = event.message as AnyMessage;
        if (message.role === "assistant") {
          this.currentAssistantId = this.nextId("a");
          this.emit({
            kind: "assistant-start",
            id: this.currentAssistantId,
            ts: message.timestamp ?? Date.now(),
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
        const message = event.message as AnyMessage;
        if (message.role === "user") {
          const text = textOfContent(message.content);
          if (text.trim()) {
            this.emit({
              kind: "user-message",
              id: this.nextId("u"),
              text,
              ts: message.timestamp ?? Date.now(),
            });
          }
        } else if (message.role === "assistant" && this.currentAssistantId) {
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
          args: this.safeClone(event.args),
          ts: Date.now(),
        });
        break;
      case "tool_execution_update": {
        const partial = event.partialResult as { content?: AnyContentBlock[] } | undefined;
        this.emit({
          kind: "tool-update",
          callId: event.toolCallId,
          output: textOfContent(partial?.content),
        });
        break;
      }
      case "tool_execution_end": {
        const result = event.result as { content?: AnyContentBlock[] } | undefined;
        this.emit({
          kind: "tool-end",
          callId: event.toolCallId,
          output: textOfContent(result?.content),
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
          text: "正在压缩会话上下文…",
          ts: Date.now(),
        });
        break;
      case "compaction_end":
        this.emit({
          kind: "notice",
          tone: event.errorMessage ? "warn" : "info",
          text: event.errorMessage ? `上下文压缩失败：${event.errorMessage}` : "上下文压缩完成。",
          ts: Date.now(),
        });
        this.emitStats();
        break;
      case "auto_retry_start":
        this.emit({
          kind: "notice",
          tone: "warn",
          text: `请求失败，正在自动重试（第 ${event.attempt}/${event.maxAttempts} 次）…`,
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

  private safeClone(value: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(value ?? null));
    } catch {
      return undefined;
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
      sessionName: session.sessionName,
      model: model
        ? {
            provider: String(model.provider),
            id: model.id,
            name: model.name ?? model.id,
            reasoning: Boolean(model.reasoning),
          }
        : undefined,
      modelAuthConfigured,
      thinkingLevel: session.thinkingLevel,
      isStreaming: session.isStreaming,
      contextPercent: context?.percent ?? null,
      contextTokens: context?.tokens ?? null,
      contextWindow: context?.contextWindow ?? model?.contextWindow ?? 0,
      cost: stats.cost,
      tokensIn: stats.tokens.input,
      tokensOut: stats.tokens.output,
    };
  }

  private emitStats(): void {
    this.emit({ kind: "stats", stats: this.getStats() });
  }

  getThread(): UiThreadItem[] {
    const session = this.session;
    if (!session) return [];
    const items: UiThreadItem[] = [];
    const pendingToolCalls = new Map<string, { name: string; args?: unknown }>();

    for (const raw of session.messages) {
      const message = raw as AnyMessage;
      if (message.role === "user") {
        const text = textOfContent(message.content);
        if (text.trim()) {
          items.push({ kind: "user", id: this.nextId("u"), text, ts: message.timestamp ?? 0 });
        }
      } else if (message.role === "assistant") {
        const blocks = blocksOf(message);
        if (Array.isArray(message.content)) {
          for (const block of message.content) {
            if (block.type === "toolCall" && block.id) {
              pendingToolCalls.set(block.id, {
                name: block.name ?? "tool",
                args: block.arguments,
              });
            }
          }
        }
        if (blocks.length > 0 || message.errorMessage) {
          items.push({
            kind: "assistant",
            id: this.nextId("a"),
            blocks,
            streaming: false,
            stopReason: message.stopReason,
            errorMessage: message.errorMessage,
            usage: usageOf(message),
            ts: message.timestamp ?? 0,
          });
        }
      } else if (message.role === "toolResult" && message.toolCallId) {
        const call = pendingToolCalls.get(message.toolCallId);
        items.push({
          kind: "tool",
          id: this.nextId("t"),
          callId: message.toolCallId,
          name: message.toolName ?? call?.name ?? "tool",
          args: this.safeClone(call?.args),
          output: textOfContent(message.content),
          isError: Boolean(message.isError),
          running: false,
          ts: message.timestamp ?? 0,
        });
      }
    }
    return items;
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
        contextWindow: model.contextWindow ?? 0,
      }));
  }

  getProviders(): UiProviderStatus[] {
    const providers = new Map<string, UiProviderStatus>();
    const allModels = this.modelRegistry.getAll();
    const oauthIds = new Set(this.authStorage.getOAuthProviders().map((provider) => provider.id));
    for (const model of allModels) {
      const id = String(model.provider);
      if (!providers.has(id)) {
        const status = this.modelRegistry.getProviderAuthStatus(id);
        const providerModels = allModels.filter((candidate) => String(candidate.provider) === id);
        const credentialConfigured = providerModels.some((candidate) => {
          try {
            return this.modelRegistry.hasConfiguredAuth(candidate);
          } catch {
            return false;
          }
        });
        const configurationIssue = this.getProviderConfigurationIssue(id, providerModels);
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
    }
    return [...providers.values()].sort((a, b) => {
      if (a.configured !== b.configured) return a.configured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  private isModelConnectable(model: Model<Api>): boolean {
    return (
      this.modelRegistry.hasConfiguredAuth(model) &&
      !this.getProviderConfigurationIssue(String(model.provider), [model])
    );
  }

  private getProviderConfigurationIssue(
    provider: string,
    models: Array<{ baseUrl?: string }>,
  ): string | undefined {
    const baseUrls = models.map((model) => model.baseUrl ?? "");

    if (
      provider === "azure-openai-responses" &&
      baseUrls.some((baseUrl) => baseUrl.trim().length === 0) &&
      !process.env.AZURE_OPENAI_BASE_URL?.trim() &&
      !process.env.AZURE_OPENAI_RESOURCE_NAME?.trim()
    ) {
      return "Set AZURE_OPENAI_BASE_URL or AZURE_OPENAI_RESOURCE_NAME.";
    }

    if (baseUrls.some((baseUrl) => baseUrl.includes("{CLOUDFLARE_ACCOUNT_ID}"))) {
      const missing = ["CLOUDFLARE_ACCOUNT_ID"].filter((name) => !process.env[name]?.trim());
      if (
        baseUrls.some((baseUrl) => baseUrl.includes("{CLOUDFLARE_GATEWAY_ID}")) &&
        !process.env.CLOUDFLARE_GATEWAY_ID?.trim()
      ) {
        missing.push("CLOUDFLARE_GATEWAY_ID");
      }
      if (missing.length > 0) {
        return `Set ${missing.join(" and ")}.`;
      }
    }

    return undefined;
  }

  async listSessions(): Promise<UiSessionInfo[]> {
    const sessions = await SessionManager.list(this.settings.workspaceDir);
    return sessions
      .map((info) => ({
        path: info.path,
        id: info.id,
        name: info.name,
        firstMessage: info.firstMessage,
        createdAt: info.created.getTime(),
        modifiedAt: info.modified.getTime(),
        messageCount: info.messageCount,
      }))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  getSettingsView(): AppSettingsView {
    return {
      workspaceDir: this.settings.workspaceDir,
      skillDirs: [...this.settings.skillDirs],
      disabledSkills: [...this.settings.disabledSkills],
    };
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
    return {
      settings: this.getSettingsView(),
      skills: this.getSkills(),
      models: this.getModels(),
      providers: this.getProviders(),
      sessions: await this.listSessions(),
      stats: this.getStats(),
      thread: this.getThread(),
      version: this.appVersion(),
    };
  }

  // ---------------------------------------------------------------- actions

  async prompt(text: string): Promise<{ ok: boolean; error?: string }> {
    const session = this.session;
    if (!session) return { ok: false, error: "会话尚未就绪" };
    try {
      if (session.isStreaming) {
        await session.prompt(text, { streamingBehavior: "steer" });
      } else {
        await session.prompt(text);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async abort(): Promise<void> {
    await this.session?.abort();
  }

  async setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }> {
    const session = this.session;
    const model = this.modelRegistry.find(provider, id);
    if (!session || !model) return { ok: false, error: "未找到该模型" };
    try {
      await session.setModel(model);
      this.settings.defaultModel = { provider, id };
      saveSettings(this.settings);
      this.emitStats();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  setThinkingLevel(level: ThinkingLevel): AgentStats {
    if (this.session) {
      this.session.setThinkingLevel(level);
      this.settings.thinkingLevel = this.session.thinkingLevel;
      saveSettings(this.settings);
    }
    return this.getStats();
  }

  async setApiKey(provider: string, key: string): Promise<void> {
    this.authStorage.set(provider, { type: "api_key", key });
    this.modelRegistry.refresh();
    await this.syncSessionModelAfterAuth(provider);
    this.emitStats();
  }

  async loginProvider(provider: string, callbacks: OAuthLoginCallbacks): Promise<void> {
    await this.authStorage.login(provider, callbacks);
    this.modelRegistry.refresh();
    await this.syncSessionModelAfterAuth(provider);
    this.emitStats();
  }

  removeApiKey(provider: string): void {
    this.authStorage.remove(provider);
    this.modelRegistry.refresh();
    this.emitStats();
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
      saveSettings(this.settings);
    } catch {
      /* stay on the current model; user can pick manually */
    }
  }

  get currentSessionFile(): string | undefined {
    return this.session?.sessionFile;
  }
}
