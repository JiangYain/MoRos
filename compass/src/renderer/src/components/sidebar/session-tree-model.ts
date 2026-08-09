import type { AppLanguage, UiSessionInfo } from "@shared/types";
import { localeFor, type useI18n } from "../../i18n.ts";
import { type ClientRegistry, normalizeClientName } from "../client-registry.ts";

export interface ClientGroup {
  id: string;
  name: string;
  sessions: UiSessionInfo[];
  latestModifiedAt: number;
  unassigned: boolean;
}

export type SessionOrderByClient = Record<string, string[]>;
export const SESSION_ORDER_STORAGE_KEY = "compass.sidebar.session-order.v1";

const UNASSIGNED_CLIENT = { id: "client:unassigned", name: "未关联客户", unassigned: true } satisfies Pick<ClientGroup, "id" | "name" | "unassigned">;
const CLIENT_PATTERNS = [
  /(?:客户|顾客)[ \t]*(?:姓名|名称|档案)?[ \t]*[:：][ \t]*([^\n，,。；;]+)/i,
  /(?:打开|选择|进入|新建)[ \t]*(?:客户|顾客)[ \t]*[:：][ \t]*([^\n，,。；;]+)/i,
  /(?:打开|选择|进入|新建)[ \t]*(?:客户|顾客)[ \t]+([^\n，,。；;]+)/i,
  /client[ \t]*(?:name|profile)?[ \t]*[:：][ \t]*([^\n,.;]+)/i,
];

export function sessionTitle(session: UiSessionInfo, untitled: string): string {
  return session.name?.trim() || session.firstMessage.trim() || untitled;
}

function normalizedSessionDate(value: number): Date {
  return new Date(value > 0 && value < 1_000_000_000_000 ? value * 1_000 : value);
}

export function sessionTime(session: UiSessionInfo, language: AppLanguage, t: ReturnType<typeof useI18n>["t"]): string {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat(localeFor(language), { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  if (startOfDate === startOfToday) return `${t("common.today")} ${time}`;
  if (startOfDate === startOfToday - 86_400_000) return `${t("common.yesterday")} ${time}`;
  return new Intl.DateTimeFormat(localeFor(language), { ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }), month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function sessionRelativeAge(session: UiSessionInfo, nowLabel: string, now = Date.now()): string {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = Math.floor(Math.max(0, now - date.getTime()) / 60_000);
  if (minutes < 1) return nowLabel;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo` : `${Math.floor(days / 365)}y`;
}

export function sessionDateTime(session: UiSessionInfo): string | undefined {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function clientIdentity(name: string): Pick<ClientGroup, "id" | "name" | "unassigned"> {
  return { id: `client:${name.toLocaleLowerCase("zh-CN")}`, name, unassigned: false };
}

export function inferClient(session: UiSessionInfo, registry: ClientRegistry): Pick<ClientGroup, "id" | "name" | "unassigned"> {
  const assignedName = normalizeClientName(registry.assignments[session.id] ?? "");
  if (assignedName) return clientIdentity(assignedName);
  const source = `${session.name ?? ""}\n${session.firstMessage ?? ""}`;
  for (const pattern of CLIENT_PATTERNS) {
    const name = normalizeClientName(pattern.exec(source)?.[1] ?? "");
    if (name && !name.includes("```") && !/[<>]/.test(name)) return clientIdentity(name);
  }
  return UNASSIGNED_CLIENT;
}

export function groupSessionsByClient(sessions: UiSessionInfo[], registry: ClientRegistry): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const name of registry.clients) {
    const client = clientIdentity(name);
    groups.set(client.id, { ...client, sessions: [], latestModifiedAt: 0 });
  }
  for (const session of sessions) {
    const client = inferClient(session, registry);
    const group = groups.get(client.id) ?? { ...client, sessions: [], latestModifiedAt: 0 };
    group.sessions.push(session);
    group.latestModifiedAt = Math.max(group.latestModifiedAt, session.modifiedAt);
    groups.set(client.id, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, sessions: [...group.sessions].sort((a, b) => b.modifiedAt - a.modifiedAt) }))
    .sort((a, b) => a.unassigned !== b.unassigned ? (a.unassigned ? 1 : -1) : b.latestModifiedAt - a.latestModifiedAt);
}

export function readSessionOrder(): SessionOrderByClient {
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_ORDER_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([clientId, sessionIds]) => Array.isArray(sessionIds) ? [[clientId, sessionIds.filter((id): id is string => typeof id === "string")]] : []));
  } catch { return {}; }
}

export function orderSessions(sessions: UiSessionInfo[], order: string[] | undefined): UiSessionInfo[] {
  if (!order?.length) return sessions;
  const rank = new Map(order.map((sessionId, index) => [sessionId, index]));
  return sessions.map((session, index) => ({ session, index })).sort((left, right) => {
    const leftRank = rank.get(left.session.id);
    const rightRank = rank.get(right.session.id);
    if (leftRank === undefined && rightRank === undefined) return left.index - right.index;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  }).map(({ session }) => session);
}
