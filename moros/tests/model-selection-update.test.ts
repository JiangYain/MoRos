import assert from "node:assert/strict";
import test from "node:test";
import type { AgentStats, UiModel } from "../src/shared/types.ts";
import {
  buildOptimisticModelStats,
  rollbackOptimisticModelStats,
} from "../src/renderer/src/model-selection-update.ts";

const stats: AgentStats = {
  sessionId: "session",
  workspaceDir: "C:\\workspace",
  modelAuthConfigured: true,
  thinkingLevel: "xhigh",
  isStreaming: false,
  contextPercent: null,
  contextTokens: null,
  contextWindow: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
};

const target: UiModel = {
  provider: "provider",
  providerName: "Provider",
  id: "model",
  name: "Model",
  reasoning: true,
  thinkingLevels: ["off", "low", "medium", "high"],
  supportsImages: false,
  contextWindow: 1,
};

test("optimistic model state uses authoritative supported thinking levels", () => {
  const optimistic = buildOptimisticModelStats(stats, target);
  assert.deepEqual(optimistic.model?.thinkingLevels, target.thinkingLevels);
  assert.equal(optimistic.thinkingLevel, "off");
});

test("model rollback preserves a newer authoritative snapshot", () => {
  const optimistic = buildOptimisticModelStats(stats, target);
  const newer = { ...optimistic, contextWindow: 2 };
  assert.equal(rollbackOptimisticModelStats(optimistic, optimistic, stats), stats);
  assert.equal(rollbackOptimisticModelStats(newer, optimistic, stats), newer);
});
