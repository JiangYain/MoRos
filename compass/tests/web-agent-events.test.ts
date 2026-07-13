import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUiEvent, InitPayload } from "../src/shared/types.ts";
import {
  createWebAgentEvents,
  type AgentEventTransport,
} from "../src/renderer/src/web-agent-events.ts";

class FakeTransport implements AgentEventTransport {
  private messageListener: (data: string) => void = () => undefined;
  private openListener: () => void = () => undefined;

  onMessage(listener: (data: string) => void): void {
    this.messageListener = listener;
  }

  onOpen(listener: () => void): void {
    this.openListener = listener;
  }

  open(): void {
    this.openListener();
  }

  send(event: AgentUiEvent): void {
    this.messageListener(JSON.stringify(event));
  }
}

const emptyPayload = { version: "test" } as InitPayload;

test("web agent events buffer updates until the renderer subscribes", async () => {
  const transport = new FakeTransport();
  const events = createWebAgentEvents(transport, async () => emptyPayload);
  const received: AgentUiEvent[] = [];

  transport.open();
  await events.ready;
  transport.send({ kind: "assistant-start", id: "assistant-1", ts: 1 });
  events.subscribe((event) => received.push(event));

  assert.deepEqual(received, [{ kind: "assistant-start", id: "assistant-1", ts: 1 }]);
});

test("web agent events reconcile state after reconnect and once the run settles", async () => {
  const transport = new FakeTransport();
  let loadCount = 0;
  const events = createWebAgentEvents(transport, async () => {
    loadCount += 1;
    return emptyPayload;
  });
  const received: AgentUiEvent[] = [];
  events.subscribe((event) => received.push(event));

  transport.open();
  await events.ready;
  transport.open();
  transport.send({ kind: "agent-end" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(loadCount, 2);
  assert.equal(received.filter((event) => event.kind === "state-refresh").length, 2);
});
