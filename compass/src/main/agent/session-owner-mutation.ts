import type {
  LifecycleCoordinator,
  LifecycleMutation,
} from "./lifecycle-coordinator.ts";
import { compensatedMutationError } from "./mutation-compensation.ts";

interface SessionOwnerMutationOptions<Resource, SessionPath extends string> {
  lifecycle: LifecycleCoordinator<Resource>;
  pathOf(resource: Resource): string | undefined;
  samePath(first: string, second: string): boolean;
  detach(lifecycle: LifecycleMutation<Resource>): Promise<void>;
  restore(lifecycle: LifecycleMutation<Resource>, path: SessionPath): Promise<void>;
}

/**
 * Holds the lifecycle queue for the complete filesystem mutation. If the
 * target is active, its live owner is detached first and restored before the
 * queue is released whenever the mutation fails.
 */
export class SessionOwnerMutationCoordinator<Resource, SessionPath extends string> {
  private readonly options: SessionOwnerMutationOptions<Resource, SessionPath>;

  constructor(options: SessionOwnerMutationOptions<Resource, SessionPath>) {
    this.options = options;
  }

  run<Result>(path: SessionPath, mutation: () => Promise<Result>): Promise<Result> {
    return this.options.lifecycle.mutate(async (lifecycle) => {
      const currentPath = lifecycle.current
        ? this.options.pathOf(lifecycle.current)
        : undefined;
      if (!currentPath || !this.options.samePath(currentPath, path)) {
        return mutation();
      }

      try {
        await this.options.detach(lifecycle);
        return await mutation();
      } catch (cause) {
        const failures: unknown[] = [];
        try {
          await this.options.restore(lifecycle, path);
        } catch (error) {
          failures.push(new Error(
            `Could not restore the original session: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          ));
        }
        throw compensatedMutationError("Session file mutation", cause, failures);
      }
    });
  }
}
