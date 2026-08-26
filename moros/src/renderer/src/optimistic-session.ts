import type {
  AgentStats,
  UiImageAttachment,
  UiSessionInfo,
  UiThreadItem,
} from "../../shared/types.ts";
import { compactSkillText } from "../../shared/skill-display.ts";

interface OptimisticUserInput {
  id: string;
  images?: UiImageAttachment[];
  sessions: UiSessionInfo[];
  stats?: AgentStats;
  text: string;
  thread: UiThreadItem[];
  ts: number;
}

export function upsertActiveSession(
  sessions: UiSessionInfo[],
  stats: AgentStats | undefined,
  thread: UiThreadItem[],
  text: string,
  images: UiImageAttachment[] | undefined,
  ts: number,
): UiSessionInfo[] {
  if (!stats?.sessionId || !stats.sessionPath) return sessions;
  const existing = sessions.find(
    (session) => session.id === stats.sessionId || session.path === stats.sessionPath,
  );
  const firstMessage =
    existing?.firstMessage ||
    text.trim() ||
    (images?.length ? "Image attachment" : "Untitled session");
  const active: UiSessionInfo = {
    path: stats.sessionPath,
    id: stats.sessionId,
    cwd: existing?.cwd ?? stats.workspaceDir,
    name: existing?.name ?? stats.sessionName,
    firstMessage,
    createdAt: existing?.createdAt ?? ts,
    modifiedAt: ts,
    messageCount: thread.filter((item) => item.kind === "user" || item.kind === "assistant").length,
  };
  const next = sessions.filter(
    (session) => session.id !== active.id && session.path !== active.path,
  );
  next.push(active);
  return next.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function appendOptimisticUser(input: OptimisticUserInput): {
  sessions: UiSessionInfo[];
  thread: UiThreadItem[];
} {
  const display = compactSkillText(input.text);
  const optimisticMessage: UiThreadItem = {
    kind: "user",
    id: input.id,
    text: display.text,
    ...(display.skillName ? { skillName: display.skillName } : {}),
    images: input.images,
    ts: input.ts,
  };
  const thread = [...input.thread, optimisticMessage];
  return {
    thread,
    sessions: upsertActiveSession(
      input.sessions,
      input.stats,
      thread,
      display.text || (display.skillName ? `Skill: ${display.skillName}` : input.text),
      input.images,
      input.ts,
    ),
  };
}
