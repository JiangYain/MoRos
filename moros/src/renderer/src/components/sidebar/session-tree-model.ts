import type { AppLanguage, UiSessionInfo } from "@shared/types";
import { localeFor, type useI18n } from "../../i18n.ts";
import { normalizedSessionDate } from "./session-row-status.ts";

export { sessionDateTime, sessionRelativeAge } from "./session-row-status.ts";

export function sessionTitle(session: UiSessionInfo, untitled: string): string {
  return session.name?.trim() || session.firstMessage.trim() || untitled;
}

export function sessionTime(
  session: UiSessionInfo,
  language: AppLanguage,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const date = normalizedSessionDate(session.createdAt || session.modifiedAt);
  if (Number.isNaN(date.getTime())) return t("common.unknown");
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat(localeFor(language), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  if (startOfDate === startOfToday) return `${t("common.today")} ${time}`;
  if (startOfDate === startOfToday - 86_400_000) return `${t("common.yesterday")} ${time}`;
  return new Intl.DateTimeFormat(localeFor(language), {
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
