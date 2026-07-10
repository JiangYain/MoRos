import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ContextUsageBreakdown } from "@shared/types";

interface SkillSummary {
  name: string;
  description: string;
}

function estimateTextTokens(value: string): number {
  return value ? Math.max(1, Math.ceil(value.length / 4)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function estimateMessageTokens(message: unknown): number {
  if (!isRecord(message)) return 0;
  const content = message.content;
  if (typeof content === "string") return estimateTextTokens(content);
  if (!Array.isArray(content)) return estimateTextTokens(JSON.stringify(message));
  return content.reduce((total, block) => {
    if (!isRecord(block)) return total;
    if (block.type === "image") return total + 1_024;
    if (block.type === "text" && typeof block.text === "string") {
      return total + estimateTextTokens(block.text);
    }
    if (block.type === "thinking" && typeof block.thinking === "string") {
      return total + estimateTextTokens(block.thinking);
    }
    return total + estimateTextTokens(JSON.stringify(block));
  }, 0);
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
  const raw: Omit<ContextUsageBreakdown, "estimated"> = {
    systemPrompt: Math.max(0, completeSystemPrompt - rules - skills),
    toolDefinitions: builtInTools.length > 0 ? estimateTextTokens(JSON.stringify(builtInTools)) : 0,
    rules,
    skills,
    mcpTools: dynamicTools.length > 0 ? estimateTextTokens(JSON.stringify(dynamicTools)) : 0,
    subagents: subagentTools.length > 0 ? estimateTextTokens(JSON.stringify(subagentTools)) : 0,
    conversation: session.messages.reduce(
      (total, message) => total + estimateMessageTokens(message),
      0,
    ),
  };
  const keys = Object.keys(raw) as Array<keyof typeof raw>;
  const rawTotal = keys.reduce((total, key) => total + raw[key], 0);
  const target = Math.max(0, totalTokens ?? rawTotal);
  if (rawTotal === 0 || target === 0) return { ...raw, estimated: true };

  const scale = target / rawTotal;
  const scaled = Object.fromEntries(
    keys.map((key) => [key, Math.max(0, Math.round(raw[key] * scale))]),
  ) as Omit<ContextUsageBreakdown, "estimated">;
  const scaledTotal = keys.reduce((total, key) => total + scaled[key], 0);
  scaled.conversation = Math.max(0, scaled.conversation + target - scaledTotal);
  return { ...scaled, estimated: true };
}
