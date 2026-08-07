import type { AgentUiEvent, CompassApi } from "@shared/types";
import { createAgentEventBatcher, type AgentEventBatcher } from "./agent-event-batcher";
import { createWebApi } from "./web-api";

declare global {
  interface Window {
    compass?: CompassApi;
  }
}

export const isDesktop = Boolean(window.compass);
const transportApi: CompassApi = window.compass ?? createWebApi();
const activeEventBatchers = new Set<AgentEventBatcher>();

/** Drop queued deltas before a session/snapshot boundary or explicit cancel. */
export function clearPendingAgentEvents(): void {
  for (const batcher of activeEventBatchers) batcher.clear();
}

export const api: CompassApi = {
  ...transportApi,
  onAgentEvent(listener: (event: AgentUiEvent) => void): () => void {
    const batcher = createAgentEventBatcher(listener);
    activeEventBatchers.add(batcher);
    const unsubscribe = transportApi.onAgentEvent((event) => batcher.push(event));
    return () => {
      unsubscribe();
      batcher.dispose();
      activeEventBatchers.delete(batcher);
    };
  },
};
