import assert from "node:assert/strict";
import test from "node:test";
import { WorkbenchAgentBridge } from "../src/main/workbench/agent-bridge.ts";
import type { WorkbenchService } from "../src/main/workbench/service.ts";

test("Agent workbench opening returns a resource without leaking pending feedback", async () => {
  const tools = new Map<string, any>();
  const calls: any[] = [];
  const bridge = new WorkbenchAgentBridge({
    register: async (scope: unknown) => calls.push(scope),
    execute: async (request: unknown, actor: string) => {
      calls.push({ request, actor });
      return { state: { activeTabId: "file-tab", tabs: [{ id: "file-tab", resource: { kind: "file", path: "result.md" } }], feedback: [{ comment: "Private until I send this" }] } };
    },
  } as unknown as WorkbenchService);
  await bridge.extension()({ on() {}, registerTool(tool: any) { tools.set(tool.name, tool); } } as any);
  const context = { cwd: "/authorized", sessionManager: { getSessionId: () => "session-one" } };
  const result = await tools.get("workbench_open").execute("call", { kind: "file", path: "result.md", scope: { workspaceDir: "/forged" } }, undefined, undefined, context);
  assert.doesNotMatch(result.content[0].text, /Private|feedback/);
  assert.deepEqual(calls[1].request.scope, { workspaceDir: "/authorized", sessionId: "session-one" });
  assert.equal(calls[1].actor, "agent");
  assert.equal(tools.has("workbench_revert"), false);
  assert.equal(tools.has("workbench_stage"), false);
});

test("Agent terminal commands are marked at the trusted bridge and use the current scope", async () => {
  const tools = new Map<string, any>(); const calls: any[] = [];
  const bridge = new WorkbenchAgentBridge({ execute: async (...args: unknown[]) => { calls.push(args); return {}; } } as unknown as WorkbenchService);
  await bridge.extension()({ on() {}, registerTool(tool: any) { tools.set(tool.name, tool); } } as any);
  await tools.get("workbench_terminal_command").execute("call", { terminal_id: "owned-terminal", command: "echo fixture" }, undefined, undefined, { cwd: "/workspace", sessionManager: { getSessionId: () => "one" } });
  assert.equal(calls[0][1], "agent");
  assert.deepEqual(calls[0][0], { scope: { workspaceDir: "/workspace", sessionId: "one" }, operation: "terminal", tabId: "owned-terminal", action: "input", data: "echo fixture\r" });
});
