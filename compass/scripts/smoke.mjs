/**
 * UI smoke test: drive the built Electron app with Playwright,
 * click through panels / composer, and save screenshots for review.
 *
 * Usage: node scripts/smoke.mjs [outDir]
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";

const outDir = resolve(process.argv[2] ?? "smoke-out");
mkdirSync(outDir, { recursive: true });

const shot = async (page, name) => {
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`shot: ${name}`);
};

const app = await electron.launch({
  args: ["out/main/index.js"],
  cwd: resolve(import.meta.dirname, ".."),
});

const page = await app.firstWindow();
await page.setViewportSize({ width: 1320, height: 880 });

// Session mutations must reject paths that were not returned by SessionManager.list().
const invalidSessionResults = await page.evaluate(async () => {
  const invalidPath = "__compass_invalid_session__.jsonl";
  return Promise.all([
    window.compass.renameSession(invalidPath, "invalid"),
    window.compass.archiveSession(invalidPath),
    window.compass.deleteSession(invalidPath),
  ]);
});
if (invalidSessionResults.some((result) => result.ok)) {
  throw new Error("Session mutation accepted an unlisted path");
}

// 1. Hero 完整入场
await page.waitForTimeout(4200);
await shot(page, "01-hero");

// 2. 账户菜单
await page.locator(".user-profile").click();
await page.waitForTimeout(500);
await shot(page, "02-profile-menu");

// 3. 技能面板
await page.locator(".profile-menu button").filter({ hasText: "技能库" }).click();
await page.waitForTimeout(900);
await shot(page, "03-skills-panel");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 4. 设置面板
await page.locator(".user-profile").click();
await page.locator(".profile-menu button").filter({ hasText: "设置" }).click();
await page.waitForTimeout(900);
await shot(page, "04-settings-panel");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 5. 斜杠命令菜单
const textarea = page.locator(".composer textarea");
await textarea.click();
await textarea.fill("/");
await page.waitForTimeout(600);
await shot(page, "05-slash-menu");
await textarea.fill("");

// 6. 模型与思考深度选择器
const modelBtn = page.locator(".model-pill");
if (await modelBtn.count()) {
  await modelBtn.click();
  await page.waitForTimeout(600);

  const initPayload = await page.evaluate(() => window.compass.init());
  const supportedLevels = initPayload.stats.model?.thinkingLevels ?? [];
  const expectedLevels = supportedLevels.some((level) => level !== "off") ? supportedLevels : [];
  const renderedLevels = await page
    .locator(".thinking-options button")
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.thinkingLevel));
  if (JSON.stringify(renderedLevels) !== JSON.stringify(expectedLevels)) {
    throw new Error(
      `Thinking level options do not match the active model: expected ${expectedLevels.join(", ")}, got ${renderedLevels.join(", ")}`,
    );
  }

  await shot(page, "06-model-picker");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

// 7. 上下文详情
await page.locator(".context-trigger").click();
await page.waitForTimeout(500);
await shot(page, "07-context-panel");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 8. 更多操作菜单
await page.locator('.composer-icon-btn[aria-label="更多操作"]').click();
await page.waitForTimeout(400);
await shot(page, "08-action-menu");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// 9. 侧栏真实搜索
await page.locator(".sidebar-nav-item").filter({ hasText: "搜索" }).click();
const sidebarSearch = page.locator(".sidebar-search input");
await sidebarSearch.fill("phonak");
await page.waitForTimeout(400);
await shot(page, "09-sidebar-search");

// 10. 会话菜单（CI 的新环境可能暂无会话）
await sidebarSearch.fill("");
const firstSession = page.locator(".thread-file-item").first();
if (await firstSession.count()) {
  await firstSession.click({ button: "right" });
  await page.waitForTimeout(250);
  const sessionActions = await page
    .locator(".context-menu button")
    .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));
  const expectedActions = ["重命名", "归档", "删除", "复制 Session ID"];
  if (JSON.stringify(sessionActions) !== JSON.stringify(expectedActions)) {
    throw new Error(
      `Session actions do not match: expected ${expectedActions.join(", ")}, got ${sessionActions.join(", ")}`,
    );
  }
  await shot(page, "10-session-menu");
  await page.keyboard.press("Escape");
}

// 11. 窄窗口侧栏抽屉
await page.setViewportSize({ width: 600, height: 880 });
await page.waitForTimeout(400);
await page.locator(".sidebar-toggle").click();
await page.waitForTimeout(400);
await shot(page, "11-mobile-sidebar");

await app.close();
console.log("done, outDir=" + outDir);
