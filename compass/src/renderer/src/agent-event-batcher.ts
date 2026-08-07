import type { AgentUiEvent } from "../../shared/types.ts";

type AssistantDeltaEvent = Extract<AgentUiEvent, { kind: "assistant-delta" }>;

export interface FrameScheduler {
  cancel(handle: number): void;
  request(callback: () => void): number;
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

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(() => callback()),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};

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
