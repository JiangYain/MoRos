import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export async function runSkillDiscoveryScenario({ app, page, smokeSkillHome }) {
  const globalRow = page.locator(".settings-skill-row").filter({
    has: page.getByText("global-smoke", { exact: true }),
  });
  await globalRow.waitFor();
  assert.match(await globalRow.locator("small").textContent(), /Codex.*User/);
  const before = await page.evaluate(() => window.moros.init());
  const globalSkill = before.skills.find((skill) => skill.name === "global-smoke");
  assert.equal(globalSkill?.enabled, true);
  const initialContext = await page.evaluate(() => window.moros.getDeveloperContext());
  assert.ok(initialContext.effectiveSystemPrompt.includes("<name>global-smoke</name>"));

  const cursorDir = join(smokeSkillHome, ".cursor", "skills", "fresh-smoke");
  mkdirSync(cursorDir, { recursive: true });
  writeFileSync(join(cursorDir, "SKILL.md"), "---\nname: fresh-smoke\ndescription: Added after startup.\n---\n", "utf8");
  const rescan = page.getByRole("button", { name: "Rescan skills", exact: true });
  await rescan.click();
  await page.getByText("fresh-smoke", { exact: true }).waitFor();
  await rescan.waitFor();
  const refreshed = await page.evaluate(() => window.moros.init());
  assert.equal(refreshed.skills.find((skill) => skill.name === "fresh-smoke")?.source, "Cursor");
  assert.equal(refreshed.stats.workspaceDir, before.stats.workspaceDir);
  assert.equal(refreshed.stats.sessionId, before.stats.sessionId);
  assert.deepEqual(refreshed.thread, before.thread);

  await globalRow.getByRole("switch").click();
  await page.waitForFunction(async () => (
    (await window.moros.init()).skills.find((skill) => skill.name === "global-smoke")?.enabled === false
  ));
  const disabled = await page.evaluate(() => window.moros.init());
  const disabledSkill = disabled.skills.find((skill) => skill.name === "global-smoke");
  assert.equal(disabledSkill?.description, globalSkill.description);
  assert.equal(disabledSkill?.filePath, globalSkill.filePath);
  assert.equal(disabledSkill?.source, "Codex");
  const disabledContext = await page.evaluate(() => window.moros.getDeveloperContext());
  assert.ok(!disabledContext.effectiveSystemPrompt.includes("<name>global-smoke</name>"));
  await globalRow.getByRole("switch").click();
  await page.waitForFunction(async () => (
    (await window.moros.init()).skills.find((skill) => skill.name === "global-smoke")?.enabled === true
  ));

  rmSync(cursorDir, { recursive: true });
  await rescan.click();
  await page.getByText("fresh-smoke", { exact: true }).waitFor({ state: "detached" });
  await rescan.waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("agent:event", { kind: "agent-start" });
  });
  await page.waitForFunction(() => document.querySelector('[aria-busy="false"][title="Wait for the running task to finish before rescanning."]')?.disabled === true);
  assert.equal(await rescan.isEnabled(), false);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send("agent:event", { kind: "agent-end" });
  });
}
