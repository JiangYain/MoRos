import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Skill } from "@earendil-works/pi-coding-agent";
import { SkillCatalog } from "../src/main/skill-catalog.ts";

test("disabled discovered skills retain their source and metadata while staying out of the agent", (t) => {
  const root = mkdtempSync(join(tmpdir(), "moros-skill-catalog-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, "home", ".codex", "skills", "review");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\n");
  const filePath = join(directory, "SKILL.md");
  const skill: Skill = {
    name: "review", description: "Review code.", filePath, baseDir: directory,
    sourceInfo: { path: filePath, source: "local", scope: "temporary", origin: "top-level" },
    disableModelInvocation: true,
  };
  const options = { workspaceDir: join(root, "project"), homeDir: join(root, "home"), env: {} };
  const disabled = new SkillCatalog({ ...options, disabledNames: ["review", "removed-skill"] });
  const diagnostics = [{ type: "warning" as const, message: "fixture warning" }];
  assert.deepEqual(disabled.apply({ skills: [skill], diagnostics }), { skills: [], diagnostics });
  const listed = disabled.list().find((entry) => entry.name === "review");
  assert.equal(listed?.source, "Codex");
  assert.equal(listed?.scope, "user");
  assert.equal(listed?.description, "Review code.");
  assert.equal(listed?.filePath, filePath);
  assert.equal(listed?.enabled, false);
  assert.equal(listed?.manualOnly, true);
  assert.equal(disabled.list().find((entry) => entry.name === "removed-skill")?.enabled, false);

  const enabled = new SkillCatalog({ ...options, disabledNames: [] });
  assert.deepEqual(enabled.apply({ skills: [skill], diagnostics: [] }).skills, [skill]);
  assert.equal(enabled.list()[0].enabled, true);
});

test("Pi loads project winners, reports collisions, and preserves manual-only skills", async (t) => {
  const { loadSkills, formatSkillsForPrompt } = await import("@earendil-works/pi-coding-agent");
  const root = mkdtempSync(join(tmpdir(), "moros-skill-precedence-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspaceDir = join(root, "project");
  const homeDir = join(root, "home");
  const projectSkill = join(workspaceDir, ".claude", "skills", "review");
  const userSkill = join(homeDir, ".codex", "skills", "review");
  for (const directory of [projectSkill, userSkill]) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "SKILL.md"), "---\nname: review\ndescription: Review code.\ndisable-model-invocation: true\n---\n");
  }
  const catalog = new SkillCatalog({ workspaceDir, homeDir, env: {}, disabledNames: [] });
  const loaded = catalog.apply(loadSkills({
    cwd: workspaceDir,
    agentDir: join(homeDir, ".pi", "agent"),
    skillPaths: catalog.paths,
    includeDefaults: false,
  }));
  assert.equal(loaded.skills.length, 1);
  assert.equal(loaded.skills[0].baseDir, projectSkill);
  assert.ok(loaded.diagnostics.some((diagnostic) => diagnostic.type === "collision"));
  assert.equal(catalog.list()[0].source, "Claude Code");
  assert.equal(catalog.list()[0].manualOnly, true);
  assert.equal(formatSkillsForPrompt(loaded.skills), "");
});
