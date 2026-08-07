import {
  isAppLanguage,
  isCommandExplanationLanguage,
  isDependencyId,
  isPermissionMode,
  isThinkingLevel,
  type AgentUiEvent,
  type CompassBackendApi,
  type UiImageAttachment,
  type WebRpcMethod,
} from "@shared/types";
import { isQuickPromptList } from "@shared/quick-prompts";
import type { ClientProfileDraft } from "@shared/client-registry";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const MAX_RPC_BODY_BYTES = 26_000_000;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

type AgentEventListener = (event: AgentUiEvent) => void;
type RpcHandler = (args: unknown[]) => unknown | Promise<unknown>;
type RpcHandlers = { [K in WebRpcMethod]: RpcHandler };

export interface CompassWebServer {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

interface CompassWebServerOptions {
  api: CompassBackendApi;
  port: number;
  rendererDir?: string;
  publicUrl?: string;
  subscribe(listener: AgentEventListener): () => void;
}

function stringArg(args: unknown[], index: number, label: string): string {
  const value = args[index];
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function booleanArg(args: unknown[], index: number, label: string): boolean {
  const value = args[index];
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function clientProfileArg(args: unknown[], index: number): ClientProfileDraft {
  const value = args[index];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("profile must be an object.");
  }
  return value as ClientProfileDraft;
}

function optionalStringArg(args: unknown[], index: number, label: string): string | undefined {
  const value = args[index];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function dependencyIdArg(args: unknown[], index: number): Parameters<CompassBackendApi["installDependency"]>[0] {
  const value = args[index];
  if (!isDependencyId(value)) throw new Error("Invalid dependency id.");
  return value;
}

function imageAttachmentsArg(args: unknown[], index: number): UiImageAttachment[] | undefined {
  const value = args[index];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new Error("images must be an array of up to 8 items.");
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Invalid image attachment.");
    const image = candidate as Record<string, unknown>;
    if (
      typeof image.data !== "string" ||
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(String(image.mimeType))
    ) {
      throw new Error("Invalid image attachment.");
    }
    return {
      data: image.data,
      mimeType: image.mimeType as UiImageAttachment["mimeType"],
      ...(typeof image.name === "string" ? { name: image.name } : {}),
    };
  });
}

function createRpcHandlers(api: CompassBackendApi): RpcHandlers {
  return {
    init: () => api.init(),
    getDeveloperContext: () => api.getDeveloperContext(),
    prompt: (args) =>
      api.prompt(
        stringArg(args, 0, "text"),
        imageAttachmentsArg(args, 1),
        optionalStringArg(args, 2, "clientMessageId"),
      ),
    abort: () => api.abort(),
    resolveApproval: (args) =>
      api.resolveApproval(
        stringArg(args, 0, "id"),
        booleanArg(args, 1, "allowed"),
      ),
    newSession: () => api.newSession(),
    openSession: (args) => api.openSession(stringArg(args, 0, "path")),
    listSessions: () => api.listSessions(),
    renameSession: (args) =>
      api.renameSession(stringArg(args, 0, "path"), stringArg(args, 1, "name")),
    deleteSession: (args) => api.deleteSession(stringArg(args, 0, "path")),
    archiveSession: (args) => api.archiveSession(stringArg(args, 0, "path")),
    importLegacyClientRegistry: (args) =>
      api.importLegacyClientRegistry(stringArg(args, 0, "serializedRegistry")),
    saveClientProfile: (args) => api.saveClientProfile(clientProfileArg(args, 0)),
    assignSessionClient: (args) =>
      api.assignSessionClient(
        stringArg(args, 0, "sessionId"),
        stringArg(args, 1, "clientName"),
      ),
    unassignSessionClient: (args) =>
      api.unassignSessionClient(stringArg(args, 0, "sessionId")),
    setModel: (args) =>
      api.setModel(stringArg(args, 0, "provider"), stringArg(args, 1, "id")),
    setModelEnabled: (args) =>
      api.setModelEnabled(
        stringArg(args, 0, "provider"),
        stringArg(args, 1, "id"),
        booleanArg(args, 2, "enabled"),
      ),
    setSummaryModel: (args) =>
      api.setSummaryModel(stringArg(args, 0, "provider"), stringArg(args, 1, "id")),
    setThinkingLevel: (args) => {
      const level = args[0];
      if (!isThinkingLevel(level)) throw new Error("Invalid thinking level.");
      return api.setThinkingLevel(level);
    },
    setPermissionMode: (args) => {
      const mode = args[0];
      if (!isPermissionMode(mode)) throw new Error("Invalid permission mode.");
      return api.setPermissionMode(mode);
    },
    setLanguage: (args) => {
      const language = args[0];
      if (!isAppLanguage(language)) throw new Error("Invalid application language.");
      return api.setLanguage(language);
    },
    setCommandExplanationLanguage: (args) => {
      const language = args[0];
      if (!isCommandExplanationLanguage(language)) {
        throw new Error("Invalid command explanation language.");
      }
      return api.setCommandExplanationLanguage(language);
    },
    setQuickPrompts: (args) => {
      const prompts = args[0];
      if (prompts !== null && !isQuickPromptList(prompts)) {
        throw new Error("Quick prompts must contain between 1 and 5 non-empty items.");
      }
      return api.setQuickPrompts(prompts);
    },
    setApiKey: (args) =>
      api.setApiKey(stringArg(args, 0, "provider"), stringArg(args, 1, "key")),
    loginProvider: (args) => api.loginProvider(stringArg(args, 0, "provider")),
    removeApiKey: (args) => api.removeApiKey(stringArg(args, 0, "provider")),
    runPrerequisiteAction: (args) =>
      api.runPrerequisiteAction(stringArg(args, 0, "actionId")),
    refreshDependencies: () => api.refreshDependencies(),
    installDependency: (args) =>
      api.installDependency(
        dependencyIdArg(args, 0),
        optionalStringArg(args, 1, "sessionId"),
      ),
    cancelDependencyInstall: (args) =>
      api.cancelDependencyInstall(dependencyIdArg(args, 0)),
    openDependencySource: (args) =>
      api.openDependencySource(dependencyIdArg(args, 0)),
    selectDependencyExecutable: (args) =>
      api.selectDependencyExecutable(
        dependencyIdArg(args, 0),
        optionalStringArg(args, 1, "path"),
      ),
    resetDependencyExecutable: (args) =>
      api.resetDependencyExecutable(dependencyIdArg(args, 0)),
    setSkillEnabled: (args) =>
      api.setSkillEnabled(stringArg(args, 0, "name"), booleanArg(args, 1, "enabled")),
    addSkillDir: () => api.addSkillDir(),
    removeSkillDir: (args) => api.removeSkillDir(stringArg(args, 0, "dir")),
    setWorkspaceDir: () => api.setWorkspaceDir(),
    openPath: (args) => api.openPath(stringArg(args, 0, "path")),
  };
}

function isRpcMethod(method: string, handlers: RpcHandlers): method is WebRpcMethod {
  return Object.prototype.hasOwnProperty.call(handlers, method);
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  setSecurityHeaders(response);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": body.length,
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(body);
}

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(`http://${hostHeader}`).hostname);
  } catch {
    return false;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      LOOPBACK_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function requestIsLocal(request: IncomingMessage): boolean {
  if (!isLoopbackHost(request.headers.host)) return false;
  const origin = request.headers.origin;
  return !origin || isLoopbackOrigin(origin);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_RPC_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body || "{}");
}

