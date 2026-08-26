import type { UiSessionInfo } from "../shared/types.ts";

export function mergeActiveSession(
  sessions: UiSessionInfo[],
  active: UiSessionInfo | undefined,
): UiSessionInfo[] {
  if (!active) return [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt);

  let found = false;
  const merged = sessions.map((session) => {
    if (session.id !== active.id && session.path !== active.path) return session;
    found = true;
    return {
      ...session,
      name: session.name ?? active.name,
      firstMessage: session.firstMessage || active.firstMessage,
      createdAt: Math.min(session.createdAt || active.createdAt, active.createdAt),
      modifiedAt: Math.max(session.modifiedAt, active.modifiedAt),
      messageCount: Math.max(session.messageCount, active.messageCount),
    };
  });

  if (!found) merged.push(active);
  return merged.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function markRunningSessions(
  sessions: UiSessionInfo[],
  runningSessionIds: ReadonlySet<string>,
): UiSessionInfo[] {
  return sessions.map((session) => ({
    ...session,
    isRunning: runningSessionIds.has(session.id),
  }));
}
