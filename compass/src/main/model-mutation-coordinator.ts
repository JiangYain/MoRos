import type { InitPayload, ModelPreferenceUpdate } from "../shared/types.ts";
import { SerialMutationQueue } from "./serial-mutation-queue.ts";

export interface ModelMutationBackend {
  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }>;
  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<ModelPreferenceUpdate>;
  publish(allowStaleDependencies: boolean): Promise<InitPayload>;
}

/**
 * Keeps a model mutation and its authoritative renderer publication in one
 * transaction. Service-level serialization protects the persisted state; this
 * outer queue also protects the state-refresh/RPC boundary.
 */
export class ModelMutationCoordinator {
  private readonly queue = new SerialMutationQueue();
  private readonly backend: ModelMutationBackend;

  constructor(backend: ModelMutationBackend) {
    this.backend = backend;
  }

  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }> {
    return this.queue.enqueue(async () => {
      const result = await this.backend.setModel(provider, id);
      if (result.ok) await this.backend.publish(true);
      return result;
    });
  }

  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<ModelPreferenceUpdate> {
    return this.queue.enqueue(async () => {
      await this.backend.setModelEnabled(provider, id, enabled);
      const payload = await this.backend.publish(true);
      return { settings: payload.settings, stats: payload.stats };
    });
  }

  mutateAndPublish(
    mutation: () => Promise<void>,
    options: { allowStaleDependencies?: boolean } = {},
  ): Promise<InitPayload> {
    return this.queue.enqueue(async () => {
      await mutation();
      return this.backend.publish(options.allowStaleDependencies ?? false);
    });
  }

  /**
   * Runs a settings mutation, publishes the authoritative snapshot once it
   * succeeds, and returns the mutation result unchanged so RPC contracts are
   * preserved. Failed mutations publish nothing. Settings do not affect
   * dependency state, so a stale dependency inventory is acceptable.
   */
  publishAfter<Result>(mutation: () => Promise<Result>): Promise<Result> {
    return this.queue.enqueue(async () => {
      const result = await mutation();
      await this.backend.publish(true);
      return result;
    });
  }
}
