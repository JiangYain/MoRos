import type { AgentUiEvent, InitPayload } from "../../shared/types.ts";

export interface AgentEventTransport {
  onMessage(listener: (data: string) => void): void;
  onOpen(listener: () => void): void;
}

interface WebAgentEvents {
  ready: Promise<void>;
  subscribe(listener: (event: AgentUiEvent) => void): () => void;
}

export function createWebAgentEvents(
  transport: AgentEventTransport,
  loadState: () => Promise<InitPayload>,
): WebAgentEvents {
  const listeners = new Set<(event: AgentUiEvent) => void>();
  const pending: AgentUiEvent[] = [];
  let hasOpened = false;
  let reconcileAfterSettle = false;
  let resolveReady: () => void = () => undefined;
  let resyncTail = Promise.resolve();

  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const publish = (event: AgentUiEvent): void => {
    if (listeners.size === 0) {
      pending.push(event);
      return;
    }
    for (const listener of listeners) listener(event);
  };

  const queueResync = (): void => {
    resyncTail = resyncTail.then(async () => {
      try {
        publish({ kind: "state-refresh", payload: await loadState() });
      } catch {
        // EventSource keeps reconnecting. A later open or settled event will retry.
      }
    });
  };

  transport.onOpen(() => {
    if (!hasOpened) {
      hasOpened = true;
      resolveReady();
      return;
    }
    reconcileAfterSettle = true;
    queueResync();
  });

  transport.onMessage((data) => {
    let event: AgentUiEvent;
    try {
      const candidate = JSON.parse(data) as unknown;
      if (!candidate || typeof candidate !== "object" || typeof (candidate as { kind?: unknown }).kind !== "string") {
        return;
      }
      event = candidate as AgentUiEvent;
    } catch {
      return;
    }

    publish(event);
    if (reconcileAfterSettle && event.kind === "agent-end") {
      reconcileAfterSettle = false;
      queueResync();
    }
  });

  return {
    ready,
    subscribe: (listener) => {
      listeners.add(listener);
      if (pending.length > 0) {
        const buffered = pending.splice(0);
        for (const event of buffered) listener(event);
      }
      return () => listeners.delete(listener);
    },
  };
}
