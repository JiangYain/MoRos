import assert from "node:assert/strict";
import test from "node:test";
import {
  rollbackEnabledModelKeys,
  updateEnabledModelKeys,
} from "../src/renderer/src/model-preference-update.ts";

test("enabled-model preferences update immediately without mutating the previous snapshot", () => {
  const previous = ["openai::gpt-5"];
  const next = updateEnabledModelKeys(previous, "github-copilot::claude-opus", true);

  assert.deepEqual(previous, ["openai::gpt-5"]);
  assert.deepEqual(next, ["openai::gpt-5", "github-copilot::claude-opus"]);
  assert.equal(updateEnabledModelKeys(next, "github-copilot::claude-opus", true), next);
});

test("enabled-model preferences remove a selected model optimistically", () => {
  assert.deepEqual(
    updateEnabledModelKeys(
      ["openai::gpt-5", "github-copilot::claude-opus"],
      "github-copilot::claude-opus",
      false,
    ),
    ["openai::gpt-5"],
  );
});

test("a failed save rolls back only while its optimistic value is still current", () => {
  assert.deepEqual(
    rollbackEnabledModelKeys(
      ["openai::gpt-5", "github-copilot::claude-opus"],
      "github-copilot::claude-opus",
      true,
      false,
    ),
    ["openai::gpt-5"],
  );

  const newerChoice = ["openai::gpt-5"];
  assert.equal(
    rollbackEnabledModelKeys(
      newerChoice,
      "github-copilot::claude-opus",
      true,
      false,
    ),
    newerChoice,
  );
});
