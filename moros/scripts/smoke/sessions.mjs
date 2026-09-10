import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export async function runSessionScenario({ app, page, shot, smokeWorkspaceDir }) {
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  const searchDialog = page.getByRole("dialog", { name: "Search conversations" });
  await searchDialog.waitFor();
  await searchDialog.getByRole("combobox").fill("refactor");
  await page.keyboard.press("Escape");
  await searchDialog.waitFor({ state: "detached" });

  const selectedWorkspace = join(smokeWorkspaceDir, "selected-workspace");
  mkdirSync(selectedWorkspace, { recursive: true });
  const before = await page.evaluate(() => window.moros.init());
  const picker = await app.evaluateHandle(({ dialog }, workspaceDir) => {
    const original = dialog.showOpenDialog;
    const calls = [];
    dialog.showOpenDialog = async (...args) => {
      calls.push(args.at(-1));
      return { canceled: false, filePaths: [workspaceDir] };
    };
    return { calls, restore: () => { dialog.showOpenDialog = original; } };
  }, selectedWorkspace);

  try {
    await page.locator(".file-section-header").getByRole("button", {
      name: "Open workspace", exact: true,
    }).click();
    await page.waitForFunction(async (workspaceDir) => (
      (await window.moros.init()).stats.workspaceDir === workspaceDir
    ), selectedWorkspace);
    const after = await page.evaluate(() => window.moros.init());
    assert.notEqual(after.stats.sessionId, before.stats.sessionId);
    assert.equal(after.settings.workspaceDir, selectedWorkspace);
    const calls = await picker.evaluate((state) => state.calls);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].properties, ["openDirectory"]);
  } finally {
    await picker.evaluate((state) => state.restore());
    await picker.dispose();
  }

  await shot("07-sessions");
}
