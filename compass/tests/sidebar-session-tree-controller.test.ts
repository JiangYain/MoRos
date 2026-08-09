import assert from "node:assert/strict";
import test from "node:test";
import type { UiSessionInfo } from "../src/shared/types.ts";
import {
  INITIAL_SESSION_TREE_INTERACTION_STATE,
  type SessionTreeInteractionState,
  sessionTreeInteractionReducer,
} from "../src/renderer/src/components/sidebar/session-tree-interaction-state.ts";
import {
  runSessionConfirmationCommand,
  type SessionConfirmationLifecycle,
} from "../src/renderer/src/components/sidebar/session-confirmation-command.ts";
import type { ThreadConfirmationState } from "../src/renderer/src/components/thread-confirmation.ts";
import {
  buildSessionDropPlan,
  commitSessionDrop,
  type SessionOwnershipCommands,
} from "../src/renderer/src/components/sidebar/session-tree-ordering-state.ts";
import type { ClientGroup, SessionOrderByClient } from "../src/renderer/src/components/sidebar/session-tree-model.ts";

function session(id: string): UiSessionInfo {
  return {
    id,
    path: `C:\\sessions\\${id}.jsonl`,
    firstMessage: id,
    createdAt: 10,
    modifiedAt: 20,
    messageCount: 1,
  };
}

function group(id: string, name: string, sessions: UiSessionInfo[]): ClientGroup {
  return {
    id,
    name,
    sessions,
    latestModifiedAt: 20,
    unassigned: false,
  };
}

function confirmationLifecycle(
  getState: () => SessionTreeInteractionState,
  setState: (state: SessionTreeInteractionState) => void,
): SessionConfirmationLifecycle {
  const transition = (event: Parameters<typeof sessionTreeInteractionReducer>[1]): void => {
    setState(sessionTreeInteractionReducer(getState(), event));
  };
  return {
    start: (confirmation) => transition({
      type: "confirmation",
      event: { type: "start", path: confirmation.path, action: confirmation.action },
    }),
    fail: (confirmation) => transition({
      type: "confirmation",
      event: { type: "fail", path: confirmation.path, action: confirmation.action },
    }),
    clear: (confirmation) => transition({
      type: "confirmation",
      event: { type: "clear", path: confirmation.path, action: confirmation.action },
    }),
  };
}

function requestConfirmation(
  state: SessionTreeInteractionState,
  confirmation: Omit<ThreadConfirmationState, "busy">,
): SessionTreeInteractionState {
  return sessionTreeInteractionReducer(state, {
    type: "confirmation",
    event: { type: "request", path: confirmation.path, action: confirmation.action },
  });
}

test("cross-client drops change ownership before persisting the new order", async () => {
  const moving = session("moving");
  const source = group("client:source", "Source", [moving, session("source-tail")]);
  const target = group("client:target", "Target", [session("target-first")]);
  const plan = buildSessionDropPlan({
    dragged: { sessionId: moving.id, clientId: source.id },
    groups: [source, target],
    order: {},
    target,
    beforeSessionId: "target-first",
  });
  const events: string[] = [];
  const commands: SessionOwnershipCommands = {
    assign: async (sessionId, clientName) => { events.push(`assign:${sessionId}:${clientName}`); },
    unassign: async () => { events.push("unassign"); },
  };
  let persisted: SessionOrderByClient | undefined;

  await commitSessionDrop(plan, commands, (order) => {
    events.push("persist");
    persisted = order;
  });

  assert.deepEqual(events, ["assign:moving:Target", "persist"]);
  assert.deepEqual(persisted, {
    "client:source": ["source-tail"],
    "client:target": ["moving", "target-first"],
  });
});

