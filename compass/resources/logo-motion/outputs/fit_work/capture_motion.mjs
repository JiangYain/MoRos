import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";


const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const html = resolve(root, "logo_motion.html");
const out = resolve(root, "outputs", "motion_frames");
const times = [0, 240, 430, 600, 760, 912, 1200];
const executablePath = process.env.CHROME_BIN
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({
  viewport: { width: 900, height: 600 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});

const baseUrl = pathToFileURL(html).href;
const frames = [];
for (const time of times) {
  await page.goto(`${baseUrl}?t=${time}`);
  await page.waitForFunction(() => window.__p2mReady === true);
  const path = resolve(out, `frame_${String(time).padStart(6, "0")}ms.png`);
  await page.locator("#logo-root").screenshot({ path });
  frames.push(path);
}

await page.goto(`${baseUrl}?static=1`);
await page.waitForFunction(() => window.__p2mReady === true);
const htmlRender = resolve(root, "html_render.png");
await page.locator("#logo-root").screenshot({ path: htmlRender });

await page.goto(baseUrl);
await page.waitForFunction(() => window.__p2mReady === true);
await page.evaluate(() => {
  for (const animation of document.getAnimations()) {
    try { animation.finish(); } catch { animation.cancel(); }
  }
});
await page.screenshot({ path: resolve(root, "outputs", "showcase.png"), fullPage: true });

const report = {
  html,
  viewport: { width: 900, height: 600, deviceScaleFactor: 2 },
  times_ms: times,
  frames,
  html_render: htmlRender,
};
await writeFile(resolve(root, "outputs", "capture_report.json"), JSON.stringify(report, null, 2));
await browser.close();

process.stdout.write(JSON.stringify(report));
