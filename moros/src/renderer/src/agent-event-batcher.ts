import type { AgentUiEvent } from "../../shared/types.ts";

type AssistantDeltaEvent = Extract<AgentUiEvent, { kind: "assistant-delta" }>;

export interface FrameScheduler {
  cancel(handle: number): void;
  request(callback: () => void): number;
}

/** The browser/Electron timing primitives the frame scheduler depends on. */
export interface FrameSchedulerHost {
  cancelAnimationFrame(handle: number): void;
  clearTimeout(handle: number): void;
  requestAnimationFrame(callback: () => void): number;
  setTimeout(callback: () => void, ms: number): number;
}

export const FRAME_FALLBACK_MS = 120;

/**
 * requestAnimationFrame stops firing while a surface is occluded, minimized or
 * in a background tab. Because queued deltas are only flushed from a frame,
 * that would freeze the visible thread until the next lifecycle event. Race
 * every frame against a timer so the stream still advances without a frame
 * clock, and let whichever fires first cancel the other.
 */
export function createFrameScheduler(
  host: FrameSchedulerHost,
  fallbackMs = FRAME_FALLBACK_MS,
): FrameScheduler {
  const pending = new Map<number, () => void>();
  let nextHandle = 1;

  const settle = (handle: number): (() => void) | undefined => {
    const dispose = pending.get(handle);
    if (!dispose) return undefined;
    pending.delete(handle);
    dispose();
    return dispose;
  };

  return {
    request(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      const run = (): void => {
        if (!settle(handle)) return;
        callback();
      };
      const frame = host.requestAnimationFrame(run);
      const timer = host.setTimeout(run, fallbackMs);
      pending.set(handle, () => {
        host.cancelAnimationFrame(frame);
        host.clearTimeout(timer);
      });
      return handle;
    },
    cancel(handle) {
      settle(handle);
    },
  };
}

export interface AgentEventBatcherMetrics {
  dispatchedEvents: number;
  droppedDeltaEvents: number;
  inputDeltaEvents: number;
  inputEvents: number;
  mergedDeltaEvents: number;
  visibleBatches: number;
}

export interface AgentEventBatcher {
  clear(): void;
  dispose(): void;
  flush(): void;
  getMetrics(): AgentEventBatcherMetrics;
  push(event: AgentUiEvent): void;
}

const browserFrameScheduler: FrameScheduler = createFrameScheduler({
  cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
  clearTimeout: (handle) => window.clearTimeout(handle),
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
});

function compatible(left: AssistantDeltaEvent, right: AssistantDeltaEvent): boolean {
  return left.id === right.id
    && left.contentIndex === right.contentIndex
    && left.blockType === right.blockType;
}

/**
 * Coalesces only adjacent, compatible assistant deltas that arrive before the
 * next animation frame. Lifecycle events remain synchronous barriers so their
 * ordering is identical to the source event stream.
 */
export function createAgentEventBatcher(
  dispatch: (event: AgentUiEvent) => void,
  scheduler: FrameScheduler = browserFrameScheduler,
): AgentEventBatcher {
  let disposed = false;
  let frameHandle: number | undefined;
  let pending: AssistantDeltaEvent[] = [];
  const metrics: AgentEventBatcherMetrics = {
    dispatchedEvents: 0,
    droppedDeltaEvents: 0,
    inputDeltaEvents: 0,
    inputEvents: 0,
    mergedDeltaEvents: 0,
    visibleBatches: 0,
  };

  const dispatchEvent = (event: AgentUiEvent): void => {
    metrics.dispatchedEvents += 1;
    dispatch(event);
  };

  const cancelFrame = (): void => {
    if (frameHandle === undefined) return;
    scheduler.cancel(frameHandle);
    frameHandle = undefined;
  };

  const flushPending = (fromFrame = false): void => {
    if (!fromFrame) cancelFrame();
    else frameHandle = undefined;
    if (pending.length === 0) return;

    const events = pending;
    pending = [];
    metrics.visibleBatches += 1;
    for (const event of events) dispatchEvent(event);
  };

  const clear = (): void => {
    cancelFrame();
    metrics.droppedDeltaEvents += pending.length;
    pending = [];
  };

  return {
    push(event) {
      if (disposed) return;
      metrics.inputEvents += 1;

      if (event.kind === "assistant-delta") {
        metrics.inputDeltaEvents += 1;
        const previous = pending.at(-1);
        if (previous && compatible(previous, event)) {
          previous.delta += event.delta;
          metrics.mergedDeltaEvents += 1;
        } else {
          pending.push({ ...event });
        }
        if (frameHandle === undefined) {
          frameHandle = scheduler.request(() => flushPending(true));
        }
        return;
      }

      // A refresh is an authoritative snapshot and can belong to a different
      // session. Never write an older queued delta into that new snapshot.
      if (event.kind === "state-refresh") {
        clear();
        dispatchEvent(event);
        return;
      }

      // All other lifecycle events preserve source order. In particular,
      // assistant-end is applied after the final queued delta and then replaces
      // it with the authoritative complete blocks.
      flushPending();
      dispatchEvent(event);
    },
    flush: () => flushPending(),
    clear,
    dispose() {
      clear();
      disposed = true;
    },
    getMetrics: () => ({ ...metrics }),
  };
}
