import assert from "node:assert/strict";
import test from "node:test";
import { buildEstimatedContextBreakdown } from "../src/main/context-usage.ts";
import { CONTEXT_USAGE_CATEGORY_KEYS } from "../src/shared/types.ts";

type ContextSession = Parameters<typeof buildEstimatedContextBreakdown>[0];

function sessionFixture(
  messages: unknown[],
  activeToolNames: string[] = ["read", "write", "edit", "bash", "grep"],
): ContextSession {
  return {
    systemPrompt: "Base system prompt",
    messages,
    getActiveToolNames: () => activeToolNames,
    getAllTools: () => activeToolNames.map((name) => ({
      name,
      description: `${name} tool`,
      parameters: { type: "object" },
    })),
  } as unknown as ContextSession;
}

test("routes built-in tool calls and results out of Conversation", () => {
  const messages = [
    {
      role: "assistant",
      content: [
        { type: "toolCall", id: "read-1", name: "read", arguments: { path: "a.txt" } },
        { type: "toolCall", id: "write-1", name: "write", arguments: { path: "b.txt", content: "new" } },
        { type: "toolCall", id: "edit-1", name: "edit", arguments: { path: "c.txt", oldText: "old", newText: "new" } },
        { type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "npm test" } },
        { type: "toolCall", id: "grep-1", name: "grep", arguments: { pattern: "needle" } },
      ],
    },
    { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "file contents" }] },
    { role: "toolResult", toolCallId: "write-1", toolName: "write", content: [{ type: "text", text: "written" }] },
    { role: "toolResult", toolCallId: "edit-1", toolName: "edit", content: [{ type: "text", text: "edited" }] },
    { role: "toolResult", toolCallId: "bash-1", toolName: "bash", content: [{ type: "text", text: "tests passed" }] },
    { role: "toolResult", toolCallId: "grep-1", toolName: "grep", content: [{ type: "text", text: "match" }] },
  ];

  const breakdown = buildEstimatedContextBreakdown(sessionFixture(messages), null, "", []);

  assert.equal(breakdown.conversation, 0);
  assert.ok(breakdown.read > 0);
  assert.ok(breakdown.write > 0);
  assert.ok(breakdown.edit > 0);
  assert.ok(breakdown.bash > 0);
  assert.ok(breakdown.otherTools > 0);
  assert.ok(breakdown.toolDefinitions > 0);
});

test("keeps user, assistant text, and thinking in Conversation", () => {
  const breakdown = buildEstimatedContextBreakdown(sessionFixture([
    { role: "user", content: "Question" },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Reasoning" },
        { type: "text", text: "Answer" },
      ],
    },
  ], []), null, "", []);

  assert.ok(breakdown.conversation > 0);
  assert.equal(breakdown.read, 0);
  assert.equal(breakdown.write, 0);
  assert.equal(breakdown.edit, 0);
  assert.equal(breakdown.bash, 0);
  assert.equal(breakdown.otherTools, 0);
});

test("counts tool-result images in the owning tool category", () => {
  const breakdown = buildEstimatedContextBreakdown(sessionFixture([
    {
      role: "toolResult",
      toolCallId: "read-image",
      toolName: "read",
      content: [{ type: "image", data: "ignored", mimeType: "image/png" }],
    },
  ], ["read"]), null, "", []);

  assert.equal(breakdown.read, 1_024);
  assert.equal(breakdown.conversation, 0);
});

test("scaled categories sum exactly to the authoritative token total", () => {
  const breakdown = buildEstimatedContextBreakdown(sessionFixture([
    { role: "user", content: "Question" },
    { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "x".repeat(1_000) }] },
    { role: "toolResult", toolCallId: "bash-1", toolName: "bash", content: [{ type: "text", text: "y".repeat(700) }] },
  ]), 5_000, "Moros rules", [{ name: "skill", description: "description" }]);

  assert.equal(
    CONTEXT_USAGE_CATEGORY_KEYS.reduce((total, key) => total + breakdown[key], 0),
    5_000,
  );
});

test("provides file and command details for tool execution categories", () => {
  const breakdown = buildEstimatedContextBreakdown(sessionFixture([
    {
      role: "assistant",
      content: [
        { type: "toolCall", id: "read-1", name: "read", arguments: { path: "src/alpha.ts" } },
        { type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "npm run typecheck" } },
      ],
    },
    { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "alpha contents" }] },
    { role: "toolResult", toolCallId: "bash-1", toolName: "bash", content: [{ type: "text", text: "typecheck passed" }] },
  ]), null, "", []);

  assert.ok(breakdown.details?.read.some((item) => item.label === "src/alpha.ts"));
  assert.ok(breakdown.details?.bash.some((item) => item.label === "npm run typecheck"));
  assert.equal(
    breakdown.details?.read.reduce((total, item) => total + item.tokens, 0),
    breakdown.read,
  );
  assert.equal(
    breakdown.details?.bash.reduce((total, item) => total + item.tokens, 0),
    breakdown.bash,
  );
});

test("provides separate user and assistant conversation details", () => {
  const breakdown = buildEstimatedContextBreakdown(sessionFixture([
    { role: "user", content: "Question" },
    { role: "assistant", content: [{ type: "text", text: "Answer" }] },
  ], []), null, "", []);

  assert.deepEqual(
    breakdown.details?.conversation.map((item) => item.label),
    ["User message 1", "Assistant message 1"],
  );
  assert.equal(
    breakdown.details?.conversation.reduce((total, item) => total + item.tokens, 0),
    breakdown.conversation,
  );
});

test("names individual skills and tool definitions in fixed-context details", () => {
  const breakdown = buildEstimatedContextBreakdown(
    sessionFixture([], ["read", "custom_search", "subagent_dispatch"]),
    null,
    "Moros rules",
    [
      { name: "repo-review", description: "Review repository changes" },
      { name: "reporting", description: "Build a report" },
    ],
  );

  assert.deepEqual(
    breakdown.details?.skills.map((item) => item.label),
    ["repo-review", "reporting"],
  );
  assert.deepEqual(breakdown.details?.toolDefinitions.map((item) => item.label), ["read"]);
  assert.deepEqual(breakdown.details?.mcpTools.map((item) => item.label), ["custom_search"]);
  assert.deepEqual(breakdown.details?.subagents.map((item) => item.label), ["subagent_dispatch"]);
});

test("every detail group sums exactly to its scaled category", () => {
  const breakdown = buildEstimatedContextBreakdown(sessionFixture([
    { role: "user", content: "Question" },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Answer" },
        { type: "toolCall", id: "read-1", name: "read", arguments: { path: "alpha.ts" } },
        { type: "toolCall", id: "read-2", name: "read", arguments: { path: "beta.ts" } },
        { type: "toolCall", id: "bash-1", name: "bash", arguments: { command: "npm test" } },
      ],
    },
    { role: "toolResult", toolCallId: "read-1", toolName: "read", content: [{ type: "text", text: "x".repeat(900) }] },
    { role: "toolResult", toolCallId: "read-2", toolName: "read", content: [{ type: "text", text: "y".repeat(600) }] },
    { role: "toolResult", toolCallId: "bash-1", toolName: "bash", content: [{ type: "text", text: "passed" }] },
  ]), 7_321, "Moros rules", [{ name: "skill", description: "description" }]);

  assert.ok(breakdown.details);
  for (const key of CONTEXT_USAGE_CATEGORY_KEYS) {
    assert.equal(
      breakdown.details[key].reduce((total, item) => total + item.tokens, 0),
      breakdown[key],
      `${key} details should match the category total`,
    );
  }
});
