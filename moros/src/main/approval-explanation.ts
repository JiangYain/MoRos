import type {
  AppLanguage,
  CommandExplanationLanguage,
  UiApprovalRequest,
} from "@shared/types";

const MAX_APPROVAL_CONTEXT_CHARS = 2_400;
const MAX_APPROVAL_EXPLANATION_CHARS = 180;

function approvalSubject(args: unknown): string {
  if (typeof args === "string") return args.trim();
  if (!args || typeof args !== "object") return "";

  const record = args as Record<string, unknown>;
  for (const key of ["cmd", "command", "path", "file_path", "filePath", "target", "query"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  try {
    return JSON.stringify(record);
  } catch {
    return "";
  }
}

export function resolveApprovalExplanationLanguage(
  preference: CommandExplanationLanguage,
  interfaceLanguage: AppLanguage,
): AppLanguage {
  return preference === "auto" ? interfaceLanguage : preference;
}

export function buildApprovalExplanationContext(request: UiApprovalRequest): string {
  const subject = approvalSubject(request.args) || request.detail.trim();
  return [
    `Tool: ${request.toolName}`,
    `Approval request: ${request.message}`,
    subject ? `Command or target:\n${subject}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_APPROVAL_CONTEXT_CHARS)
    .trim();
}

export function normalizeGeneratedApprovalExplanation(value: string): string | null {
  const normalized = value
    .replace(/```(?:\w+)?/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:summary|explanation|description|command explanation|说明|命令说明|摘要|zusammenfassung|erklärung)\s*[:：-]\s*/i, "")
    .replace(/^[-*•]\s*/, "")
    .replace(/^["'“‘《【]+|["'”’》】]+$/g, "")
    .trim();
  if (!normalized) return null;

  const characters = Array.from(normalized);
  return characters.length <= MAX_APPROVAL_EXPLANATION_CHARS
    ? normalized
    : `${characters.slice(0, MAX_APPROVAL_EXPLANATION_CHARS - 1).join("")}…`;
}
