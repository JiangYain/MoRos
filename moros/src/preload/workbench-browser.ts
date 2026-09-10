/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { ipcRenderer } from "electron";

let mode: "element" | "region" | undefined;
let start: { x: number; y: number } | undefined;
let highlight: HTMLDivElement | undefined;
let suppressClick = false;

function clear(): void { mode = undefined; start = undefined; highlight?.remove(); highlight = undefined; }
function box(rect: { x: number; y: number; width: number; height: number }): void {
  if (!highlight) {
    highlight = document.createElement("div");
    highlight.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #c74634;background:rgba(199,70,52,.07);box-sizing:border-box;";
    document.documentElement.append(highlight);
  }
  Object.assign(highlight.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
}
function selectorFor(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const testId = element.getAttribute("data-testid");
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
  const parts: string[] = [];
  let node: Element | null = element;
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    let part = node.tagName.toLowerCase();
    const siblings = node.parentElement ? [...node.parentElement.children].filter((child) => child.tagName === node!.tagName) : [];
    if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
    parts.unshift(part);
    if (node.tagName === "BODY") break;
  }
  return parts.join(" > ");
}
function finish(rect: { x: number; y: number; width: number; height: number }, element?: Element): void {
  // DOMRect coordinates are prototype getters and do not survive IPC cloning.
  const payload = { mode, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, selector: element ? selectorFor(element) : undefined,
    evidence: element instanceof HTMLElement ? element.innerText.slice(0, 4000) : "",
    viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY } };
  clear();
  ipcRenderer.send("workbench:annotation", payload);
}
ipcRenderer.on("workbench:annotation-mode", (_event, next: "element" | "region" | null) => { clear(); mode = next ?? undefined; });
document.addEventListener("pointermove", (event) => {
  if (!mode || !event.isTrusted) return;
  if (mode === "region" && start) box({ x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY), width: Math.abs(event.clientX - start.x), height: Math.abs(event.clientY - start.y) });
  if (mode === "element" && event.target instanceof Element) box(event.target.getBoundingClientRect());
}, true);
document.addEventListener("pointerdown", (event) => {
  if (!mode || !event.isTrusted || event.button !== 0) return;
  event.preventDefault(); event.stopImmediatePropagation();
  suppressClick = true;
  if (mode === "region") start = { x: event.clientX, y: event.clientY };
}, true);
document.addEventListener("pointerup", (event) => {
  if (!mode || !event.isTrusted || event.button !== 0) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (mode === "region" && start) finish({ x: Math.min(start.x, event.clientX), y: Math.min(start.y, event.clientY), width: Math.max(2, Math.abs(event.clientX - start.x)), height: Math.max(2, Math.abs(event.clientY - start.y)) });
  else if (mode === "element" && event.target instanceof Element) finish(event.target.getBoundingClientRect(), event.target);
}, true);
document.addEventListener("click", (event) => { if (mode || suppressClick) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); } }, true);
document.addEventListener("keydown", (event) => {
  if (mode && event.key === "Escape") { clear(); ipcRenderer.send("workbench:annotation-cancel"); event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
