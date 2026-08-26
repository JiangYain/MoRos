import assert from "node:assert/strict";
import test from "node:test";
import type { UiModel } from "../src/shared/types.ts";
import { filterAndSortModels } from "../src/renderer/src/components/model-list.ts";

const model = (id: string, name: string, providerName = "Provider"): UiModel => ({
  id,
  name,
  provider: providerName.toLowerCase(),
  providerName,
  contextWindow: 0,
  reasoning: false,
  supportsImages: false,
});

test("model ordering is alphabetical and independent from enabled state", () => {
  const models = [model("z", "Zulu"), model("a", "Alpha"), model("m", "Medium")];
  assert.deepEqual(filterAndSortModels(models, "").map((item) => item.id), ["a", "m", "z"]);
  assert.deepEqual(models.map((item) => item.id), ["z", "a", "m"]);
});

test("model filtering preserves the stable alphabetical order", () => {
  const models = [model("gpt-z", "GPT Z"), model("claude", "Claude"), model("gpt-a", "GPT A")];
  assert.deepEqual(filterAndSortModels(models, "gpt").map((item) => item.id), ["gpt-a", "gpt-z"]);
});
