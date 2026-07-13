import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";


const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const output = resolve(root, "outputs", "titlebar_frames");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN
    ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const page = await browser.newPage({
  viewport: { width: 900, height: 600 },
  reducedMotion: "no-preference",
});
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 15000 });
const brand = page.locator(".titlebar-brand");
await brand.waitFor({ timeout: 15000 });

const samples = [];
for (const time of [0, 380, 760]) {
  const sample = await brand.evaluate((element, seekTime) => {
    const animations = element.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = seekTime;
    }
    const base = getComputedStyle(element.querySelector(".compass-logo-base"));
    const accent = getComputedStyle(element.querySelector(".compass-logo-accent-reveal"));
    return {
      time_ms: seekTime,
      animation_count: animations.length,
      base_opacity: Number(base.opacity),
      base_transform: base.transform,
      accent_opacity: Number(accent.opacity),
      accent_transform: accent.transform,
    };
  }, time);
  await page.waitForTimeout(40);
  await brand.screenshot({ path: resolve(output, `titlebar_${String(time).padStart(3, "0")}ms.png`) });
  samples.push(sample);
}

await brand.hover();
await page.waitForTimeout(220);
const hoverTransform = await brand.locator(".compass-logo-accent").evaluate(
  (element) => getComputedStyle(element).transform,
);

const reducedPage = await browser.newPage({
  viewport: { width: 900, height: 600 },
  reducedMotion: "reduce",
});
await reducedPage.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 15000 });
const reducedBrand = reducedPage.locator(".titlebar-brand");
await reducedBrand.waitFor({ timeout: 15000 });
const reducedMotion = await reducedBrand.evaluate((element) => ({
  animation_count: element.getAnimations({ subtree: true }).length,
  base_opacity: Number(getComputedStyle(element.querySelector(".compass-logo-base")).opacity),
  accent_opacity: Number(getComputedStyle(element.querySelector(".compass-logo-accent-reveal")).opacity),
}));

const report = { samples, hover_transform: hoverTransform, reduced_motion: reducedMotion };
await writeFile(resolve(root, "outputs", "titlebar_integration_report.json"), JSON.stringify(report, null, 2));
await browser.close();
process.stdout.write(JSON.stringify(report));