async function handleRpc(
  request: IncomingMessage,
  response: ServerResponse,
  handlers: RpcHandlers,
): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const input = (await readJsonBody(request)) as { method?: unknown; args?: unknown };
  if (typeof input.method !== "string" || !Array.isArray(input.args)) {
    throw new Error("RPC requests require a method and args array.");
  }
  if (!isRpcMethod(input.method, handlers)) {
    throw new Error(`Unknown RPC method: ${input.method}`);
  }
  const handler = handlers[input.method];

  const result = await handler(input.args);
  sendJson(response, 200, { ok: true, result: result ?? null });
}

function createSseConnection(response: ServerResponse, clients: Set<ServerResponse>): void {
  setSecurityHeaders(response);
  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
  });
  response.write(": connected\n\n");
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function serveRenderer(
  request: IncomingMessage,
  response: ServerResponse,
  rendererDir: string,
  pathname: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(response, 400, { ok: false, error: "Invalid URL." });
    return;
  }

  const root = resolve(rendererDir);
  const relativePath = decodedPath.replace(/^\/+/, "") || "index.html";
  let filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendJson(response, 403, { ok: false, error: "Forbidden." });
    return;
  }

  let isFallback = false;
  if (!(await fileExists(filePath))) {
    if (relativePath.startsWith("assets/") || extname(relativePath)) {
      sendJson(response, 404, { ok: false, error: "Not found." });
      return;
    }
    filePath = resolve(root, "index.html");
    isFallback = true;
  }
  if (!(await fileExists(filePath))) {
    sendJson(response, 404, { ok: false, error: "Web build not found. Run npm run build." });
    return;
  }

  const content = await readFile(filePath);
  const contentType = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  setSecurityHeaders(response);
  response.writeHead(200, {
    "Cache-Control":
      !isFallback && relativePath.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    "Content-Length": content.length,
    "Content-Type": contentType,
  });
  response.end(request.method === "HEAD" ? undefined : content);
}

