import type {
  AgentSession,
  ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels, type Api, type AuthInteraction, type Model } from "@earendil-works/pi-ai";
import type {
  AgentStats,
  AppSettingsView,
  ModelPreferenceUpdate,
  UiModel,
  UiProviderStatus,
} from "../../shared/types.ts";
import { modelSelectionKey } from "../../shared/types.ts";
import type { ProviderAuthInfo } from "../provider-auth.ts";
import { SerialMutationQueue } from "../serial-mutation-queue.ts";
import type { AppSettings } from "../settings";
import { agentMessage } from "./messages.ts";
import {
  ModelPreferenceTransaction,
  type ModelPreferenceState,
} from "./model-preference-transaction.ts";

interface ModelCoordinatorState {
  settings: AppSettings;
  runtime: ModelRuntime;
  registry: ModelRegistry;
  session?: AgentSession;
}

export interface ModelCoordinatorOptions {
  state(): ModelCoordinatorState;
  persist(settings: AppSettings): void;
  emitStats(): void;
  snapshot(): { settings: AppSettingsView; stats: AgentStats };
  providerAuthInfo(provider: string, supportsOAuth: boolean): ProviderAuthInfo;
  providerConfigurationIssue(provider: string, models: Array<{ baseUrl?: string }>): string | undefined;
}

type OperationResult = { ok: boolean; error?: string };

/**
 * Maintains the invariant between configured credentials, visible models,
 * default model, and the live Pi session. Selection mutations share one serial
 * queue so renderer requests cannot interleave into an impossible preference
 * state.
 */
export class ModelCoordinator {
  private readonly mutations = new SerialMutationQueue();
  private readonly options: ModelCoordinatorOptions;

  constructor(options: ModelCoordinatorOptions) {
    this.options = options;
  }

  models(): UiModel[] {
    const { registry } = this.options.state();
    return registry
      .getAvailable()
      .filter((model) => this.isConnectable(model))
      .map((model) => ({
        provider: String(model.provider),
        providerName: registry.getProviderDisplayName(String(model.provider)),
        id: model.id,
        name: model.name ?? model.id,
        reasoning: Boolean(model.reasoning),
        thinkingLevels: getSupportedThinkingLevels(model),
        supportsImages: model.input?.includes("image") ?? false,
        contextWindow: model.contextWindow ?? 0,
      }));
  }

