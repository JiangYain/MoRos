import assert from "node:assert/strict";
import test from "node:test";
import type { UiThreadItem } from "../src/shared/types.ts";
import {
  groupToolActivities,
  summarizeToolActivity,
  toolActivity,
} from "../src/renderer/src/components/threadCommands.ts";

const user = (id: string): UiThreadItem => ({ kind: "user", id, text: id, ts: 1 });
const assistant = (id: string): UiThreadItem => ({
  kind: "assistant",
  id,
  blocks: [{ type: "thinking", text: id }],
  streaming: false,
  ts: 1,
});
const tool = (id: string, name: string, args: unknown = { command: id }): UiThreadItem => ({
  kind: "tool",
  id,
  callId: id,
  name,
  args,
  output: "hidden output",
  isError: false,
  running: false,
  ts: 1,
});

test("groups every standard tool family at the same render hierarchy", () => {
  const result = groupToolActivities([
    user("u1"),
    assistant("a1"),
    tool("c1", "bash"),
    tool("r1", "read", { path: "C:/one.md" }),
    assistant("a2"),
    tool("w1", "write", { path: "C:/two.md" }),
    tool("e1", "edit", { path: "C:/three.md" }),
    tool("c2", "shell_command"),
  ]);

  const groups = result.filter((item) => item.kind === "tool-activity-group");
  assert.deepEqual(groups.map((group) => group.activity), ["command", "read", "write", "edit"]);
  assert.deepEqual(groups[0].items.map((item) => item.id), ["c1", "c2"]);
  assert.equal(result.filter((item) => item.kind === "assistant").length, 2);
});

test("starts fresh activity groups for each user turn", () => {
  const result = groupToolActivities([
    user("u1"),
    tool("r1", "read", { path: "C:/one.md" }),
    user("u2"),
    assistant("a2"),
    tool("r2", "read_file", { file_path: "C:/two.md" }),
  ]);

  const groups = result.filter((item) => item.kind === "tool-activity-group");
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.id)), [["r1"], ["r2"]]);
});

test("recognizes standard aliases and summarizes their useful argument", () => {
  const patch = tool("p1", "apply_patch", { path: "src/app.ts", patch: "large diff" });
  assert.equal(toolActivity(patch), "edit");
  assert.equal(summarizeToolActivity(patch), "src/app.ts");

  const shell = tool("s1", "exec_command", { command: "npm   run   build" });
  assert.equal(toolActivity(shell), "command");
  assert.equal(summarizeToolActivity(shell), "npm run build");
});
