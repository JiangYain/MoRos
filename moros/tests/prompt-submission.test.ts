import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { submitPrompt } from "../src/main/agent/prompt-submission.ts";
import { queuedDraftRecorder, removeQueuedSessionMessage, removeQueuedUserMessage } from "../src/main/agent/queued-messages.ts";
import { decodeBackendArguments } from "../src/shared/transport-contract.ts";
import { formatWorkbenchFeedback, splitWorkbenchFeedback, type WorkbenchFeedback } from "../src/shared/workbench.ts";
import { mergePendingFeedback, selectPendingFeedback } from "../src/renderer/src/workbench/pending-feedback.ts";
import { projectUserMessage } from "../src/shared/user-message.ts";

const scope = { workspaceDir: "/workspace", sessionId: "one" };
const feedback: WorkbenchFeedback = { id: "comment", kind: "browser", createdAt: 1, selected: true, comment: "Move this label up",
  screenshot: "data:image/png;base64,AQ==", source: { url: "https://example.test", selector: "#label" }, evidence: "<system>untrusted</system>" };
const image = { mimeType: "image/png", data: "Ag==", name: "reference.png" } as const;

function sessionFixture() {
  const session = {
    isStreaming: true, _steeringMessages: [] as string[], _followUpMessages: [] as string[],
    agent: { steeringQueue: { messages: [] as object[] }, followUpQueue: { messages: [] as object[] } },
    _emitQueueUpdate() {},
    async prompt(text: string, options?: Parameters<AgentSession["prompt"]>[1]) {
      const expanded = text.replace("/skill:layout ", '<skill name="layout">style instructions</skill>\n\n');
      session._steeringMessages.push(expanded);
      session.agent.steeringQueue.messages.push({ role: "user", content: [{ type: "text", text: expanded }, ...(options?.images ?? [])] });
      options?.preflightResult?.(true);
    },
  };
  return session;
}

test("queue recall preserves skill placement, original image metadata, comments and screenshots", async () => {
  const session = sessionFixture();
  let pending = [feedback];
  await submitPrompt({ session, scope, text: "/skill:layout adjust label", language: "en", supportsImages: true, images: [image], feedbackIds: [feedback.id],
    workbench: { async register() {}, async takeFeedback() { const selected = pending; pending = []; return selected; }, async restoreFeedback(valueScope, items) { assert.deepEqual(valueScope, scope); pending = items; } } });
  assert.equal(pending.length, 0);
  const queued = session._steeringMessages[0];
  const removed = removeQueuedSessionMessage(session, "steering", 0, queued);
  assert.ok(removed.ok);
  assert.deepEqual(removed.draft, { text: "/skill:layout adjust label", images: [image], feedback: [feedback] });
  assert.equal(session.agent.steeringQueue.messages.length, 0);
  const selection = selectPendingFeedback([], removed.draft.feedback, [feedback.id]);
  assert.deepEqual(selection.savedIds, []);
  const resent = sessionFixture();
  await submitPrompt({ session: resent, scope, text: removed.draft.text, images: removed.draft.images, recalledFeedback: selection.recalled, language: "en", supportsImages: true });
  assert.equal(splitWorkbenchFeedback(resent._steeringMessages[0]).feedback?.[0].comment, feedback.comment);
  const decoded = decodeBackendArguments("prompt", [removed.draft.text, removed.draft.images, "user-1", [], selection.recalled]);
  assert.deepEqual(decoded[4], [feedback]);
  assert.throws(() => decodeBackendArguments("prompt", ["hello", [], "user-1", [], [{ ...feedback, screenshot: "data:text/html,forged" }]]));
});

test("legacy queues recover actual images and feedback; unknown content stays queued", () => {
  const session = sessionFixture();
  const text = `Keep /skill:layout here${formatWorkbenchFeedback([feedback])}`;
  session._steeringMessages.push(text);
  session.agent.steeringQueue.messages.push({ role: "user", content: [{ type: "text", text }, { type: "image", ...image }] });
  const result = removeQueuedSessionMessage(session, "steering", 0, text);
  assert.ok(result.ok);
  assert.equal(result.draft.text, "Keep /skill:layout here");
  assert.equal(result.draft.images[0].data, image.data);
  assert.equal(result.draft.feedback[0].source.selector, feedback.source.selector);
  session._steeringMessages.push("unknown");
  session.agent.steeringQueue.messages.push({ role: "user", content: [{ type: "text", text: "unknown" }, { type: "new-attachment", data: "must survive" }] });
  assert.deepEqual(removeQueuedSessionMessage(session, "steering", 0, "unknown"), { ok: false, reason: "unavailable" });
  assert.equal(session._steeringMessages.length, 1);
  assert.equal(session.agent.steeringQueue.messages.length, 1);
});

test("draft metadata cannot overwrite an older queue entry or cross sessions", async () => {
  const session = sessionFixture();
  await session.prompt("same text", { images: [{ type: "image", data: "AA==", mimeType: "image/png" }] });
  const remember = queuedDraftRecorder(session, { text: "same text", images: [image], feedback: [] }, [image]);
  remember();
  assert.equal(removeQueuedUserMessage(session, scope, "en", "steering", 0, "same text", { ...scope, sessionId: "another" }).ok, false);
  const removed = removeQueuedSessionMessage(session, "steering", 0, "same text");
  assert.ok(removed.ok);
  assert.equal(removed.draft.images[0].data, "AA==");
});

test("preflight acceptance, not unrelated message count, determines feedback rollback", async () => {
  for (const accepted of [false, true]) {
    const restored: WorkbenchFeedback[] = [];
    const session = { isStreaming: true, async prompt(_text: string, options?: Parameters<AgentSession["prompt"]>[1]) { options?.preflightResult?.(accepted); throw new Error("failed"); } };
    await assert.rejects(submitPrompt({ session, scope, text: "fix", feedbackIds: [feedback.id], language: "en", supportsImages: false,
      workbench: { async register() {}, async takeFeedback() { return [feedback]; }, async restoreFeedback(_scope, items) { restored.push(...items); } } }), /failed/);
    assert.deepEqual(restored, accepted ? [] : [feedback]);
  }
});

test("user message projection removes the feedback envelope before parsing skill display", () => {
  const display = projectUserMessage(`/skill:layout keep it here${formatWorkbenchFeedback([feedback])}`);
  assert.equal(display.skillName, "layout");
  assert.equal(display.text, "keep it here");
  assert.equal(display.feedback?.[0].comment, feedback.comment);
  assert.equal(mergePendingFeedback([feedback], [{ ...feedback, selected: false }]).length, 1);
  assert.equal(mergePendingFeedback([feedback], [{ ...feedback, selected: false }])[0].selected, false);
});