  providers(): UiProviderStatus[] {
    const { registry, runtime } = this.options.state();
    const providers = new Map<string, UiProviderStatus>();
    const modelsByProvider = new Map<string, Model<Api>[]>();
    const oauthIds = new Set(
      runtime
        .getProviders()
        .filter((provider) => provider.auth.oauth !== undefined)
        .map((provider) => provider.id),
    );
    for (const model of registry.getAll()) {
      const id = String(model.provider);
      const providerModels = modelsByProvider.get(id) ?? [];
      providerModels.push(model);
      modelsByProvider.set(id, providerModels);
    }
    for (const [id, providerModels] of modelsByProvider) {
      const status = registry.getProviderAuthStatus(id);
      const credentialConfigured = providerModels.some((candidate) => {
        try {
          return registry.hasConfiguredAuth(candidate);
        } catch {
          return false;
        }
      });
      const configurationIssue = this.options.providerConfigurationIssue(id, providerModels);
      const authInfo = this.options.providerAuthInfo(id, oauthIds.has(id));
      providers.set(id, {
        id,
        name: registry.getProviderDisplayName(id),
        configured: credentialConfigured && !configurationIssue,
        source:
          status.source
          ?? (credentialConfigured
            ? id === "amazon-bedrock"
              ? "environment"
              : "configured"
            : undefined),
        sourceLabel:
          status.label
          ?? (credentialConfigured && id === "amazon-bedrock" ? "AWS credential chain" : undefined),
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

  enabledKeys(): string[] {
    return [...this.options.state().settings.enabledModels];
  }

  isConnectable(model: Model<Api>): boolean {
    const { registry } = this.options.state();
    return (
      registry.hasConfiguredAuth(model)
      && !this.options.providerConfigurationIssue(String(model.provider), [model])
    );
  }

  normalizePreferences(): Promise<void> {
    return this.mutations.enqueue(() => this.applyNormalizedPreferences());
  }

  withStablePreferences<Result>(operation: () => Promise<Result>): Promise<Result> {
    return this.mutations.enqueue(async () => {
      await this.applyNormalizedPreferences();
      return operation();
    });
  }

  private async applyNormalizedPreferences(): Promise<void> {
    const { settings, session } = this.options.state();
    const normalized = this.normalizedPreferenceState();
    if (!normalized.changed) return;
    await new ModelPreferenceTransaction(
      settings,
      session,
      this.options.persist,
    ).commit(normalized.preferences);
  }

  private normalizedPreferenceState(): {
    preferences: ModelPreferenceState;
    changed: boolean;
  } {
    const { settings } = this.options.state();
    const connectable = this.connectableModels();
    const current: ModelPreferenceState = {
      ...(settings.defaultModel ? { defaultModel: { ...settings.defaultModel } } : {}),
      summaryModel: { ...settings.summaryModel },
      enabledModels: [...settings.enabledModels],
    };
    if (connectable.length === 0) return { preferences: current, changed: false };

    const enabled = new Set(settings.enabledModels);
    const preferred = settings.defaultModel
      ? connectable.find(
          (model) => String(model.provider) === settings.defaultModel?.provider
            && model.id === settings.defaultModel.id,
        )
      : undefined;
    let enabledConnectable = connectable.filter((model) =>
      enabled.has(modelSelectionKey(String(model.provider), model.id)),
    );
    let changed = false;
    let defaultModel = settings.defaultModel ? { ...settings.defaultModel } : undefined;

    if (enabledConnectable.length === 0) {
      const initial = preferred ?? connectable[0];
      enabled.add(modelSelectionKey(String(initial.provider), initial.id));
      enabledConnectable = [initial];
      changed = true;
    }

    const defaultKey = settings.defaultModel
      ? modelSelectionKey(settings.defaultModel.provider, settings.defaultModel.id)
      : undefined;
    if (!defaultKey || !enabled.has(defaultKey) || !preferred) {
      const nextDefault = enabledConnectable[0];
      defaultModel = {
        provider: String(nextDefault.provider),
        id: nextDefault.id,
      };
      changed = true;
    }

    const normalized = [...enabled];
    if (
      normalized.length !== settings.enabledModels.length
      || normalized.some((key, index) => key !== settings.enabledModels[index])
    ) {
      changed = true;
    }
    return {
      preferences: {
        ...(defaultModel ? { defaultModel } : {}),
        summaryModel: { ...settings.summaryModel },
        enabledModels: normalized,
      },
      changed,
    };
  }

  select(provider: string, id: string): Promise<OperationResult> {
    return this.mutations.enqueue(() => this.applySelection(provider, id));
  }

  setSummary(provider: string, id: string): Promise<void> {
    return this.mutations.enqueue(() => this.applySummary(provider, id));
  }

  private async applySummary(provider: string, id: string): Promise<void> {
    const { registry, settings } = this.options.state();
    if (!registry.find(provider, id)) {
      throw new Error(agentMessage(settings.language, "modelNotFound"));
    }
    await new ModelPreferenceTransaction(
      settings,
      this.options.state().session,
      this.options.persist,
    ).commit({
      ...(settings.defaultModel ? { defaultModel: { ...settings.defaultModel } } : {}),
      summaryModel: { provider, id },
      enabledModels: [...settings.enabledModels],
    });
  }

  setEnabled(provider: string, id: string, enabled: boolean): Promise<ModelPreferenceUpdate> {
    return this.mutations.enqueue(() => this.applyEnabled(provider, id, enabled));
  }

  saveApiKey(provider: string, key: string): Promise<void> {
    return this.mutations.enqueue(() => this.applyApiKey(provider, key));
  }

  login(provider: string, interaction: AuthInteraction): Promise<void> {
    return this.mutations.enqueue(() => this.applyLogin(provider, interaction));
  }

  logout(provider: string): Promise<void> {
    return this.mutations.enqueue(() => this.applyLogout(provider));
  }

  private async applyApiKey(provider: string, key: string): Promise<void> {
    const { runtime } = this.options.state();
    await runtime.login(provider, "api_key", {
      prompt: async (prompt) => {
        if (prompt.type !== "secret") {
          throw new Error(`Unexpected ${prompt.type} prompt while saving an API key for ${provider}`);
        }
        return key;
      },
      notify: () => {},
    });
    await this.syncSessionAfterAuth(provider);
    this.options.emitStats();
  }

  private async applyLogin(provider: string, interaction: AuthInteraction): Promise<void> {
    await this.options.state().runtime.login(provider, "oauth", interaction);
    await this.syncSessionAfterAuth(provider);
    this.options.emitStats();
  }

  private async applyLogout(provider: string): Promise<void> {
    await this.options.state().runtime.logout(provider);
    // Authentication can outlive a session restart; always reconcile the
    // session that is current after logout completes.
    const state = this.options.state();
    const normalized = this.normalizedPreferenceState();
    const session = state.session;
    const current = session?.model;
    let replacement: Model<Api> | undefined;
    if (session && current && !this.isConnectable(current)) {
      const enabled = new Set(normalized.preferences.enabledModels);
      replacement = this.connectableModels().find((model) =>
        enabled.has(modelSelectionKey(String(model.provider), model.id)),
      );
    }
    if (normalized.changed || replacement) {
      const preferences: ModelPreferenceState = replacement
        ? {
            ...normalized.preferences,
            defaultModel: {
              provider: String(replacement.provider),
              id: replacement.id,
            },
          }
        : normalized.preferences;
      await new ModelPreferenceTransaction(
        state.settings,
        session,
        this.options.persist,
      ).commit(replacement
        ? { ...preferences, liveModel: replacement, liveModelTiming: "after-persist" }
        : preferences);
    }
    this.options.emitStats();
  }

  private connectableModels(): Model<Api>[] {
    return this.options.state().registry.getAvailable().filter((model) => this.isConnectable(model));
  }

  private async applySelection(provider: string, id: string): Promise<OperationResult> {
    const { session, registry, settings } = this.options.state();
    const model = registry.find(provider, id);
    if (!session || !model) {
      return { ok: false, error: agentMessage(settings.language, "modelNotFound") };
    }
    try {
      const enabledModels = new Set(settings.enabledModels);
      enabledModels.add(modelSelectionKey(provider, id));
      await new ModelPreferenceTransaction(settings, session, this.options.persist).commit({
        liveModel: model,
        defaultModel: { provider, id },
        summaryModel: { ...settings.summaryModel },
        enabledModels: [...enabledModels],
      });
      this.options.emitStats();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async applyEnabled(
    provider: string,
    id: string,
    enabled: boolean,
  ): Promise<ModelPreferenceUpdate> {
    const { registry, settings, session } = this.options.state();
    const model = registry.find(provider, id);
    if (enabled && (!model || !this.isConnectable(model))) {
      throw new Error(agentMessage(settings.language, "modelUnavailable"));
    }
    const enabledModels = new Set(settings.enabledModels);
    const key = modelSelectionKey(provider, id);
    let defaultModel = settings.defaultModel ? { ...settings.defaultModel } : undefined;
    let liveModel: Model<Api> | undefined;
    if (enabled) {
      enabledModels.add(key);
    } else {
      if (!enabledModels.has(key)) return this.options.snapshot();
      const replacements = this.connectableModels().filter((candidate) => {
        const candidateKey = modelSelectionKey(String(candidate.provider), candidate.id);
        return candidateKey !== key && enabledModels.has(candidateKey);
      });
      if (replacements.length === 0) {
        throw new Error(agentMessage(settings.language, "modelRequired"));
      }
      const replacement = replacements[0];
      const current = session?.model;
      const currentKey = current
        ? modelSelectionKey(String(current.provider), current.id)
        : undefined;
      if (currentKey === key && session) liveModel = replacement;
      enabledModels.delete(key);
      const defaultKey = settings.defaultModel
        ? modelSelectionKey(settings.defaultModel.provider, settings.defaultModel.id)
        : undefined;
      if (defaultKey === key || currentKey === key) {
        defaultModel = {
          provider: String(replacement.provider),
          id: replacement.id,
        };
      }
    }
    await new ModelPreferenceTransaction(settings, session, this.options.persist).commit({
      ...(liveModel ? { liveModel } : {}),
      ...(defaultModel ? { defaultModel } : {}),
      summaryModel: { ...settings.summaryModel },
      enabledModels: [...enabledModels],
    });
    this.options.emitStats();
    return this.options.snapshot();
  }

  private async syncSessionAfterAuth(provider: string): Promise<void> {
    const { registry, session, settings } = this.options.state();
    const normalized = this.normalizedPreferenceState();
    const current = session?.model;
    const candidate = current && String(current.provider) === provider
      ? registry.find(provider, current.id)
      : !current
        ? registry
            .getAvailable()
            .find((model) => String(model.provider) === provider && this.isConnectable(model))
        : undefined;
    if (session && candidate && this.isConnectable(candidate)) {
      const enabledModels = new Set(normalized.preferences.enabledModels);
      enabledModels.add(modelSelectionKey(provider, candidate.id));
      await new ModelPreferenceTransaction(settings, session, this.options.persist).commit({
        liveModel: candidate,
        defaultModel: { provider, id: candidate.id },
        summaryModel: normalized.preferences.summaryModel,
        enabledModels: [...enabledModels],
      });
      return;
    }
    if (normalized.changed) {
      await new ModelPreferenceTransaction(settings, session, this.options.persist).commit(
        normalized.preferences,
      );
    }
  }
}
