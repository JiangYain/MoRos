import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";


const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const htmlUrl = pathToFileURL(resolve(root, "logo_motion.html")).href;
const executablePath = process.env.CHROME_BIN
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const times = [440, 500, 560, 620, 680, 696, 716, 892, 912, 932];

const browser = await chromium.launch({ headless: true, executablePath });
const page = await browser.newPage({
  viewport: { width: 900, height: 600 },
  reducedMotion: "no-preference",
});

async function probe(time) {
  await page.goto(`${htmlUrl}?t=${time}`);
  await page.waitForFunction(() => window.__p2mReady === true);
  return page.locator("#mark-direction").evaluate((element) => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
    return {
      time_ms: Number(new URLSearchParams(location.search).get("t")),
      opacity: Number(style.opacity),
      translate_x: Number(matrix.e.toFixed(4)),
      translate_y: Number(matrix.f.toFixed(4)),
      matrix: style.transform,
    };
  });
}

const samples = [];
for (const time of times) samples.push(await probe(time));
await browser.close();

const firstAction = samples.find((sample) => sample.time_ms === 500);
const localLinearProgress = (500 - 420) / (696 - 420);
const linearAt500 = {
  translate_x: 24 + (5 - 24) * localLinearProgress,
  translate_y: 30 + (-4 - 30) * localLinearProgress,
};
const distance = (a, b) => Math.hypot(a.translate_x - b.translate_x, a.translate_y - b.translate_y);
const sampleAt = (time) => samples.find((sample) => sample.time_ms === time);

const report = {
  probe: "#mark-direction computed transform and opacity",
  samples,
  easing_check_at_500ms: {
    designed_curve: "cubic-bezier(0,0,0.2,1)",
    computed: firstAction,
    linear_reference: linearAt500,
    distance_from_linear_px: Number(distance(firstAction, linearAt500).toFixed(4)),
    verdict: distance(firstAction, linearAt500) > 0.5 ? "non-linear easing applied" : "possible linear fallback",
  },
  handoff_speed_px_per_ms: {
    before_696: Number((distance(sampleAt(680), sampleAt(696)) / 16).toFixed(4)),
    after_696: Number((distance(sampleAt(696), sampleAt(716)) / 20).toFixed(4)),
    before_912: Number((distance(sampleAt(892), sampleAt(912)) / 20).toFixed(4)),
    after_912: Number((distance(sampleAt(912), sampleAt(932)) / 20).toFixed(4)),
  },
  note: "No stroke draw or split-fill handoff is used; ink-delta sweep is not applicable.",
};

await writeFile(resolve(root, "outputs", "motion_probe.json"), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report));
