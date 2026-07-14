import assert from "node:assert/strict";
import test from "node:test";
import type { UiThreadItem } from "../src/shared/types.ts";
import {
  groupToolActivities,
  placeAssistantIdentities,
  shouldShowToolActivityOutput,
  stripRedundantCompletionOpener,
  summarizeToolActivity,
  TOOL_ACTIVITY_COPY,
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

test("groups consecutive tools while preserving activity order", () => {
  const result = groupToolActivities([
    user("u1"),
    assistant("a1"),
    tool("c1", "bash"),
    tool("c1b", "shell_command"),
    tool("r1", "read", { path: "C:/one.md" }),
    assistant("a2"),
    tool("w1", "write", { path: "C:/two.md" }),
    tool("e1", "edit", { path: "C:/three.md" }),
    tool("c2", "shell_command"),
  ]);

  const explorations = result.filter((item) => item.kind === "tool-exploration-group");
  assert.equal(explorations.length, 2);
  assert.deepEqual(explorations[0].groups.map((group) => group.activity), ["command", "read"]);
  assert.deepEqual(explorations[0].groups[0].items.map((item) => item.id), ["c1", "c1b"]);
  assert.deepEqual(explorations[1].groups.map((group) => group.activity), ["write", "edit", "command"]);
  assert.deepEqual(explorations[1].groups[2].items.map((item) => item.id), ["c2"]);
  assert.equal(result.filter((item) => item.kind === "assistant").length, 2);
});

test("starts a new command group after an intervening read", () => {
  const result = groupToolActivities([
    user("u1"),
    tool("c1", "shell_command"),
    tool("r1", "read", { path: "C:/one.md" }),
    tool("c2", "shell_command"),
  ]);

  const exploration = result.find((item) => item.kind === "tool-exploration-group");
  assert.ok(exploration);
  const groups = exploration.groups;
  assert.deepEqual(groups.map((group) => group.activity), ["command", "read", "command"]);
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.id)), [["c1"], ["r1"], ["c2"]]);
});

test("starts fresh activity groups for each user turn", () => {
  const result = groupToolActivities([
    user("u1"),
    tool("r1", "read", { path: "C:/one.md" }),
    user("u2"),
    assistant("a2"),
    tool("r2", "read_file", { file_path: "C:/two.md" }),
  ]);

  const explorations = result.filter((item) => item.kind === "tool-exploration-group");
  assert.equal(explorations.length, 2);
  assert.deepEqual(explorations.map((entry) => entry.groups[0].items.map((item) => item.id)), [["r1"], ["r2"]]);
});

test("places the Compass identity before historical tools and the final assistant message", () => {
  const result = placeAssistantIdentities(groupToolActivities([
    user("u1"),
    tool("c1", "shell_command"),
    tool("r1", "read", { path: "C:/one.md" }),
    assistant("a1"),
  ]));

  assert.deepEqual(result.map((item) => item.kind), [
    "user",
    "assistant-identity",
    "tool-exploration-group",
    "assistant",
  ]);
});

test("keeps one Compass identity when a live assistant item already precedes tools", () => {
  const result = placeAssistantIdentities(groupToolActivities([
    user("u1"),
    assistant("a1"),
    tool("c1", "shell_command"),
  ]));

  assert.deepEqual(result.map((item) => item.kind), [
    "user",
    "assistant-identity",
    "assistant",
    "tool-exploration-group",
  ]);
});

test("recognizes standard aliases and summarizes their useful argument", () => {
  const patch = tool("p1", "apply_patch", { path: "src/app.ts", patch: "large diff" });
  assert.equal(toolActivity(patch), "edit");
  assert.equal(summarizeToolActivity(patch), "src/app.ts");

  const shell = tool("s1", "exec_command", { command: "npm   run   build" });
  assert.equal(toolActivity(shell), "command");
  assert.equal(summarizeToolActivity(shell), "npm run build");
});

test("hides successful raw tool output and keeps useful error details", () => {
  const read = tool("r1", "read", { path: "C:/one.md" });
  assert.equal(shouldShowToolActivityOutput("read", read), false);

  const failedRead = { ...read, isError: true, output: "File not found" };
  assert.equal(shouldShowToolActivityOutput("read", failedRead), true);

  const failedCommand = { ...tool("c1", "shell_command"), isError: true, output: "Command failed" };
  assert.equal(shouldShowToolActivityOutput("command", failedCommand), false);
});

test("removes the redundant successful-tool completion opener", () => {
  const text = "Done — both actions were completed.\n\n### Result\nTarget is ready.";
  assert.equal(stripRedundantCompletionOpener(text), "### Result\nTarget is ready.");
  assert.equal(stripRedundantCompletionOpener("Target is ready."), "Target is ready.");
});

test("keeps all tool activity labels in English", () => {
  assert.deepEqual(TOOL_ACTIVITY_COPY.command, {
    active: "Running commands",
    complete: "Ran commands",
    itemActive: "Running",
    itemComplete: "Ran",
  });
  assert.equal(TOOL_ACTIVITY_COPY.read.itemComplete, "Read");
  assert.equal(TOOL_ACTIVITY_COPY.write.complete, "Wrote files");
  assert.equal(TOOL_ACTIVITY_COPY.edit.itemActive, "Editing");
  assert.equal(TOOL_ACTIVITY_COPY.search.complete, "Searched files");
});
