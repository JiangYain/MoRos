import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Optional local handoff probe for an already-running, user-owned Electron
// instance. It opens the panel and captures only that panel, without reading or
// printing the conversation. Closing this CDP socket leaves the app running.
const debugOrigin = process.argv[2] ?? "http://127.0.0.1:48763";
const appOrigin = process.argv[3] ?? "http://127.0.0.1:48761";
const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
const target = targets.find((target) => target.type === "page" && target.url.startsWith(appOrigin));
if (!target) throw new Error("Moros Electron window was not found.");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let next = 0;
const waiting = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (!waiting.has(message.id)) return;
  const { resolve, reject, timer } = waiting.get(message.id); clearTimeout(timer); waiting.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++next, timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} timed out`)); }, 10_000);
  waiting.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
try {
  const opened = await command("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const init = await window.moros.init();
    const scope = { workspaceDir: init.stats.workspaceDir, sessionId: init.stats.sessionId };
    await window.moros.workbench({ scope, operation: "open", resource: { kind: "files" } });
    await window.moros.workbench({ scope, operation: "layout", width: 1000 });
    if (innerWidth < screen.availWidth - 30) window.moros.windowControl("maximize");
    return { desktop: true, streaming: init.stats.isStreaming };
  })()` });
  if (opened.exceptionDetails) throw new Error("The live Electron workbench could not be opened.");
  let bounds, previousBounds;
  for (let i = 0; i < 30; i++) {
    const result = await command("Runtime.evaluate", { returnByValue: true, expression: `(() => { const panel = document.querySelector('.wb-shell:not([hidden])'); if (!panel || !panel.querySelector('.wb-files-home') || !panel.querySelector('.wb-file-tree')) return null; const r=panel.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}; })()` });
    bounds = result.result.value;
    if (bounds?.width > 200 && JSON.stringify(bounds) === previousBounds) break;
    previousBounds = JSON.stringify(bounds);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!bounds?.width) throw new Error("The live workbench did not become visible.");
  const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, clip: bounds });
  const output = join(tmpdir(), "moros-workbench-smoke-output"); await mkdir(output, { recursive: true });
  await writeFile(join(output, "08-live-panel.png"), Buffer.from(screenshot.data, "base64"));
  const response = await fetch(`${appOrigin}/api/rpc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "init", args: [] }) });
  const api = await response.json();
  console.log("LIVE_WORKBENCH_READY", JSON.stringify({ desktop: opened.result.value.desktop, panelWidth: bounds.width, api: api.ok === true, screenshot: "08-live-panel.png" }));
} finally { socket.close(); }
