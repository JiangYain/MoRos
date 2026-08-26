import type { AgentSession } from "@earendil-works/pi-coding-agent";
import {
  CONTEXT_USAGE_CATEGORY_KEYS,
  type ContextUsageBreakdown,
  type ContextUsageCategoryKey,
  type ContextUsageDetailItem,
  type ContextUsageDetails,
} from "../shared/types.ts";

interface SkillSummary {
  name: string;
  description: string;
}

type ToolExecutionKey = "read" | "write" | "edit" | "bash" | "otherTools";
type ContextUsageTokenBreakdown = Record<ContextUsageCategoryKey, number>;

interface ToolCallDescriptor {
  key: ToolExecutionKey;
  label: string;
}

function estimateTextTokens(value: string): number {
  return value ? Math.max(1, Math.ceil(value.length / 4)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function emptyDetails(): ContextUsageDetails {
  return {
    systemPrompt: [],
    toolDefinitions: [],
    rules: [],
    skills: [],
    mcpTools: [],
    subagents: [],
    conversation: [],
    read: [],
    write: [],
    edit: [],
    bash: [],
    otherTools: [],
  };
}

function toolExecutionKey(value: unknown): ToolExecutionKey {
  if (typeof value !== "string") return "otherTools";
  switch (value.trim().toLowerCase()) {
    case "read": return "read";
    case "write": return "write";
    case "edit": return "edit";
    case "bash": return "bash";
    default: return "otherTools";
  }
}

function estimateContentBlockTokens(block: unknown): number {
  if (!isRecord(block)) return 0;
  if (block.type === "image") return 1_024;
  if (block.type === "text" && typeof block.text === "string") {
    return estimateTextTokens(block.text);
  }
  if (block.type === "thinking" && typeof block.thinking === "string") {
    return estimateTextTokens(block.thinking);
  }
  return estimateTextTokens(safeStringify(block));
}

function estimateMessageContentTokens(message: Record<string, unknown>): number {
  const content = message.content;
  if (typeof content === "string") return estimateTextTokens(content);
  if (!Array.isArray(content)) return estimateTextTokens(safeStringify(message));
  return content.reduce(
    (total, block) => total + estimateContentBlockTokens(block),
    0,
  );
}

function compactLabel(value: string, fallback: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return fallback;
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

function stringArgument(args: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(args)) return undefined;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function toolDetailLabel(toolName: unknown, args: unknown): string {
  const name = typeof toolName === "string" && toolName.trim() ? toolName.trim() : "Tool";
  switch (toolExecutionKey(toolName)) {
    case "read":
    case "write":
    case "edit":
      return compactLabel(
        stringArgument(args, ["path", "file_path", "filePath", "file", "filename"]) ?? "",
        name,
      );
    case "bash":
      return compactLabel(stringArgument(args, ["command", "cmd"]) ?? "", name);
    case "otherTools": {
      const hint = stringArgument(args, ["query", "pattern", "path", "url", "name"]);
      return compactLabel(hint ? `${name}: ${hint}` : name, "Tool");
    }
  }
}

function messageRoleLabel(role: unknown): string {
  switch (role) {
    case "user": return "User";
    case "assistant": return "Assistant";
    case "developer": return "Developer";
    case "system": return "System";
    default: return "Conversation";
  }
}

function appendDetail(
  details: ContextUsageDetails,
  key: ContextUsageCategoryKey,
  item: ContextUsageDetailItem,
): void {
  if (item.tokens <= 0) return;
  const existing = details[key].find((candidate) => candidate.id === item.id);
  if (existing) {
    existing.tokens += item.tokens;
    existing.label = item.label;
    return;
  }
  details[key].push(item);
}

function collectToolCallDescriptors(messages: readonly unknown[]): Map<string, ToolCallDescriptor> {
  const descriptors = new Map<string, ToolCallDescriptor>();
  messages.forEach((message, messageIndex) => {
    if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) return;
    message.content.forEach((block, blockIndex) => {
      if (!isRecord(block) || block.type !== "toolCall") return;
      const callId = typeof block.id === "string" && block.id
        ? block.id
        : `message-${messageIndex}-block-${blockIndex}`;
      descriptors.set(callId, {
        key: toolExecutionKey(block.name),
        label: toolDetailLabel(block.name, block.arguments),
      });
    });
  });
  return descriptors;
}

function buildMessageDetails(messages: readonly unknown[]): ContextUsageDetails {
  const details = emptyDetails();
  const descriptors = collectToolCallDescriptors(messages);
  const roleCounts = new Map<string, number>();

  messages.forEach((message, messageIndex) => {
    if (!isRecord(message)) return;

    if (message.role === "toolResult") {
      const callId = typeof message.toolCallId === "string" && message.toolCallId
        ? message.toolCallId
        : `result-${messageIndex}`;
      const descriptor = descriptors.get(callId);
      const key = descriptor?.key ?? toolExecutionKey(message.toolName);
      appendDetail(details, key, {
        id: `${key}:tool:${callId}`,
        label: descriptor?.label ?? toolDetailLabel(message.toolName, undefined),
        tokens: estimateMessageContentTokens(message),
      });
      return;
    }

    if (message.role === "assistant" && Array.isArray(message.content)) {
      let conversationTokens = 0;
      message.content.forEach((block, blockIndex) => {
        if (isRecord(block) && block.type === "toolCall") {
          const callId = typeof block.id === "string" && block.id
            ? block.id
            : `message-${messageIndex}-block-${blockIndex}`;
          const descriptor = descriptors.get(callId) ?? {
            key: toolExecutionKey(block.name),
            label: toolDetailLabel(block.name, block.arguments),
          };
          appendDetail(details, descriptor.key, {
            id: `${descriptor.key}:tool:${callId}`,
            label: descriptor.label,
            tokens: estimateContentBlockTokens(block),
          });
        } else {
          conversationTokens += estimateContentBlockTokens(block);
        }
      });
      if (conversationTokens > 0) {
        const role = "assistant";
        const ordinal = (roleCounts.get(role) ?? 0) + 1;
        roleCounts.set(role, ordinal);
        appendDetail(details, "conversation", {
          id: `conversation:message:${messageIndex}`,
          label: `${messageRoleLabel(role)} message ${ordinal}`,
          tokens: conversationTokens,
        });
      }
      return;
    }

    const tokens = estimateMessageContentTokens(message);
    if (tokens <= 0) return;
    const role = typeof message.role === "string" ? message.role : "conversation";
    const ordinal = (roleCounts.get(role) ?? 0) + 1;
    roleCounts.set(role, ordinal);
    appendDetail(details, "conversation", {
      id: `conversation:message:${messageIndex}`,
      label: `${messageRoleLabel(role)} message ${ordinal}`,
      tokens,
    });
  });

  return details;
}

function allocateLargestRemainder(values: readonly number[], target: number): number[] {
  const normalizedTarget = Math.max(0, Math.round(target));
  if (values.length === 0) return [];
  if (normalizedTarget === 0) return values.map(() => 0);

  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total === 0) return values.map((_, index) => index === 0 ? normalizedTarget : 0);

  const scale = normalizedTarget / total;
  const allocations = values.map((value, index) => {
    const exact = Math.max(0, value) * scale;
    const floored = Math.floor(exact);
    return { index, value: floored, remainder: exact - floored };
  });
  let remaining = normalizedTarget - allocations.reduce(
    (sum, allocation) => sum + allocation.value,
    0,
  );
  const byRemainder = [...allocations].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index,
  );
  for (let index = 0; index < byRemainder.length && remaining > 0; index += 1) {
    byRemainder[index].value += 1;
    remaining -= 1;
  }

  return allocations.map((allocation) => Math.max(0, allocation.value));
}