test("a rejected ownership change never persists a cross-client order", async () => {
  const moving = session("moving");
  const source = group("client:source", "Source", [moving]);
  const target = group("client:target", "Target", []);
  const plan = buildSessionDropPlan({
    dragged: { sessionId: moving.id, clientId: source.id },
    groups: [source, target],
    order: {},
    target,
  });
  let persisted = false;

  await assert.rejects(
    commitSessionDrop(
      plan,
      {
        assign: async () => { throw new Error("ownership failed"); },
        unassign: async () => undefined,
      },
      () => { persisted = true; },
    ),
    /ownership failed/,
  );
  assert.equal(persisted, false);
});

test("rename draft remains until the matching rename succeeds", () => {
  let state = sessionTreeInteractionReducer(
    INITIAL_SESSION_TREE_INTERACTION_STATE,
    { type: "rename/begin", path: "one", draft: "Original" },
  );
  state = sessionTreeInteractionReducer(state, { type: "rename/change", draft: "Retained draft" });
  state = sessionTreeInteractionReducer(state, { type: "rename/complete", path: "another" });
  assert.deepEqual(state.rename, { path: "one", draft: "Retained draft" });

  state = sessionTreeInteractionReducer(state, { type: "rename/complete", path: "one" });
  assert.equal(state.rename, null);
});

test("a successful session command clears only its matching confirmation", async () => {
  let state = requestConfirmation(
    requestConfirmation(INITIAL_SESSION_TREE_INTERACTION_STATE, {
      path: "archive-path",
      action: "archive",
    }),
    { path: "delete-path", action: "delete" },
  );
  const calls: string[] = [];
  const lifecycle = confirmationLifecycle(() => state, (next) => { state = next; });

  await runSessionConfirmationCommand(
    state.confirmations["archive-path"],
    {
      archive: async (path) => { calls.push(`archive:${path}`); },
      delete: async (path) => { calls.push(`delete:${path}`); },
    },
    lifecycle,
  );

  assert.deepEqual(calls, ["archive:archive-path"]);
  assert.equal(state.confirmations["archive-path"], undefined);
  assert.deepEqual(state.confirmations["delete-path"], {
    path: "delete-path",
    action: "delete",
    busy: false,
  });
});

test("a failed session command stays rejected and leaves its confirmation actionable", async () => {
  let state = requestConfirmation(INITIAL_SESSION_TREE_INTERACTION_STATE, {
    path: "delete-path",
    action: "delete",
  });
  const failure = new Error("backend rejected deletion");
  const lifecycle = confirmationLifecycle(() => state, (next) => { state = next; });

  await assert.rejects(
    runSessionConfirmationCommand(
      state.confirmations["delete-path"],
      {
        archive: async () => undefined,
        delete: async () => { throw failure; },
      },
      lifecycle,
    ),
    (error) => error === failure,
  );

  assert.deepEqual(state.confirmations["delete-path"], {
    path: "delete-path",
    action: "delete",
    busy: false,
  });
});

test("confirmation transitions stay independent from rename state", () => {
  let state = sessionTreeInteractionReducer(
    INITIAL_SESSION_TREE_INTERACTION_STATE,
    { type: "rename/begin", path: "rename-path", draft: "Draft" },
  );
  state = sessionTreeInteractionReducer(state, {
    type: "confirmation",
    event: { type: "request", path: "archive-path", action: "archive" },
  });
  state = sessionTreeInteractionReducer(state, {
    type: "confirmation",
    event: { type: "request", path: "delete-path", action: "delete" },
  });
  state = sessionTreeInteractionReducer(state, {
    type: "confirmation",
    event: { type: "start", path: "archive-path", action: "archive" },
  });
  state = sessionTreeInteractionReducer(state, {
    type: "confirmation",
    event: { type: "fail", path: "archive-path", action: "archive" },
  });
  state = sessionTreeInteractionReducer(state, {
    type: "confirmation",
    event: { type: "clear", path: "delete-path", action: "delete" },
  });

  assert.deepEqual(state.rename, { path: "rename-path", draft: "Draft" });
  assert.deepEqual(state.confirmations, {
    "archive-path": { path: "archive-path", action: "archive", busy: false },
  });
});
