import assert from "node:assert/strict";
import test from "node:test";
import { filterSettingsTargets, type SettingsSearchTarget } from "../src/renderer/src/components/settings-search.ts";

const TARGETS: readonly SettingsSearchTarget[] = [
  {
    sectionId: "general",
    targetId: "settings-page-general",
    title: "General",
    description: "Language, quick prompts, and runtime.",
    keywords: "preferences settings",
  },
  {
    sectionId: "appearance",
    targetId: "settings-page-appearance",
    title: "Appearance",
    description: "Control how Compass looks and feels.",
    keywords: "appearance settings",
  },
  {
    sectionId: "profile",
    targetId: "settings-page-profile",
    title: "Profile",
    description: "Manage your local profile information.",
    keywords: "profile settings",
  },
  {
    sectionId: "models",
    targetId: "settings-page-models",
    title: "Models",
    description: "Configure model providers and defaults.",
    keywords: "provider model settings",
  },
  {
    sectionId: "skills",
    targetId: "settings-page-skills",
    title: "Skills",
    description: "Manage the skills available to Compass.",
    keywords: "skill settings",
  },
  {
    sectionId: "general",
    targetId: "settings-language",
    title: "Language",
    description: "Choose the language used by the Compass interface.",
    keywords: "sprache 语言 語言",
  },
  {
    sectionId: "general",
    targetId: "settings-command-explanation-language",
    title: "Command explanation language",
    description: "Choose the language used for generated command explanations.",
    keywords: "approval summary 命令 说明 语言",
  },
  {
    sectionId: "appearance",
    targetId: "settings-theme",
    title: "Color theme",
    description: "Choose light, dark, or follow your system.",
    keywords: "light dark system 主题",
  },
  {
    sectionId: "profile",
    targetId: "settings-profile-identity",
    title: "Profile name",
    description: "Edit the local display name and username.",
    keywords: "handle identity 资料",
  },
  {
    sectionId: "models",
    targetId: "settings-providers",
    title: "Providers & API Keys",
    description: "Connect providers and manage API keys.",
    keywords: "key provider key",
  },
  {
    sectionId: "models",
    targetId: "settings-models-list",
    title: "Models",
    description: "Choose enabled, active, and conversation title models.",
    keywords: "model ai llm",
  },
  {
    sectionId: "skills",
    targetId: "settings-skills-list",
    title: "Skills",
    description: "Manage local skills and additional skill folders.",
    keywords: "agent 技能",
  },
];

function assertIncludesTarget(query: string, targetId: string): void {
  const match = filterSettingsTargets(TARGETS, query).find((target) => target.targetId === targetId);
  assert.ok(match, `Expected ${JSON.stringify(query)} to include ${targetId}`);
}

test("empty query matches nothing so search stays out of the way", () => {
  assert.deepEqual(filterSettingsTargets(TARGETS, ""), []);
  assert.deepEqual(filterSettingsTargets(TARGETS, "   "), []);
});

test("matches page names across general, appearance, profile, models, and skills", () => {
  assertIncludesTarget("general", "settings-page-general");
  assertIncludesTarget("appearance", "settings-page-appearance");
  assertIncludesTarget("profile", "settings-page-profile");
  assertIncludesTarget("models", "settings-page-models");
  assertIncludesTarget("skills", "settings-page-skills");

  // A page-level match and a specific setting may both be valid. Confirm that
  // the specific destination remains discoverable without assuming uniqueness.
  assertIncludesTarget("language", "settings-language");
  assertIncludesTarget("command explanation", "settings-command-explanation-language");
  assertIncludesTarget("color theme", "settings-theme");
  assertIncludesTarget("profile name", "settings-profile-identity");
  assertIncludesTarget("provider", "settings-providers");
  assertIncludesTarget("skills", "settings-skills-list");
});

test("matches keywords and descriptions, not just titles", () => {
  const descMatches = filterSettingsTargets(TARGETS, "follow your system");
  assert.equal(descMatches.length, 1);
  assert.equal(descMatches[0].targetId, "settings-theme");
});

test("multi-token queries require every token to match", () => {
  const matches = filterSettingsTargets(TARGETS, "api key");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].targetId, "settings-providers");

  // A token that appears nowhere narrows to zero results.
  assert.deepEqual(filterSettingsTargets(TARGETS, "language nonexistent"), []);
});

test("results keep the declared order so navigation is stable", () => {
  // "compass" appears in both page-level and setting-level descriptions. Every
  // result should stay in the order declared in TARGETS.
  const matches = filterSettingsTargets(TARGETS, "compass");
  assert.deepEqual(
    matches.map((match) => match.targetId),
    ["settings-page-appearance", "settings-page-skills", "settings-language"],
  );
});

test("fixed workspace and composer permissions are not exposed as settings targets", () => {
  assert.deepEqual(filterSettingsTargets(TARGETS, "workspace"), []);
  assert.deepEqual(filterSettingsTargets(TARGETS, "permission"), []);
  assert.deepEqual(filterSettingsTargets(TARGETS, "权限"), []);
});