export async function startCompassWebServer(
  options: CompassWebServerOptions,
): Promise<CompassWebServer> {
  const handlers = createRpcHandlers(options.api);
  const clients = new Set<ServerResponse>();
  let resolvedPublicUrl = options.publicUrl;

  const server: Server = createServer((request, response) => {
    void (async () => {
      if (!requestIsLocal(request)) {
        sendJson(response, 403, { ok: false, error: "Compass only accepts loopback requests." });
        return;
      }

      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, webUrl: resolvedPublicUrl });
        return;
      }
      if (requestUrl.pathname === "/api/events") {
        if (request.method !== "GET") {
          sendJson(response, 405, { ok: false, error: "Method not allowed." });
          return;
        }
        createSseConnection(response, clients);
        return;
      }
      if (requestUrl.pathname === "/api/rpc") {
        await handleRpc(request, response, handlers);
        return;
      }
      if (requestUrl.pathname.startsWith("/api/")) {
        sendJson(response, 404, { ok: false, error: "Not found." });
        return;
      }
      if (!options.rendererDir) {
        sendJson(response, 404, { ok: false, error: "Use the Vite renderer URL in development." });
        return;
      }
      await serveRenderer(request, response, options.rendererDir, requestUrl.pathname);
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { ok: false, error: message });
    });
  });

  const unsubscribe = options.subscribe((event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      try {
        client.write(": heartbeat\n\n");
      } catch {
        clients.delete(client);
      }
    }
  }, 20_000);
  heartbeat.unref();

  try {
    await new Promise<void>((resolveStarted, rejectStarted) => {
      const onError = (error: Error): void => rejectStarted(error);
      server.once("error", onError);
      server.listen(options.port, "127.0.0.1", () => {
        server.off("error", onError);
        resolveStarted();
      });
    });
  } catch (error) {
    unsubscribe();
    clearInterval(heartbeat);
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to start Compass Web on port ${options.port}: ${detail}`);
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
    throw new Error("Unable to determine the Compass Web server address.");
  }
  const url = `http://127.0.0.1:${address.port}`;
  resolvedPublicUrl ??= url;

  return {
    port: address.port,
    url,
    close: async () => {
      unsubscribe();
      clearInterval(heartbeat);
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>((resolveClosed, rejectClosed) => {
        server.close((error) => (error ? rejectClosed(error) : resolveClosed()));
      });
    },
  };
}
