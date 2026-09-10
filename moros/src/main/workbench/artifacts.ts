import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, relative, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { workbenchScopeKey, type WorkbenchScope } from "../../shared/workbench.ts";
import { insideDirectory, resolveWorkbenchFile } from "./paths.ts";

const TYPES: Record<string, string> = { ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".pdf": "application/pdf" };
export class WorkbenchArtifacts {
  private readonly grants = new Map<string, { scope: WorkbenchScope; path: string; workspaceRoot: string; assetRoot?: string }>();
  private readonly origin: () => string;
  constructor(origin: () => string) { this.origin = origin; }
  url(scope: WorkbenchScope, path: string, workspaceRoot: string): string {
    const existing = [...this.grants].find(([, grant]) => grant.path === path && workbenchScopeKey(grant.scope) === workbenchScopeKey(scope));
    const token = existing?.[0] ?? randomUUID();
    if (!existing) this.grants.set(token, {
      scope, path, workspaceRoot, assetRoot: insideDirectory(workspaceRoot, path) ? dirname(path) : undefined,
    });
    return `${this.origin()}/api/workbench-artifact/${token}/${encodeURIComponent(basename(path))}`;
  }
  allowed(url: string, scope: WorkbenchScope): boolean {
    if (!url) return false;
    if (new URL(url).origin !== new URL(this.origin()).origin) return false;
    const match = /^\/api\/workbench-artifact\/([^/]+)\//.exec(new URL(url).pathname);
    const grant = match && this.grants.get(match[1]);
    return Boolean(grant && workbenchScopeKey(grant.scope) === workbenchScopeKey(scope));
  }
  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const match = /^\/api\/workbench-artifact\/([^/]+)\/(.+)$/.exec(pathname);
    if (!match) return false;
    const grant = this.grants.get(match[1]);
    if (request.method !== "GET" || !grant) { response.writeHead(404); response.end(); return true; }
    try {
      const path = await resolveWorkbenchFile(grant.assetRoot ?? dirname(grant.path), decodeURIComponent(match[2]));
      // Picking an external file authorizes that file, never its neighbours.
      if (!grant.assetRoot && path !== grant.path) throw new Error("File was not granted.");
      const segments = relative(grant.workspaceRoot, path).split(sep);
      if (segments.some((segment) => segment.startsWith(".") && segment !== "..")) throw new Error("Hidden preview assets are not served.");
      const type = TYPES[extname(path).toLowerCase()];
      if (!type) throw new Error("Unsupported preview asset.");
      if (extname(path).toLowerCase() === ".json" || basename(path).startsWith(".")) throw new Error("Not a static preview asset.");
      if ((await stat(path)).size > 25_000_000) throw new Error("Preview asset is too large.");
      const bytes = await readFile(path);
      if (bytes.length > 25_000_000) throw new Error("Preview asset is too large.");
      response.writeHead(200, {
        "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*",
        "Content-Security-Policy": "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'",
      });
      response.end(bytes);
    } catch { response.writeHead(404); response.end("Preview asset unavailable or outside the allowed directory."); }
    return true;
  }
}
