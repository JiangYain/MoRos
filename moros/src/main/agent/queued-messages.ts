import type { QueuedMessageKind } from "@shared/types";

export type QueuedMessageRemovalFailure = "not-found" | "unavailable";

export interface QueuedMessageRemovalResult {
  ok: boolean;
  reason?: QueuedMessageRemovalFailure;
}

/**
 * Removes one pending steering/follow-up message from a live Pi AgentSession.
 *
 * Pi's public queue API only offers clearQueue(), which returns plain texts and
 * would drop image attachments from every re-queued message, so this reaches
 * into the session's display queue (`_steeringMessages`/`_followUpMessages`)
 * and the underlying agent's pending queue. Every touched shape is validated
 * before any mutation: a Pi upgrade that changes internals degrades into an
 * explicit "unavailable" failure instead of corrupting queue state.
 *
 * `index` + `text` must both match the current display queue. A message the
 * agent loop has already drained (it is about to execute) no longer matches
 * and is reported as "not-found". All reads and mutations happen synchronously
 * in a single event-loop turn, so the agent loop cannot interleave a drain.
 */
export function removeQueuedSessionMessage(
  session: unknown,
  kind: QueuedMessageKind,
  index: number,
  text: string,
): QueuedMessageRemovalResult {
  if (!Number.isInteger(index) || index < 0) return { ok: false, reason: "not-found" };
  if (!isRecord(session)) return { ok: false, reason: "unavailable" };

  const display = session[kind === "steering" ? "_steeringMessages" : "_followUpMessages"];
  const emitQueueUpdate = session._emitQueueUpdate;
  const agent = session.agent;
  if (!isStringArray(display) || typeof emitQueueUpdate !== "function" || !isRecord(agent)) {
    return { ok: false, reason: "unavailable" };
  }
  const queue = agent[kind === "steering" ? "steeringQueue" : "followUpQueue"];
  const pending = isRecord(queue) ? queue.messages : undefined;
  if (!Array.isArray(pending)) return { ok: false, reason: "unavailable" };

  if (display[index] !== text) return { ok: false, reason: "not-found" };

  // The pending queue can also hold extension "custom" messages, so the
  // display index maps to the index-th *user* entry, not pending[index].
  const pendingIndex = pendingUserMessageIndex(pending, index);
  if (pendingIndex === -1 || userMessageText(pending[pendingIndex]) !== text) {
    return { ok: false, reason: "not-found" };
  }

  display.splice(index, 1);
  pending.splice(pendingIndex, 1);
  try {
    emitQueueUpdate.call(session);
  } catch {
    // Both queues are already consistent; a failed broadcast only delays the
    // next queue_update-driven UI refresh.
  }
  return { ok: true };
}

function pendingUserMessageIndex(pending: readonly unknown[], displayIndex: number): number {
  let ordinal = -1;
  for (let position = 0; position < pending.length; position += 1) {
    if (userMessageText(pending[position]) === undefined) continue;
    ordinal += 1;
    if (ordinal === displayIndex) return position;
  }
  return -1;
}

/** Joined text of a queued user message, or undefined for non-user entries. */
function userMessageText(message: unknown): string | undefined {
  if (!isRecord(message) || message.role !== "user" || !Array.isArray(message.content)) {
    return undefined;
  }
  let text = "";
  for (const part of message.content) {
    if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
      text += part.text;
    }
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
