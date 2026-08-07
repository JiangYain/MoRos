import type { InitPayload, ModelPreferenceUpdate } from "../shared/types.ts";
import { SerialMutationQueue } from "./serial-mutation-queue.ts";

export interface ModelMutationBackend {
  setModel(provider: string, id: string): Promise<{ ok: boolean; error?: string }>;
  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<ModelPreferenceUpdate>;
  publish(): Promise<InitPayload>;
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
      if (result.ok) await this.backend.publish();
      return result;
    });
  }

  setModelEnabled(provider: string, id: string, enabled: boolean): Promise<ModelPreferenceUpdate> {
    return this.queue.enqueue(async () => {
      await this.backend.setModelEnabled(provider, id, enabled);
      const payload = await this.backend.publish();
      return { settings: payload.settings, stats: payload.stats };
    });
  }
}