function scaleDetailItems(
  key: ContextUsageCategoryKey,
  items: readonly ContextUsageDetailItem[],
  target: number,
  fallbackLabel: string,
): ContextUsageDetailItem[] {
  const normalizedTarget = Math.max(0, Math.round(target));
  if (normalizedTarget === 0) return [];
  if (items.length === 0) {
    return [{ id: `${key}:total`, label: fallbackLabel, tokens: normalizedTarget }];
  }

  const allocations = allocateLargestRemainder(
    items.map((item) => item.tokens),
    normalizedTarget,
  );
  return items
    .map((item, index) => ({ ...item, tokens: allocations[index] }))
    .filter((item) => item.tokens > 0);
}

function detailsTotal(items: readonly ContextUsageDetailItem[]): number {
  return items.reduce((total, item) => total + item.tokens, 0);
}

function scaleBreakdown(
  raw: ContextUsageTokenBreakdown,
  target: number,
): ContextUsageTokenBreakdown {
  const rawValues = CONTEXT_USAGE_CATEGORY_KEYS.map((key) => raw[key]);
  if (rawValues.every((value) => value === 0) && target > 0) {
    return { ...raw, conversation: Math.max(0, Math.round(target)) };
  }
  const allocations = allocateLargestRemainder(rawValues, target);
  return Object.fromEntries(
    CONTEXT_USAGE_CATEGORY_KEYS.map((key, index) => [key, allocations[index]]),
  ) as ContextUsageTokenBreakdown;
}

