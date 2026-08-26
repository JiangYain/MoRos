import type { AgentStats, UiModel } from "../../shared/types.ts";

export function buildOptimisticModelStats(
  previous: AgentStats,
  target: UiModel,
): AgentStats {
  const thinkingLevel = target.thinkingLevels.includes(previous.thinkingLevel)
    ? previous.thinkingLevel
    : (target.thinkingLevels[0] ?? "off");
  return {
    ...previous,
    model: {
      provider: target.provider,
      id: target.id,
      name: target.name,
      reasoning: target.reasoning,
      supportsImages: target.supportsImages,
      thinkingLevels: [...target.thinkingLevels],
    },
    thinkingLevel,
  };
}

export function rollbackOptimisticModelStats(
  current: AgentStats | undefined,
  optimistic: AgentStats,
  previous: AgentStats,
): AgentStats | undefined {
  return current === optimistic ? previous : current;
}
