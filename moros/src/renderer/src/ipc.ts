import type { AgentUiEvent, MorosApi } from "@shared/types";
import { createAgentEventBatcher, type AgentEventBatcher } from "./agent-event-batcher";
import { createWebApi } from "./web-api";

declare global {
  interface Window {
    moros?: MorosApi;
  }
}

export const isDesktop = Boolean(window.moros);
const transportApi: MorosApi = window.moros ?? createWebApi();
const activeEventBatchers = new Set<AgentEventBatcher>();

/** Drop queued deltas before a session/snapshot boundary or explicit cancel. */
export function clearPendingAgentEvents(): void {
  for (const batcher of activeEventBatchers) batcher.clear();
}

export const api: MorosApi = {
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
