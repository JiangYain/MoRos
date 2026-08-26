export async function runSessionScenario({ page, shot }) {
  await page.getByRole("button", { name: "Search", exact: true }).first().click();
  const searchDialog = page.getByRole("dialog", { name: "Search conversations" });
  await searchDialog.waitFor();
  await searchDialog.getByRole("combobox").fill("refactor");
  await page.keyboard.press("Escape");
  await searchDialog.waitFor({ state: "detached" });
  await shot("07-sessions");
}
