import type { AgentUiEvent, MorosBackendApi } from "@shared/types";
import {
  createWebRpcHandlers as createContractRpcHandlers,
  isWebRpcMethod,
  type WebRpcHandlers,
} from "@shared/transport-contract";
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

export interface MorosWebServer {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

interface MorosWebServerOptions {
  api: MorosBackendApi;
  port: number;
  rendererDir?: string;
  publicUrl?: string;
  handleArtifact?(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  subscribe(listener: AgentEventListener): () => void;
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
  handlers: WebRpcHandlers,
): Promise<void> {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const input = (await readJsonBody(request)) as { method?: unknown; args?: unknown };
  if (typeof input.method !== "string" || !Array.isArray(input.args)) {
    throw new Error("RPC requests require a method and args array.");
  }
  if (!isWebRpcMethod(input.method)) {
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

export async function startMorosWebServer(
  options: MorosWebServerOptions,
): Promise<MorosWebServer> {
  const handlers = createContractRpcHandlers(options.api);
  const clients = new Set<ServerResponse>();
  let resolvedPublicUrl = options.publicUrl;

  const server: Server = createServer((request, response) => {
    void (async () => {
      if (request.socket.remoteAddress && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress)) {
        sendJson(response, 403, { ok: false, error: "Moros only accepts loopback requests." });
        return;
      }
      if (await options.handleArtifact?.(request, response)) return;
      if (!requestIsLocal(request)) {
        sendJson(response, 403, { ok: false, error: "Moros only accepts loopback requests." });
        return;
      }

      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.headers.origin && requestUrl.pathname.startsWith("/api/")) {
        const origin = new URL(request.headers.origin);
        const allowedPorts = new Set([String((server.address() as { port: number }).port), ...(resolvedPublicUrl ? [new URL(resolvedPublicUrl).port] : [])]);
        if (!allowedPorts.has(origin.port || (origin.protocol === "https:" ? "443" : "80"))) {
          sendJson(response, 403, { ok: false, error: "This origin cannot control Moros." });
          return;
        }
      }
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
    throw new Error(`Unable to start Moros Web on port ${options.port}: ${detail}`);
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
    throw new Error("Unable to determine the Moros Web server address.");
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
