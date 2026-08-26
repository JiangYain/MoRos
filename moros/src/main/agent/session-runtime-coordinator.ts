import {
  LifecycleCoordinator,
  type LifecycleMutation,
} from "./lifecycle-coordinator.ts";

export interface SessionRuntimeCoordinatorOptions<Resource> {
  dispose(resource: Resource): void | Promise<void>;
  discardCandidate?(resource: Resource): void | Promise<void>;
  isRunning(resource: Resource): boolean;
  keyOf(resource: Resource): string;
  onBackgroundChange?(): void;
  reportCleanupError?(error: unknown): void;
}

/**
 * Coordinates which Agent session is visible to the renderer.
 *
 * A running foreground resource is retired into a keyed background set during
 * navigation. Selecting that key again promotes the same live resource instead
 * of opening a second writer for its session file. Non-navigation replacements
 * retain the strong single-owner semantics of `LifecycleCoordinator`.
 */
export class SessionRuntimeCoordinator<Resource> {
  private readonly backgroundByKey = new Map<string, Resource>();
  private readonly lifecycle: LifecycleCoordinator<Resource>;
  private readonly options: SessionRuntimeCoordinatorOptions<Resource>;
  private readonly preserveOnRetire = new Set<Resource>();

  constructor(options: SessionRuntimeCoordinatorOptions<Resource>) {
    this.options = options;
    this.lifecycle = new LifecycleCoordinator(
      (resource) => this.retire(resource),
      options.reportCleanupError,
      options.discardCandidate ?? options.dispose,
    );
  }

  get current(): Resource | undefined {
    return this.lifecycle.current;
  }

  get background(): readonly Resource[] {
    return [...this.backgroundByKey.values()];
  }

  get managed(): readonly Resource[] {
    return this.current ? [this.current, ...this.background] : this.background;
  }

  find(key: string): Resource | undefined {
    const current = this.current;
    if (current && this.options.keyOf(current) === key) return current;
    return this.backgroundByKey.get(key);
  }

  navigate(
    create: (generation: number) => Resource | Promise<Resource>,
    key?: string,
  ): Promise<Resource> {
    return this.lifecycle.mutate(async (lifecycle) => {
      const current = lifecycle.current;
      if (current && key !== undefined && this.options.keyOf(current) === key) {
        return current;
      }
      const background = key === undefined ? undefined : this.backgroundByKey.get(key);
      if (current && this.options.isRunning(current)) this.preserveOnRetire.add(current);
      try {
        return await lifecycle.replace(
          background ? () => background : create,
          background
            ? (resource) => {
                if (resource !== background || this.backgroundByKey.get(key!) !== background) {
                  throw new Error("The background session changed before it could be selected.");
                }
                this.backgroundByKey.delete(key!);
                this.options.onBackgroundChange?.();
              }
            : undefined,
        );
      } finally {
        if (current) this.preserveOnRetire.delete(current);
      }
    });
  }

  replace(
    create: (generation: number) => Resource | Promise<Resource>,
    beforePublish?: (resource: Resource) => void,
  ): Promise<Resource> {
    return this.lifecycle.replace(create, beforePublish);
  }

  mutate<Result>(
    mutation: (lifecycle: LifecycleMutation<Resource>) => Result | Promise<Result>,
  ): Promise<Result> {
    return this.lifecycle.mutate(mutation);
  }

  isManaged(resource: Resource): boolean {
    return this.current === resource
      || this.backgroundByKey.get(this.options.keyOf(resource)) === resource;
  }

  isForeground(resource: Resource): boolean {
    return this.current === resource;
  }

  settle(resource: Resource): Promise<void> {
    return this.lifecycle.mutate(async () => {
      const key = this.options.keyOf(resource);
      if (this.backgroundByKey.get(key) !== resource) return;
      this.backgroundByKey.delete(key);
      this.options.onBackgroundChange?.();
      await this.options.dispose(resource);
    });
  }

  clear(): Promise<void> {
    return this.lifecycle.mutate(async (lifecycle) => {
      await lifecycle.clear();
      const background = [...this.backgroundByKey.values()];
      if (background.length > 0) {
        this.backgroundByKey.clear();
        this.options.onBackgroundChange?.();
      }
      for (const resource of background) await this.options.dispose(resource);
    });
  }

  private async retire(resource: Resource): Promise<void> {
    if (this.preserveOnRetire.delete(resource) && this.options.isRunning(resource)) {
      const key = this.options.keyOf(resource);
      const existing = this.backgroundByKey.get(key);
      if (existing && existing !== resource) await this.options.dispose(existing);
      this.backgroundByKey.set(key, resource);
      this.options.onBackgroundChange?.();
      return;
    }
    await this.options.dispose(resource);
  }
}
