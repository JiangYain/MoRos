import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "5175", 10);
const defaultRoot = fileURLToPath(new URL("./", import.meta.url));
const root = `${resolve(process.env.SITE_ROOT || defaultRoot)}${sep}`;

const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8", "no-cache"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8", "no-cache"]],
  ["/robots.txt", ["robots.txt", "text/plain; charset=utf-8", "public, max-age=3600"]],
  ["/sitemap.xml", ["sitemap.xml", "application/xml; charset=utf-8", "public, max-age=3600"]],
]);

const assetTypes = new Map([
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function resolveAssetRoute(pathname) {
  if (!pathname.startsWith("/assets/")) return null;

  const fileName = pathname.slice("/assets/".length);
  if (!/^[a-z0-9][a-z0-9.-]+$/i.test(fileName)) return null;

  const extension = fileName.slice(fileName.lastIndexOf("."));
  const contentType = assetTypes.get(extension.toLowerCase());
  if (!contentType) return null;

  return [`assets/${fileName}`, contentType, "public, max-age=31536000, immutable"];
}

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self' data:; base-uri 'self'; font-src 'self' data:; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' data:",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const server = createServer(async (request, response) => {
  const method = request.method || "GET";
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

  if (pathname === "/health") {
    response.writeHead(200, {
      ...securityHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ status: "ok", service: "compass4devpost" }));
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { ...securityHeaders, Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const route = routes.get(pathname) || resolveAssetRoute(pathname);
  if (!route) {
    response.writeHead(404, {
      ...securityHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
    return;
  }

  const [fileName, contentType, cacheControl] = route;
  const filePath = `${root}${fileName}`;

  try {
    const fileStat = await stat(filePath);
    const etag = `W/\"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}\"`;

    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, { ...securityHeaders, ETag: etag });
      response.end();
      return;
    }

    response.writeHead(200, {
      ...securityHeaders,
      "Cache-Control": cacheControl,
      "Content-Length": fileStat.size,
      "Content-Type": contentType,
      ETag: etag,
      "Last-Modified": fileStat.mtime.toUTCString(),
    });

    if (method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(500, {
      ...securityHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Internal server error");
  }
});

server.listen(port, host, () => {
  console.log(`compass4devpost listening on http://${host}:${port}`);
});
