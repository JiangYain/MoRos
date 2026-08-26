import assert from "node:assert/strict";
import test from "node:test";
import type { UiApprovalRequest, UiThreadItem } from "../src/shared/types.ts";
import {
  buildSummaryText,
  groupToolActivities,
  placeAssistantIdentities,
  shouldShowToolActivityOutput,
  stripRedundantCompletionOpener,
  summarizeExecutionTurns,
  summarizeToolActivity,
  TOOL_ACTIVITY_COPY,
  toolActivity,
} from "../src/renderer/src/components/threadCommands.ts";
import {
  resolveActiveApprovalExplanationId,
  resolveThreadActivity,
} from "../src/renderer/src/components/threadActivity.ts";

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

test("places the Moros identity before historical tools and the final assistant message", () => {
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

test("keeps one Moros identity when a live assistant item already precedes tools", () => {
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

test("gives a running tool priority over a streaming assistant", () => {
  const thinking = {
    ...assistant("a1"),
    blocks: [{ type: "thinking" as const, text: "Inspecting the repository" }],
    streaming: true,
  };
  const read = { ...tool("r1", "read", { path: "C:/one.md" }), running: true };

  const activity = resolveThreadActivity([thinking, read]);
  assert.ok(activity && activity.target === "tool");
  assert.equal(activity.callId, "r1");
  assert.equal(activity.state, "searching");
});

test("maps read and search tools to searching", () => {
  for (const name of ["read", "read_file", "grep", "search"]) {
    const activity = resolveThreadActivity([{ ...tool(name, name), running: true }]);
    assert.ok(activity && activity.target === "tool");
    assert.equal(activity.state, "searching", name);
  }
});

test("maps write, edit and command tools to working", () => {
  for (const name of ["write", "apply_patch", "shell_command"]) {
    const activity = resolveThreadActivity([{ ...tool(name, name), running: true }]);
    assert.ok(activity && activity.target === "tool");
    assert.equal(activity.state, "working", name);
  }
});

test("maps the last valid thinking block to solving", () => {
  const activity = resolveThreadActivity([{
    ...assistant("a1"),
    blocks: [
      { type: "thinking", text: "Working through the problem" },
      { type: "text", text: "   " },
    ],
    streaming: true,
  }]);

  assert.deepEqual(activity, {
    target: "assistant-thinking",
    state: "solving",
    itemId: "a1",
    blockIndex: 0,
  });
});

test("maps an empty streaming assistant to working", () => {
  const activity = resolveThreadActivity([{
    ...assistant("a1"),
    blocks: [],
    streaming: true,
  }]);

  assert.deepEqual(activity, {
    target: "assistant-stream",
    state: "working",
    itemId: "a1",
  });
});

test("does not show an activity orb once ordinary response text is streaming", () => {
  const activity = resolveThreadActivity([{
    ...assistant("a1"),
    blocks: [{ type: "text", text: "The response has started." }],
    streaming: true,
  }]);

  assert.equal(activity, undefined);
});

test("selects only the newest pending approval explanation when the thread is idle", () => {
  const approvals: UiApprovalRequest[] = [
    { id: "approval-1", toolName: "write", message: "First", detail: "", ts: 1 },
    { id: "approval-2", toolName: "bash", message: "Second", detail: "", ts: 2 },
  ];

  assert.equal(resolveActiveApprovalExplanationId(approvals, undefined), "approval-2");
  assert.equal(resolveActiveApprovalExplanationId(approvals, {
    target: "assistant-stream",
    state: "working",
    itemId: "a1",
  }), undefined);
});

test("returns no activity after assistants and tools complete", () => {
  assert.equal(resolveThreadActivity([
    assistant("a1"),
    tool("r1", "read", { path: "C:/one.md" }),
  ]), undefined);
});

test("selects exactly one latest target when multiple entries appear active", () => {
  const activity = resolveThreadActivity([
    { ...tool("r1", "read"), running: true },
    { ...tool("w1", "write"), running: true },
  ]);

  assert.ok(activity && activity.target === "tool");
  assert.equal(activity.callId, "w1");
  assert.equal(activity.state, "working");
});

test("preserves summary timeline order, merges consecutive thinking, and drops empty assistants", () => {
  const completedTurn = summarizeExecutionTurns(
    groupToolActivities([
      user("u1"),
      {
        ...assistant("a1"),
        blocks: [{ type: "thinking", text: "Thought 1" }],
        streaming: false,
      },
      tool("r1", "read", { path: "C:/one.md" }),
      {
        ...assistant("a2"),
        blocks: [{ type: "thinking", text: "Thought 2" }],
        streaming: false,
      },
      {
        ...assistant("a2b"),
        blocks: [{ type: "thinking", text: "Thought 3" }],
        streaming: false,
      },
      tool("c1", "bash", { command: "npm test" }),
      {
        ...assistant("a3"),
        blocks: [{ type: "thinking", text: "Thought 4" }],
        streaming: false,
      },
      {
        ...assistant("a4"),
        blocks: [{ type: "text", text: "Done!" }],
        streaming: false,
      },
    ]),
  );

  const summary = completedTurn.find((item) => item.kind === "execution-summary");
  assert.ok(summary && summary.kind === "execution-summary");
  assert.equal(summary.thoughtCount, 3);
  assert.equal(summary.exploredFilesCount, 1);
  assert.equal(summary.commandsCount, 1);
  assert.deepEqual(
    summary.timelineEntries.map((entry) => entry.kind),
    ["thinking", "exploration", "thinking", "exploration", "thinking"],
  );
  assert.deepEqual(
    summary.timelineEntries
      .filter((entry) => entry.kind === "thinking")
      .map((entry) => entry.text),
    ["Thought 1", "Thought 2\n\nThought 3", "Thought 4"],
  );

  const assistantsInTurn = completedTurn.filter(
    (item): item is Extract<UiThreadItem, { kind: "assistant" }> => item.kind === "assistant",
  );
  assert.equal(assistantsInTurn.length, 1);
  assert.deepEqual(assistantsInTurn[0].blocks, [{ type: "text", text: "Done!" }]);
});

test("does not merge thinking separated by valid body text", () => {
  const completedTurn = summarizeExecutionTurns([
    user("u1"),
    {
      ...assistant("a1"),
      blocks: [
        { type: "thinking", text: "Before body" },
        { type: "text", text: "Body boundary" },
        { type: "thinking", text: "After body" },
      ],
      streaming: false,
    },
  ]);

  const summary = completedTurn.find((item) => item.kind === "execution-summary");
  assert.ok(summary && summary.kind === "execution-summary");
  assert.equal(summary.thoughtCount, 2);
  assert.deepEqual(
    summary.timelineEntries
      .filter((entry) => entry.kind === "thinking")
      .map((entry) => entry.text),
    ["Before body", "After body"],
  );
});

test("folds narration written before the last tool run into the summary timeline", () => {
  // Mirrors a real coding turn: a short narration line before each tool batch,
  // then the answer. Only the answer belongs in the thread; the narration is
  // process detail and belongs beside the steps it describes.
  const completedTurn = summarizeExecutionTurns(
    groupToolActivities([
      user("u1"),
      {
        ...assistant("a1"),
        blocks: [{ type: "thinking", text: "Plan" }, { type: "text", text: "Step one" }],
        streaming: false,
      },
      tool("r1", "read", { path: "C:/one.md" }),
      {
        ...assistant("a2"),
        blocks: [{ type: "thinking", text: "Next" }, { type: "text", text: "Step two" }],
        streaming: false,
      },
      tool("c1", "bash", { command: "npm test" }),
      {
        ...assistant("a3"),
        blocks: [{ type: "text", text: "Final answer" }],
        streaming: false,
      },
    ]),
  );

  assert.deepEqual(
    completedTurn.map((item) => item.kind),
    ["user", "execution-summary", "assistant"],
  );

  const summary = completedTurn.find((item) => item.kind === "execution-summary");
  assert.ok(summary && summary.kind === "execution-summary");
  assert.deepEqual(
    summary.timelineEntries.map((entry) => entry.kind),
    ["thinking", "narration", "exploration", "thinking", "narration", "exploration"],
  );
  assert.deepEqual(
    summary.timelineEntries
      .filter((entry) => entry.kind === "narration")
      .map((entry) => entry.text),
    ["Step one", "Step two"],
  );
  // Narration is not a thought and must not inflate the summary counters.
  assert.equal(summary.thoughtCount, 2);

  const visible = completedTurn.find(
    (item): item is Extract<UiThreadItem, { kind: "assistant" }> => item.kind === "assistant",
  );
  assert.ok(visible);
  assert.equal(visible.id, "a3");
  assert.deepEqual(visible.blocks, [{ type: "text", text: "Final answer" }]);
});

test("merges answer fragments that follow the last tool run", () => {
  const completedTurn = summarizeExecutionTurns(
    groupToolActivities([
      user("u1"),
      {
        ...assistant("a1"),
        blocks: [{ type: "thinking", text: "Plan" }, { type: "text", text: "Narration" }],
        streaming: false,
      },
      tool("c1", "bash", { command: "npm test" }),
      {
        ...assistant("a2"),
        blocks: [{ type: "text", text: "Answer part one" }],
        streaming: false,
      },
      {
        ...assistant("a3"),
        blocks: [{ type: "thinking", text: "Wrap up" }, { type: "text", text: "Answer part two" }],
        streaming: false,
      },
    ]),
  );

  const assistants = completedTurn.filter(
    (item): item is Extract<UiThreadItem, { kind: "assistant" }> => item.kind === "assistant",
  );
  assert.equal(assistants.length, 1);
  // The first answer fragment keeps the identity that scroll anchors already use.
  assert.equal(assistants[0].id, "a2");
  assert.deepEqual(assistants[0].blocks, [
    { type: "text", text: "Answer part one" },
    { type: "text", text: "Answer part two" },
  ]);
});

test("a failed turn keeps its message visible instead of folding it away", () => {
  const completedTurn = summarizeExecutionTurns(
    groupToolActivities([
      user("u1"),
      {
        ...assistant("a1"),
        blocks: [{ type: "thinking", text: "Plan" }, { type: "text", text: "Partial work" }],
        streaming: false,
        stopReason: "aborted",
        errorMessage: "Run cancelled",
      },
      tool("c1", "bash", { command: "npm test" }),
      {
        ...assistant("a2"),
        blocks: [{ type: "thinking", text: "Nothing left" }],
        streaming: false,
      },
    ]),
  );

  const visible = completedTurn.find(
    (item): item is Extract<UiThreadItem, { kind: "assistant" }> => item.kind === "assistant",
  );
  assert.ok(visible);
  assert.equal(visible.id, "a1");
  assert.equal(visible.errorMessage, "Run cancelled");
  assert.deepEqual(visible.blocks, [{ type: "text", text: "Partial work" }]);

  const summary = completedTurn.find((item) => item.kind === "execution-summary");
  assert.ok(summary && summary.kind === "execution-summary");
  assert.equal(summary.timelineEntries.filter((entry) => entry.kind === "narration").length, 0);
});

test("a separately rendered item breaks the assistant merge run", () => {
  const completedTurn = summarizeExecutionTurns(
    groupToolActivities([
      user("u1"),
      {
        ...assistant("a1"),
        blocks: [{ type: "thinking", text: "Plan" }],
        streaming: false,
      },
      tool("r1", "read", { path: "C:/one.md" }),
      {
        ...assistant("a2"),
        blocks: [{ type: "text", text: "Before" }],
        streaming: false,
      },
      { kind: "notice", id: "n1", tone: "warn", text: "Context compacted", ts: 1 },
      {
        ...assistant("a3"),
        blocks: [{ type: "text", text: "After" }],
        streaming: false,
      },
    ]),
  );

  assert.deepEqual(
    completedTurn.map((item) => item.kind),
    ["user", "execution-summary", "assistant", "notice", "assistant"],
  );
  const assistants = completedTurn.filter(
    (item): item is Extract<UiThreadItem, { kind: "assistant" }> => item.kind === "assistant",
  );
  assert.deepEqual(assistants.map((item) => item.id), ["a2", "a3"]);
});

test("leaves streaming turns uncollapsed", () => {
  const streamingTurn = summarizeExecutionTurns(
    groupToolActivities([
      user("u2"),
      tool("r2", "read", { path: "C:/two.md" }),
      {
        ...assistant("a2"),
        blocks: [{ type: "thinking", text: "Thinking..." }],
        streaming: true,
      },
    ]),
  );

  const streamingSummary = streamingTurn.find((item) => item.kind === "execution-summary");
  assert.equal(streamingSummary, undefined);
});

test("defers the latest summary until the whole agent lifecycle ends", () => {
  const betweenAgentSteps = groupToolActivities([
    user("u2"),
    {
      ...assistant("a2"),
      blocks: [{ type: "thinking", text: "Inspecting..." }],
      streaming: false,
    },
    tool("r2", "read", { path: "C:/two.md" }),
  ]);

  const duringAgentRun = summarizeExecutionTurns(betweenAgentSteps, true);
  assert.equal(
    duringAgentRun.find((item) => item.kind === "execution-summary"),
    undefined,
  );
  assert.ok(duringAgentRun.some((item) => item.kind === "assistant"));
  assert.ok(duringAgentRun.some((item) => item.kind === "tool-exploration-group"));

  const afterAgentEnd = summarizeExecutionTurns(betweenAgentSteps, false);
  assert.ok(afterAgentEnd.some((item) => item.kind === "execution-summary"));
  assert.equal(afterAgentEnd.some((item) => item.kind === "assistant"), false);
});

test("keeps earlier turns summarized while the latest agent lifecycle is active", () => {
  const duringSecondRun = summarizeExecutionTurns([
    user("u1"),
    {
      ...assistant("a1"),
      blocks: [{ type: "thinking", text: "First turn" }],
      streaming: false,
    },
    user("u2"),
    {
      ...assistant("a2"),
      blocks: [{ type: "thinking", text: "Second turn" }],
      streaming: false,
    },
  ], true);

  const summaries = duringSecondRun.filter((item) => item.kind === "execution-summary");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].id, "execution-summary-a1");
  assert.ok(duringSecondRun.some((item) => item.kind === "assistant" && item.id === "a2"));
});

test("builds localized summary text correctly across languages", () => {
  const mockT = (key: string, values?: Record<string, string | number>) => {
    const dict: Record<string, string> = {
      "thread.summary.thought": "思考了 {count} 次",
      "thread.summary.thoughtPlural": "思考了 {count} 次",
      "thread.summary.explored": "探索了 {count} 个文件",
      "thread.summary.exploredPlural": "探索了 {count} 个文件",
      "thread.summary.commands": "运行了 {count} 条命令",
      "thread.summary.commandsPlural": "运行了 {count} 条命令",
    };
    const template = dict[key] ?? key;
    if (!values) return template;
    return template.replace(/\{([^}]+)\}/g, (_, k) => String(values[k]));
  };

  const text = buildSummaryText(mockT as any, "zh-CN", {
    thoughtCount: 2,
    exploredFilesCount: 4,
    commandsCount: 1,
  });

  assert.equal(text, "思考了 2 次 · 探索了 4 个文件 · 运行了 1 条命令");
});
