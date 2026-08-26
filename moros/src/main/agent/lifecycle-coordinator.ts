export interface LifecycleMutation<Resource> {
  readonly current: Resource | undefined;
  replace(
    create: (generation: number) => Resource | Promise<Resource>,
    beforePublish?: (resource: Resource) => void,
  ): Promise<Resource>;
  clear(): Promise<void>;
}

interface OwnedResource<Resource> {
  generation: number;
  resource: Resource;
}

type ResourceDisposer<Resource> = (resource: Resource) => void | Promise<void>;
type CleanupErrorReporter = (error: unknown) => void;

/**
 * Serializes lifecycle mutations and owns exactly one live resource.
 *
 * A generation is assigned only when a queued replacement begins. A candidate
 * is fully created before ownership changes, so a failed creation leaves the
 * previous resource live. Once ownership switches, stale callbacks stop being
 * accepted before cleanup of the previous owner starts.
 */
export class LifecycleCoordinator<Resource> {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private owner?: OwnedResource<Resource>;
  private readonly dispose: ResourceDisposer<Resource>;
  private readonly discardCandidate: ResourceDisposer<Resource>;
  private readonly reportCleanupError: CleanupErrorReporter;

  constructor(
    dispose: ResourceDisposer<Resource>,
    reportCleanupError: CleanupErrorReporter = (error) => {
      console.error("Lifecycle cleanup failed after ownership was replaced:", error);
    },
    discardCandidate: ResourceDisposer<Resource> = dispose,
  ) {
    this.dispose = dispose;
    this.reportCleanupError = reportCleanupError;
    this.discardCandidate = discardCandidate;
  }

  get current(): Resource | undefined {
    return this.owner?.resource;
  }

  owns(generation: number, resource?: Resource): boolean {
    return this.owner?.generation === generation
      && (resource === undefined || this.owner.resource === resource);
  }

  mutate<Result>(
    mutation: (lifecycle: LifecycleMutation<Resource>) => Result | Promise<Result>,
  ): Promise<Result> {
    const result = this.tail.then(() => mutation(this.createMutation()));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  replace(
    create: (generation: number) => Resource | Promise<Resource>,
    beforePublish?: (resource: Resource) => void,
  ): Promise<Resource> {
    return this.mutate((lifecycle) => lifecycle.replace(create, beforePublish));
  }

  clear(): Promise<void> {
    return this.mutate((lifecycle) => lifecycle.clear());
  }

  private createMutation(): LifecycleMutation<Resource> {
    const coordinator = this;
    return {
      get current() {
        return coordinator.owner?.resource;
      },
      replace: (create, beforePublish) => coordinator.replaceOwned(create, beforePublish),
      clear: () => coordinator.clearOwned(),
    };
  }

  private async replaceOwned(
    create: (generation: number) => Resource | Promise<Resource>,
    beforePublish?: (resource: Resource) => void,
  ): Promise<Resource> {
    const generation = ++this.generation;
    const previous = this.owner;

    const resource = await create(generation);
    if (generation !== this.generation || this.owner !== previous) {
      const cause = new Error("Lifecycle ownership changed before replacement completed.");
      try {
        await this.discardCandidate(resource);
      } catch (cleanupError) {
        throw new AggregateError(
          [cause, cleanupError],
          "Lifecycle replacement was rejected and its candidate could not be cleaned up.",
          { cause },
        );
      }
      throw cause;
    }

    try {
      const commitResult = beforePublish?.(resource);
      if (commitResult !== undefined) {
        throw new TypeError("Lifecycle beforePublish must complete synchronously.");
      }
    } catch (cause) {
      try {
        await this.discardCandidate(resource);
      } catch (cleanupError) {
        throw new AggregateError(
          [cause, cleanupError],
          "Lifecycle publication failed and its candidate could not be cleaned up.",
          { cause },
        );
      }
      throw cause;
    }

    this.owner = { generation, resource };
    if (previous) {
      try {
        await this.dispose(previous.resource);
      } catch (error) {
        // Ownership has already committed and the new resource is healthy. A
        // cleanup failure cannot be reported as a failed replacement without
        // lying to callers about which resource is current.
        try {
          this.reportCleanupError(error);
        } catch {
          // Error reporters must never invalidate an already committed switch.
        }
      }
    }
    return resource;
  }

  private async clearOwned(): Promise<void> {
    this.generation += 1;
    await this.releaseOwner();
  }

  private async releaseOwner(): Promise<void> {
    const previous = this.owner;
    this.owner = undefined;
    if (previous) await this.dispose(previous.resource);
  }
}
