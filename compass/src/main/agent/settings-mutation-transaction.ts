import { SerialMutationQueue } from "../serial-mutation-queue.ts";
import { compensatedMutationError } from "./mutation-compensation.ts";

interface StrongMutationEffect<Snapshot> {
  /**
   * A rejected apply must leave its external state unchanged. Lifecycle
   * replacement provides this guarantee by creating before switching owners.
   */
  failureMode: "strong";
  apply(snapshot: Snapshot): void | Promise<void>;
}

interface CompensatedMutationEffect<Snapshot> {
  /** Apply may have changed external state before throwing. */
  failureMode: "compensate";
  apply(snapshot: Snapshot): void | Promise<void>;
  compensate(snapshot: Snapshot): void | Promise<void>;
}

export type SettingsMutationEffect<Snapshot> =
  | StrongMutationEffect<Snapshot>
  | CompensatedMutationEffect<Snapshot>;

export interface SettingsMutation<Snapshot> {
  context: string;
  capture(): Snapshot;
  mutate(): void;
  restore(snapshot: Snapshot): void;
  effect?: SettingsMutationEffect<Snapshot>;
}

/**
 * Serializes non-model settings changes and commits memory, disk, and an
 * optional live-session effect as one compensating transaction.
 *
 * Each caller owns a field-scoped snapshot instead of a copy of all settings.
 * A rollback therefore cannot overwrite an unrelated model/auth mutation that
 * completed while a live effect was pending.
 */
export class SettingsMutationTransaction {
  private readonly queue = new SerialMutationQueue();
  private readonly persist: () => void;

  constructor(persist: () => void) {
    this.persist = persist;
  }

  commit<Snapshot>(mutation: SettingsMutation<Snapshot>): Promise<void> {
    return this.queue.enqueue(() => this.commitOwned(mutation));
  }

  runExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    return this.queue.enqueue(operation);
  }

  private async commitOwned<Snapshot>(mutation: SettingsMutation<Snapshot>): Promise<void> {
    const original = mutation.capture();
    let memoryAttempted = false;
    let persistenceAttempted = false;
    let effectAttempted = false;

    try {
      // Journal before every call: mutators and persistence can change state
      // before reporting a failure.
      memoryAttempted = true;
      mutation.mutate();
      persistenceAttempted = true;
      this.persist();
      if (mutation.effect) {
        effectAttempted = true;
        await mutation.effect.apply(original);
      }
    } catch (cause) {
      const compensationFailures: unknown[] = [];

      if (memoryAttempted) {
        try {
          mutation.restore(original);
        } catch (error) {
          compensationFailures.push(new Error(
            `Could not restore in-memory settings for ${mutation.context}: ${String(error)}`,
            { cause: error },
          ));
        }
      }

      if (
        effectAttempted
        && mutation.effect?.failureMode === "compensate"
      ) {
        try {
          await mutation.effect.compensate(original);
        } catch (error) {
          compensationFailures.push(new Error(
            `Could not restore the live effect for ${mutation.context}: ${String(error)}`,
            { cause: error },
          ));
        }
      }

      if (persistenceAttempted) {
        try {
          this.persist();
        } catch (error) {
          compensationFailures.push(new Error(
            `Could not restore persisted settings for ${mutation.context}: ${String(error)}`,
            { cause: error },
          ));
        }
      }

      throw compensatedMutationError(mutation.context, cause, compensationFailures);
    }
  }
}
