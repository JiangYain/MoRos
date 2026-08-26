import type { SessionRemovalResult } from "./agent/session-library.ts";

type PublicMutationResult = { ok: boolean; error?: string };

export interface SessionRemovalCompletion {
  publish(): unknown | Promise<unknown>;
}

/** Completes an internal removal without exposing its session ID over RPC. */
export async function completeSessionRemoval(
  result: SessionRemovalResult,
  completion: SessionRemovalCompletion,
): Promise<PublicMutationResult> {
  if (!result.ok) return { ok: false, error: result.error };
  await completion.publish();
  return { ok: true };
}
