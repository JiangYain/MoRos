import assert from "node:assert/strict";
import test from "node:test";
import type { AgentUiEvent } from "../src/shared/types.ts";
import { ApprovalController } from "../src/main/agent/approval-controller.ts";

type ToolCallHandler = (event: {
  toolName: string;
  input: Record<string, unknown>;
}) => Promise<unknown>;

function installToolCallHandler(controller: ApprovalController): ToolCallHandler {
  let handler: ToolCallHandler | undefined;
  const fakeExtension = {
    on(event: string, candidate: ToolCallHandler) {
      if (event === "tool_call") handler = candidate;
    },
  };
  void controller.extension()(fakeExtension as never);
  assert.ok(handler);
  return handler;
}

test("approval controller owns request, explanation, and decision ordering", async () => {
  const events: AgentUiEvent[] = [];
  const controller = new ApprovalController({
    emit: (event) => events.push(event),
    nextId: () => "approval-1",
    policy: () => ({ mode: "ask", workspaceDir: "C:\\workspace" }),
    explain: async () => "Checks the repository state.",
  });
  const handleToolCall = installToolCallHandler(controller);

  const decision = handleToolCall({
    toolName: "shell_command",
    input: { command: "git status --short" },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(events.map((event) => event.kind), [
    "approval-request",
    "approval-explanation",
  ]);
  assert.equal(controller.snapshot()[0]?.explanation, "Checks the repository state.");
  assert.deepEqual(controller.resolve("approval-1", false), { ok: true });
  assert.deepEqual(await decision, {
    block: true,
    reason: "The operator denied this action.",
  });
  assert.equal(events.at(-1)?.kind, "approval-resolved");
  assert.deepEqual(controller.snapshot(), []);
  assert.deepEqual(controller.resolve("approval-1", true), {
    ok: false,
    error: "Approval request is no longer active.",
  });
});

test("approval controller bypasses policy-safe tools without creating state", async () => {
  const events: AgentUiEvent[] = [];
  const controller = new ApprovalController({
    emit: (event) => events.push(event),
    nextId: () => "unused",
    policy: () => ({ mode: "approve", workspaceDir: "C:\\workspace" }),
    explain: async () => "unused",
  });

  const decision = await installToolCallHandler(controller)({
    toolName: "read",
    input: { path: "README.md" },
  });
  assert.equal(decision, undefined);
  assert.deepEqual(events, []);
  assert.deepEqual(controller.snapshot(), []);
});
