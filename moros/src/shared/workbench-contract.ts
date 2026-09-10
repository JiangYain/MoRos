import type { WorkbenchFeedback, WorkbenchRequest, WorkbenchResource, WorkbenchScope } from "./workbench.ts";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid workbench request.");
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 4096): string {
  if (typeof value !== "string" || value.length > max || value.includes("\0")) throw new Error("Invalid workbench string.");
  return value;
}
function nonempty(value: unknown, max = 4096): string {
  const result = string(value, max);
  if (!result.trim()) throw new Error("Invalid empty workbench value.");
  return result;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("Invalid workbench number.");
  return Math.round(value);
}
function strings(value: unknown, max = 200): string[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("Invalid workbench list.");
  return value.map((item) => string(item));
}
function oneOf<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  if (!choices.includes(value as string)) throw new Error("Invalid workbench operation.");
  return value as T[number];
}
export function decodeWorkbenchScope(value: unknown): WorkbenchScope {
  const scope = record(value);
  return { workspaceDir: string(scope.workspaceDir), sessionId: string(scope.sessionId, 200) };
}
function feedbackSource(value: unknown): WorkbenchFeedback["source"] {
  const input = record(value), result: WorkbenchFeedback["source"] = {};
  for (const key of ["url", "title", "selector", "path", "version", "ref"] as const) if (input[key] !== undefined) result[key] = string(input[key]);
  for (const key of ["line", "endLine"] as const) if (input[key] !== undefined) result[key] = integer(input[key], 1, 10_000_000);
  if (input.side !== undefined) result.side = oneOf(input.side, ["left", "right"]);
  if (input.range !== undefined) result.range = oneOf(input.range, ["unstaged", "staged", "branch", "commit", "last-turn"]);
  if (input.rect !== undefined) {
    const rect = record(input.rect);
    result.rect = { x: integer(rect.x, -10_000_000, 10_000_000), y: integer(rect.y, -10_000_000, 10_000_000), width: integer(rect.width, 0, 20_000), height: integer(rect.height, 0, 20_000) };
  }
  if (input.viewport !== undefined) {
    const viewport = record(input.viewport);
    result.viewport = { width: integer(viewport.width, 0, 20_000), height: integer(viewport.height, 0, 20_000), scrollX: integer(viewport.scrollX, -10_000_000, 10_000_000), scrollY: integer(viewport.scrollY, -10_000_000, 10_000_000) };
  }
  return result;
}
export function decodeWorkbenchResource(value: unknown): WorkbenchResource {
  const resource = record(value);
  switch (resource.kind) {
    case "files": return { kind: "files" };
    case "file": return { kind: "file", path: nonempty(resource.path), ...(resource.line !== undefined ? { line: integer(resource.line, 1, 10_000_000) } : {}) };
    case "terminal": return { kind: "terminal", ...(resource.terminalId ? { terminalId: string(resource.terminalId, 200) } : {}), ...(resource.title ? { title: string(resource.title, 200) } : {}) };
    case "browser": return { kind: "browser", url: string(resource.url, 8192) };
    case "review": return { kind: "review", range: oneOf(resource.range, ["unstaged", "staged", "branch", "commit", "last-turn"]), ...(resource.ref ? { ref: string(resource.ref, 1024) } : {}), ...(resource.path ? { path: string(resource.path) } : {}) };
    default: throw new Error("Unknown workbench resource.");
  }
}
export function decodeWorkbenchFeedback(value: unknown): WorkbenchFeedback {
  const entry = record(value);
  const source = feedbackSource(entry.source);
  if (JSON.stringify(source).length > 20_000) throw new Error("Feedback source is too large.");
  const feedback: WorkbenchFeedback = {
    id: nonempty(entry.id, 200), kind: oneOf(entry.kind, ["browser", "review", "file"]),
    comment: string(entry.comment, 20_000), selected: entry.selected !== false,
    createdAt: integer(entry.createdAt, 0, Number.MAX_SAFE_INTEGER), source,
    ...(entry.evidence !== undefined ? { evidence: string(entry.evidence, 40_000) } : {}),
    ...(entry.screenshot !== undefined ? { screenshot: string(entry.screenshot, 6_000_000) } : {}),
  };
  if (feedback.screenshot && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(feedback.screenshot)) throw new Error("Invalid annotation screenshot.");
  return feedback;
}
export function decodeWorkbenchRequest(value: unknown): WorkbenchRequest {
  const request = record(value);
  const scope = decodeWorkbenchScope(request.scope);
  const operation = string(request.operation, 32);
  if (operation === "state" || operation === "pick-file") return { scope, operation };
  if (operation === "directory") return { scope, operation, ...(request.path !== undefined ? { path: string(request.path) } : {}), ...(request.query !== undefined ? { query: string(request.query, 200) } : {}) };
  if (operation === "create-entry") {
    if (typeof request.directory !== "boolean") throw new Error("Invalid entry type.");
    return { scope, operation, path: string(request.path), directory: request.directory };
  }
  if (operation === "open") return { scope, operation, resource: decodeWorkbenchResource(request.resource) };
  if (operation === "layout") {
    const result: Extract<WorkbenchRequest, { operation: "layout" }> = { scope, operation };
    for (const key of ["open", "collapsed"] as const) {
      if (request[key] !== undefined) {
        if (typeof request[key] !== "boolean") throw new Error("Invalid panel state.");
        result[key] = request[key];
      }
    }
    if (request.width !== undefined) result.width = integer(request.width, 280, 1200);
    if (request.activeTabId !== undefined) result.activeTabId = string(request.activeTabId, 200);
    if (request.order !== undefined) result.order = strings(request.order, 40);
    return result;
  }
  if (operation === "feedback") {
    const action = oneOf(request.action, ["add", "update", "remove"]);
    if (action === "add") return { scope, operation, action, feedback: decodeWorkbenchFeedback(request.feedback) };
    const ids = strings(request.ids, 40);
    if (action === "remove") return { scope, operation, action, ids };
    if (request.selected === undefined && request.comment === undefined) throw new Error("Feedback update is empty.");
    if (request.selected !== undefined) {
      if (typeof request.selected !== "boolean") throw new Error("Invalid feedback selection.");
    }
    return { scope, operation, action, ids,
      ...(request.comment !== undefined ? { comment: string(request.comment, 20_000) } : {}),
      ...(request.selected !== undefined ? { selected: request.selected as boolean } : {}),
    };
  }
  const tabId = string(request.tabId, 200);
  if (operation === "close") return { scope, operation, tabId, ...(request.confirmation ? { confirmation: string(request.confirmation, 200) } : {}) };
  if (operation === "file") return { scope, operation, tabId, action: oneOf(request.action, ["read", "open-system"]) };
  if (operation === "terminal") {
    const action = oneOf(request.action, ["read", "input", "resize"]);
    if (action === "input") return { scope, operation, tabId, action, data: string(request.data, 64_000) };
    if (action === "resize") return { scope, operation, tabId, action, cols: integer(request.cols, 2, 500), rows: integer(request.rows, 1, 300) };
    return { scope, operation, tabId, action, ...(request.offset !== undefined ? { offset: integer(request.offset, 0, Number.MAX_SAFE_INTEGER) } : {}) };
  }
  if (operation === "browser") {
    const action = oneOf(request.action, ["navigate", "back", "forward", "reload", "bounds", "inspect", "annotate", "cancel-annotation"]);
    if (action === "navigate") return { scope, operation, tabId, action, url: nonempty(request.url, 8192) };
    if (action === "annotate") return { scope, operation, tabId, action, mode: oneOf(request.mode, ["element", "region"]) };
    if (action === "bounds") {
      const bounds = record(request.bounds);
      if (typeof bounds.visible !== "boolean") throw new Error("Invalid browser visibility.");
      return { scope, operation, tabId, action, bounds: { x: integer(bounds.x, 0, 20000), y: integer(bounds.y, 0, 20000), width: integer(bounds.width, 0, 20000), height: integer(bounds.height, 0, 20000), visible: bounds.visible } };
    }
    return { scope, operation, tabId, action };
  }
  if (operation === "review") {
    const action = oneOf(request.action, ["read", "stage", "unstage", "prepare-revert", "revert"]);
    if (action === "read") return { scope, operation, tabId, action };
    if (action === "revert") return { scope, operation, tabId, action, confirmation: nonempty(request.confirmation, 200) };
    const selection = record(request.selection);
    return { scope, operation, tabId, action, selection: { version: nonempty(selection.version, 200),
        ...(selection.paths !== undefined ? { paths: strings(selection.paths, 2000) } : {}),
        ...(selection.hunkId ? { hunkId: string(selection.hunkId, 200) } : {}) } };
  }
  throw new Error("Unknown workbench operation.");
}