function toolDefinitionDetails(
  key: "toolDefinitions" | "mcpTools" | "subagents",
  tools: readonly { name: string }[],
  target: number,
): ContextUsageDetailItem[] {
  return scaleDetailItems(
    key,
    tools.map((tool, index) => ({
      id: `${key}:${tool.name}:${index}`,
      label: tool.name,
      tokens: estimateTextTokens(safeStringify(tool)),
    })),
    target,
    key,
  );
}

export function buildEstimatedContextBreakdown(
  session: AgentSession,
  totalTokens: number | null,
  rulesText: string,
  loadedSkills: SkillSummary[],
): ContextUsageBreakdown {
  const activeTools = new Set(session.getActiveToolNames());
  const allTools = session.getAllTools().filter((tool) => activeTools.has(tool.name));
  const builtInNames = new Set(["read", "bash", "edit", "write", "grep", "find", "ls"]);
  const subagentTools = allTools.filter((tool) => /(?:subagent|agent)/i.test(tool.name));
  const dynamicTools = allTools.filter(
    (tool) => !builtInNames.has(tool.name) && !subagentTools.includes(tool),
  );
  const builtInTools = allTools.filter((tool) => builtInNames.has(tool.name));
  const rules = estimateTextTokens(rulesText);
  const skills = estimateTextTokens(
    loadedSkills.map((skill) => `${skill.name}\n${skill.description}`).join("\n\n"),
  );
  const completeSystemPrompt = estimateTextTokens(session.systemPrompt);
  const builtInToolTokens = builtInTools.length > 0
    ? estimateTextTokens(safeStringify(builtInTools))
    : 0;
  const dynamicToolTokens = dynamicTools.length > 0
    ? estimateTextTokens(safeStringify(dynamicTools))
    : 0;
  const subagentToolTokens = subagentTools.length > 0
    ? estimateTextTokens(safeStringify(subagentTools))
    : 0;

  const rawDetails = buildMessageDetails(session.messages);
  rawDetails.systemPrompt = scaleDetailItems(
    "systemPrompt",
    [{
      id: "systemPrompt:base",
      label: "Base system prompt",
      tokens: Math.max(0, completeSystemPrompt - rules - skills),
    }],
    Math.max(0, completeSystemPrompt - rules - skills),
    "Base system prompt",
  );
  rawDetails.rules = scaleDetailItems(
    "rules",
    [{ id: "rules:moros", label: "Moros rules", tokens: rules }],
    rules,
    "Moros rules",
  );
  rawDetails.skills = scaleDetailItems(
    "skills",
    loadedSkills.map((skill, index) => ({
      id: `skills:${skill.name}:${index}`,
      label: skill.name,
      tokens: estimateTextTokens(`${skill.name}\n${skill.description}`),
    })),
    skills,
    "Skills",
  );
  rawDetails.toolDefinitions = toolDefinitionDetails(
    "toolDefinitions",
    builtInTools,
    builtInToolTokens,
  );
  rawDetails.mcpTools = toolDefinitionDetails("mcpTools", dynamicTools, dynamicToolTokens);
  rawDetails.subagents = toolDefinitionDetails("subagents", subagentTools, subagentToolTokens);

  const raw = Object.fromEntries(
    CONTEXT_USAGE_CATEGORY_KEYS.map((key) => [key, detailsTotal(rawDetails[key])]),
  ) as ContextUsageTokenBreakdown;
  const rawTotal = CONTEXT_USAGE_CATEGORY_KEYS.reduce((total, key) => total + raw[key], 0);
  const target = Math.max(0, Math.round(totalTokens ?? rawTotal));
  const scaled = scaleBreakdown(raw, target);
  const details = Object.fromEntries(
    CONTEXT_USAGE_CATEGORY_KEYS.map((key) => [
      key,
      scaleDetailItems(key, rawDetails[key], scaled[key], key),
    ]),
  ) as ContextUsageDetails;

  return { ...scaled, details, estimated: true };
}
