export async function runBootstrapScenario({ page, shot, runPhase }) {
  await runPhase("bootstrap.set-language-en", () => (
    page.evaluate(() => window.moros.setLanguage("en"))
  ));
  await runPhase("bootstrap.reload-after-language", () => (
    page.reload({ waitUntil: "domcontentloaded" })
  ));
  await runPhase("bootstrap.init-language-en", () => (
    page.waitForFunction(async () => (await window.moros.init()).settings.language === "en")
  ));

  const invalidPath = "__moros_invalid_session__.jsonl";
  const invalidRename = await runPhase("bootstrap.invalid-session.rename", () => (
    page.evaluate(
      ({ path, name }) => window.moros.renameSession(path, name),
      { path: invalidPath, name: "invalid" },
    )
  ));
  const invalidArchive = await runPhase("bootstrap.invalid-session.archive", () => (
    page.evaluate((path) => window.moros.archiveSession(path), invalidPath)
  ));
  const invalidDelete = await runPhase("bootstrap.invalid-session.delete", () => (
    page.evaluate((path) => window.moros.deleteSession(path), invalidPath)
  ));
  if (invalidRename.ok || invalidArchive.ok || invalidDelete.ok) {
    throw new Error("Session mutation accepted an unlisted path");
  }

  await runPhase("bootstrap.settle-before-first-shot", () => page.waitForTimeout(1200));
  await runPhase("bootstrap.first-shot", () => shot("01-hero"));

  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Developer: Current Context" }).click();
  const contextDialog = page.getByRole("dialog", { name: "Current conversation context" });
  await contextDialog.waitFor();
  await contextDialog.getByRole("button", { name: "Effective system prompt" }).click();
  if (!String(await contextDialog.locator("pre").textContent()).includes("Moros working rules")) {
    throw new Error("Developer context viewer did not expose the Moros system prompt");
  }
  await contextDialog.getByRole("button", { name: "Close context viewer" }).click();
  await contextDialog.waitFor({ state: "detached" });
}
