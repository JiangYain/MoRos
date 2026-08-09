export async function runBootstrapScenario({ page, shot, runPhase }) {
  const migratedClientName = `Migrated Smoke ${Date.now()}`;
  await runPhase("bootstrap.seed-legacy-client", () => page.evaluate(({ key, name }) => {
    localStorage.setItem(key, JSON.stringify({
      clients: [name],
      assignments: {},
      profiles: {
        [name]: {
          name,
          gender: "unspecified",
          age: null,
          contact: "legacy@example.test",
          notes: "legacy migration",
          hearingAidBrands: ["unitron", "oticon", "other", "phonak"],
          createdAt: 10,
          updatedAt: 20,
        },
      },
    }));
  }, { key: "compass.clients.v1", name: migratedClientName }));
  await runPhase("bootstrap.reload-after-legacy-seed", () => (
    page.reload({ waitUntil: "domcontentloaded" })
  ));
  // The renderer removes the legacy key only after the database import
  // commits. Wait for that synchronous signal before starting another init
  // request, otherwise an init begun before the import can return a stale
  // (but internally consistent) pre-migration snapshot.
  await runPhase("bootstrap.wait-for-client-migration", () => page.waitForFunction(
    (key) => localStorage.getItem(key) === null,
    "compass.clients.v1",
  ));
  const migratedBrands = await runPhase("bootstrap.init-after-client-migration", () => page.evaluate(async (name) => {
    const payload = await window.compass.init();
    return Object.values(payload.clientRegistry.profiles)
      .find((profile) => profile.displayName === name)?.hearingAidBrands ?? [];
  }, migratedClientName));
  if (!migratedBrands.includes("unitron") || !migratedBrands.includes("oticon") || !migratedBrands.includes("other")) {
    throw new Error(`Legacy client migration dropped retired brands: ${migratedBrands.join(", ")}`);
  }
  await runPhase("bootstrap.set-language-en", () => (
    page.evaluate(() => window.compass.setLanguage("en"))
  ));
  await runPhase("bootstrap.reload-after-language", () => (
    page.reload({ waitUntil: "domcontentloaded" })
  ));
  await runPhase("bootstrap.init-language-en", () => (
    page.waitForFunction(async () => (await window.compass.init()).settings.language === "en")
  ));

  const invalidPath = "__compass_invalid_session__.jsonl";
  const invalidRename = await runPhase("bootstrap.invalid-session.rename", () => (
    page.evaluate(
      ({ path, name }) => window.compass.renameSession(path, name),
      { path: invalidPath, name: "invalid" },
    )
  ));
  const invalidArchive = await runPhase("bootstrap.invalid-session.archive", () => (
    page.evaluate((path) => window.compass.archiveSession(path), invalidPath)
  ));
  const invalidDelete = await runPhase("bootstrap.invalid-session.delete", () => (
    page.evaluate((path) => window.compass.deleteSession(path), invalidPath)
  ));
  if (invalidRename.ok || invalidArchive.ok || invalidDelete.ok) {
    throw new Error("Session mutation accepted an unlisted path");
  }

  await runPhase("bootstrap.settle-before-first-shot", () => page.waitForTimeout(4200));
  await runPhase("bootstrap.first-shot", () => shot("01-hero"));

  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Developer: Current Context" }).click();
  const contextDialog = page.getByRole("dialog", { name: "Current conversation context" });
  await contextDialog.waitFor();
  await contextDialog.getByRole("button", { name: "Effective system prompt" }).click();
  if (!String(await contextDialog.locator("pre").textContent()).includes("Compass 工作守则")) {
    throw new Error("Developer context viewer did not expose the effective system prompt");
  }
  await contextDialog.getByRole("button", { name: "Close context viewer" }).click();
  await contextDialog.waitFor({ state: "detached" });
}
