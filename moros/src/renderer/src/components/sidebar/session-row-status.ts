import type { UiSessionInfo } from "@shared/types";

export type SessionRowStatus =
  | { kind: "running" }
  | { kind: "idle"; relativeAge: string; dateTime: string | undefined };

export function normalizedSessionDate(value: number): Date {
  return new Date(value > 0 && value < 1_000_000_000_000 ? value * 1_000 : value);
}

export function sessionRelativeAge(
  session: UiSessionInfo,
  nowLabel: string,
  now = Date.now(),
): string {
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

export function sessionRowStatus(
  session: UiSessionInfo,
  nowLabel: string,
  now = Date.now(),
): SessionRowStatus {
  if (session.isRunning) return { kind: "running" };
  return {
    kind: "idle",
    relativeAge: sessionRelativeAge(session, nowLabel, now),
    dateTime: sessionDateTime(session),
  };
}
