import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test, { type TestContext } from "node:test";
import { discoverSkillDirs, discoverSkillSources } from "../src/main/skills.ts";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "moros-skill-discovery-"));
  const homeDir = join(root, "home");
  const workspaceDir = join(root, "project");
  mkdirSync(homeDir);
  mkdirSync(workspaceDir);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, homeDir, workspaceDir, env: {} };
}

function writeSkill(root: string, path: string): string {
  const directory = join(root, path);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\n", "utf8");
  return directory;
}

test("discovers a Claude Code skill from the active workspace", (t) => {
  const workspace = mkdtempSync(join(tmpdir(), "moros-skill-discovery-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const skillDir = join(workspace, ".claude", "skills", "review");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: review\ndescription: Review code.\n---\n", "utf8");

  const discovered = discoverSkillDirs(workspace).map((dir) => relative(workspace, dir).replaceAll("\\", "/"));
  assert.deepEqual(discovered, [".claude/skills/review"]);
});

test("automatically discovers project and user skills from supported harnesses", (t) => {
  const options = fixture(t);
  for (const folder of [".moros", ".agents", ".codex", ".claude", ".cursor", ".opencode", ".pi"]) {
    writeSkill(options.workspaceDir, `${folder}/skills/project-skill`);
  }
  for (const folder of [".moros", ".agents", ".codex", ".claude", ".cursor", ".config/opencode", ".pi/agent"]) {
    writeSkill(options.homeDir, `${folder}/skills/user-skill`);
  }
  const sources = discoverSkillSources(options);
  assert.equal(sources.length, 14);
  assert.deepEqual(sources.slice(0, 7).map((source) => source.scope), Array(7).fill("project"));
  assert.deepEqual(sources.slice(7).map((source) => source.scope), Array(7).fill("user"));
  assert.equal(sources.find((source) => source.directory.includes(".codex"))?.source, "Codex");
});

test("keeps project, explicit directory, and user discovery precedence stable", (t) => {
  const options = fixture(t);
  const project = writeSkill(options.workspaceDir, ".agents/skills/review");
  const custom = writeSkill(options.root, "extra/review");
  const user = writeSkill(options.homeDir, ".agents/skills/review");
  const sources = discoverSkillSources({ ...options, additionalDirs: [join(options.root, "extra")] });
  assert.deepEqual(sources.map((source) => source.directory), [project, custom, user]);
});

test("finds ancestor skills only up to the repository root", (t) => {
  const options = fixture(t);
  const rootSkill = writeSkill(options.workspaceDir, ".claude/skills/root-review");
  writeFileSync(join(options.workspaceDir, ".git"), "gitdir: test-worktree\n");
  writeSkill(options.root, ".claude/skills/unrelated");
  const nestedDir = join(options.workspaceDir, "packages", "app");
  const localSkill = writeSkill(nestedDir, ".cursor/skills/local-review");
  const sources = discoverSkillSources({ ...options, workspaceDir: nestedDir });
  assert.deepEqual(sources.map((source) => source.directory), [localSkill, rootSkill]);
});

test("honors harness config home overrides without scanning their old locations", (t) => {
  const options = fixture(t);
  writeSkill(options.homeDir, ".codex/skills/old-codex");
  const codex = writeSkill(options.root, "codex-config/skills/review");
  const claude = writeSkill(options.root, "claude-config/skills/review");
  const opencode = writeSkill(options.root, "xdg/opencode/skills/review");
  const sources = discoverSkillSources({
    ...options,
    env: {
      CODEX_HOME: join(options.root, "codex-config"),
      CLAUDE_CONFIG_DIR: join(options.root, "claude-config"),
      XDG_CONFIG_HOME: join(options.root, "xdg"),
    },
  });
  assert.deepEqual(sources.map((source) => source.directory), [codex, claude, opencode]);
});

test("follows linked skill directories once and stops symlink cycles", (t) => {
  const options = fixture(t);
  const actual = writeSkill(options.homeDir, ".agents/skills/shared");
  const codexRoot = join(options.homeDir, ".codex", "skills");
  mkdirSync(codexRoot, { recursive: true });
  const linkType = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(actual, join(codexRoot, "alias"), linkType);
  symlinkSync(codexRoot, join(codexRoot, "cycle"), linkType);
  assert.deepEqual(discoverSkillSources(options).map((source) => source.directory), [actual]);
});

test("includes Codex system skills and explicit child bundles but excludes plugin caches and dependencies", (t) => {
  const options = fixture(t);
  const system = writeSkill(options.homeDir, ".codex/skills/.system/creator");
  const bundle = writeSkill(options.homeDir, ".codex/skills/video");
  const child = writeSkill(bundle, "skills/math");
  writeSkill(bundle, "references/example");
  writeSkill(options.workspaceDir, ".codex/plugins/cache/old-version/skills/review");
  writeSkill(options.workspaceDir, "node_modules/package/skills/review");
  assert.deepEqual(discoverSkillSources(options).map((source) => source.directory), [system, bundle, child]);
});

test("rescanning reflects skills added and removed after startup", (t) => {
  const options = fixture(t);
  assert.deepEqual(discoverSkillSources(options), []);
  const skill = writeSkill(options.homeDir, ".cursor/skills/review");
  assert.equal(discoverSkillSources(options).length, 1);
  rmSync(skill, { recursive: true });
  assert.deepEqual(discoverSkillSources(options), []);
});

test("keeps loose workspace skills and the existing depth limit", (t) => {
  const options = fixture(t);
  const loose = writeSkill(options.workspaceDir, "tools/review");
  writeSkill(options.workspaceDir, "one/two/three/four/review");
  assert.deepEqual(discoverSkillDirs(options.workspaceDir), [loose]);
});

test("does not mistake a skill named build for generated output", (t) => {
  const options = fixture(t);
  const skill = writeSkill(options.homeDir, ".codex/skills/build");
  assert.deepEqual(discoverSkillSources(options).map((source) => source.directory), [skill]);
});
