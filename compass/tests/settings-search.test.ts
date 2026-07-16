import assert from "node:assert/strict";
import test from "node:test";
import { filterSettingsTargets, type SettingsSearchTarget } from "../src/renderer/src/components/settings-search.ts";

const TARGETS: readonly SettingsSearchTarget[] = [
  {
    sectionId: "general",
    targetId: "settings-language",
    title: "Language",
    description: "Choose the language used by the Compass interface.",
    keywords: "sprache 语言 語言",
  },
  {
    sectionId: "general",
    targetId: "settings-permission",
    title: "Permission mode",
    description: "Choose when Compass asks before performing an action.",
    keywords: "ask approve full 权限",
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
    targetId: "settings-profile-name",
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
    sectionId: "skills",
    targetId: "settings-skill-list",
    title: "Skills",
    description: "Manage local skills and additional skill folders.",
    keywords: "agent 技能",
  },
];

test("empty query matches nothing so search stays out of the way", () => {
  assert.deepEqual(filterSettingsTargets(TARGETS, ""), []);
  assert.deepEqual(filterSettingsTargets(TARGETS, "   "), []);
});

test("matches page names across general, appearance, profile, models, and skills", () => {
  const languageMatches = filterSettingsTargets(TARGETS, "language");
  assert.equal(languageMatches.length, 1);
  assert.equal(languageMatches[0].sectionId, "general");
  assert.equal(languageMatches[0].targetId, "settings-language");

  const themeMatches = filterSettingsTargets(TARGETS, "color theme");
  assert.equal(themeMatches.length, 1);
  assert.equal(themeMatches[0].sectionId, "appearance");

  const profileMatches = filterSettingsTargets(TARGETS, "profile name");
  assert.equal(profileMatches.length, 1);
  assert.equal(profileMatches[0].sectionId, "profile");

  const providerMatches = filterSettingsTargets(TARGETS, "provider");
  assert.equal(providerMatches.length, 1);
  assert.equal(providerMatches[0].sectionId, "models");

  const skillMatches = filterSettingsTargets(TARGETS, "skills");
  assert.equal(skillMatches.length, 1);
  assert.equal(skillMatches[0].sectionId, "skills");
});

test("matches keywords and descriptions, not just titles", () => {
  const keywordMatches = filterSettingsTargets(TARGETS, "权限");
  assert.equal(keywordMatches.length, 1);
  assert.equal(keywordMatches[0].targetId, "settings-permission");

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
  // "compass" appears in the language and permission descriptions; both should
  // match and stay in the order they were declared in TARGETS.
  const matches = filterSettingsTargets(TARGETS, "compass");
  assert.equal(matches.length, 2);
  assert.equal(matches[0].targetId, "settings-language");
  assert.equal(matches[1].targetId, "settings-permission");
});
