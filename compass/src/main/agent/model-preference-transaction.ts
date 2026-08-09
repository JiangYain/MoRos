import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AppSettings } from "../settings.ts";
import { compensatedMutationError } from "./mutation-compensation.ts";

export interface ModelPreferenceState {
  defaultModel?: { provider: string; id: string };
  summaryModel: { provider: string; id: string };
  enabledModels: string[];
}

export interface ModelPreferenceMutation extends ModelPreferenceState {
  liveModel?: Model<Api>;
  liveModelTiming?: "before-persist" | "after-persist";
}

type MutationEffect = "live-model" | "memory" | "persistence";

/**
 * Commits the live model and its Compass preferences as one compensating
 * transaction. Effects are journaled before they are attempted because both
 * Pi's model switch and filesystem persistence may mutate state before they
 * report a failure.
 */
export class ModelPreferenceTransaction {
  private readonly settings: AppSettings;
  private readonly session: AgentSession | undefined;
  private readonly persist: (settings: AppSettings) => void;
  private readonly original: ModelPreferenceState;
  private readonly originalLiveModel: Model<Api> | undefined;
  private readonly effects = new Set<MutationEffect>();

  constructor(
    settings: AppSettings,
    session: AgentSession | undefined,
    persist: (settings: AppSettings) => void,
  ) {
    this.settings = settings;
    this.session = session;
    this.persist = persist;
    this.original = {
      ...(settings.defaultModel ? { defaultModel: { ...settings.defaultModel } } : {}),
      summaryModel: { ...settings.summaryModel },
      enabledModels: [...settings.enabledModels],
    };
    this.originalLiveModel = session?.model as Model<Api> | undefined;
  }

  async commit(mutation: ModelPreferenceMutation): Promise<void> {
    const liveModelTiming = mutation.liveModelTiming
      ?? (mutation.liveModel && !this.originalLiveModel ? "after-persist" : "before-persist");
    try {
      if (liveModelTiming === "before-persist") {
        await this.applyLiveModel(mutation.liveModel);
      }

      this.effects.add("memory");
      this.applySnapshot(mutation);

      this.effects.add("persistence");
      this.persist(this.settings);
      if (liveModelTiming === "after-persist") {
        await this.applyLiveModel(mutation.liveModel);
      }
      this.effects.clear();
    } catch (cause) {
      throw await this.compensate(cause);
    }
  }

  private async compensate(cause: unknown): Promise<unknown> {
    const failures: unknown[] = [];

    if (this.effects.has("memory")) {
      try {
        this.applySnapshot(this.original);
      } catch (error) {
        failures.push(new Error(`Could not restore in-memory model preferences: ${String(error)}`));
      }
    }

    if (this.effects.has("live-model")) {
      try {
        if (!this.session) throw new Error("the original live session is unavailable");
        const current = this.session.model as Model<Api> | undefined;
        if (!this.originalLiveModel) {
          if (current) throw new Error("the original live model is unavailable");
        } else if (
          !current
          || String(current.provider) !== String(this.originalLiveModel.provider)
          || current.id !== this.originalLiveModel.id
        ) {
          await this.session.setModel(this.originalLiveModel);
        }
      } catch (error) {
        failures.push(new Error(
          `Could not restore the original live model: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        ));
      }
    }

    if (this.effects.has("persistence")) {
      try {
        this.persist(this.settings);
      } catch (error) {
        failures.push(new Error(
          `Could not restore persisted model preferences: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        ));
      }
    }

    this.effects.clear();
    return compensatedMutationError("Model preference mutation", cause, failures);
  }

  private applySnapshot(snapshot: ModelPreferenceState): void {
    if (snapshot.defaultModel) this.settings.defaultModel = { ...snapshot.defaultModel };
    else delete this.settings.defaultModel;
    this.settings.summaryModel = { ...snapshot.summaryModel };
    this.settings.enabledModels = [...snapshot.enabledModels];
  }

  private async applyLiveModel(model: Model<Api> | undefined): Promise<void> {
    if (!model || !this.session) return;
    this.effects.add("live-model");
    await this.session.setModel(model);
  }
}
