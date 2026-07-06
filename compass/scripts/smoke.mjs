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

// 1. Hero 完整入场
await page.waitForTimeout(4200);
await shot(page, "01-hero");

// 2. 技能面板
await page.locator(".sidebar-foot-btn").nth(0).click();
await page.waitForTimeout(900);
await shot(page, "02-skills-panel");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 3. 设置面板
await page.locator(".sidebar-foot-btn").nth(1).click();
await page.waitForTimeout(900);
await shot(page, "03-settings-panel");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 4. 斜杠命令菜单
const textarea = page.locator(".composer textarea");
await textarea.click();
await textarea.fill("/");
await page.waitForTimeout(600);
await shot(page, "04-slash-menu");
await textarea.fill("");

// 5. 模型选择器
const modelBtn = page.locator(".picker-btn").first();
if (await modelBtn.count()) {
  await modelBtn.click();
  await page.waitForTimeout(600);
  await shot(page, "05-model-picker");
  await page.keyboard.press("Escape");
}

// 6. 发送一条消息（无 key 时应显示错误提示条）
await textarea.fill("你好，请介绍一下你的功能");
await page.keyboard.press("Enter");
await page.waitForTimeout(1800);
await shot(page, "06-after-send");

await app.close();
console.log("done, outDir=" + outDir);
