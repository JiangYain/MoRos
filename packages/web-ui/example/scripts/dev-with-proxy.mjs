import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { resolve, dirname } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "undici";

const PROXY_PORT = Number(process.env.PI_WEB_UI_PROXY_PORT || 45321);
const DEFAULT_UPSTREAM_PROXY_URL = "http://127.0.0.1:7890";
const DEFAULT_VITE_ARGS = ["--port", "4173", "--strictPort"];
let upstreamDispatcher;

function setCorsHeaders(req, res) {
	const requestHeaders = req.headers["access-control-request-headers"];
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD");
	res.setHeader(
		"Access-Control-Allow-Headers",
		typeof requestHeaders === "string" && requestHeaders.length > 0 ? requestHeaders : "*",
	);
	res.setHeader("Access-Control-Expose-Headers", "*");
	res.setHeader("Access-Control-Max-Age", "86400");
}

function shouldSendBody(method) {
	return method !== "GET" && method !== "HEAD";
}

function isPortOpen(host, port, timeoutMs = 350) {
	return new Promise((resolvePromise) => {
		const socket = connect({ host, port });

		const done = (result) => {
			socket.removeAllListeners();
			socket.destroy();
			resolvePromise(result);
		};

		socket.once("connect", () => done(true));
		socket.once("error", () => done(false));
		socket.setTimeout(timeoutMs, () => done(false));
	});
}

const proxyServer = createServer(async (req, res) => {
	try {
		setCorsHeaders(req, res);

		if (req.method === "OPTIONS") {
			res.statusCode = 204;
			res.end();
			return;
		}

		const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
		const target = requestUrl.searchParams.get("url");
		if (!target) {
			res.statusCode = 400;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: "Missing required query parameter: url" }));
			return;
		}

		let targetUrl;
		try {
			targetUrl = new URL(target);
		} catch {
			res.statusCode = 400;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: "Invalid target URL" }));
			return;
		}

		if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
			res.statusCode = 400;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ error: "Only http/https targets are supported" }));
			return;
		}

		const headers = {};
		for (const [key, value] of Object.entries(req.headers)) {
			const lowerKey = key.toLowerCase();
			if (
				lowerKey === "host" ||
				lowerKey === "connection" ||
				lowerKey === "content-length" ||
				lowerKey === "accept-encoding"
			) {
				continue;
			}
			if (value !== undefined) {
				headers[key] = Array.isArray(value) ? value.join(", ") : value;
			}
		}

		const method = (req.method || "GET").toUpperCase();
		const upstreamInit = {
			method,
			headers,
			redirect: "manual",
		};
		if (upstreamDispatcher) {
			upstreamInit.dispatcher = upstreamDispatcher;
		}

		if (shouldSendBody(method)) {
			upstreamInit.body = req;
			upstreamInit.duplex = "half";
		}

		const upstream = await fetch(targetUrl.toString(), upstreamInit);
		res.statusCode = upstream.status;

		for (const [key, value] of upstream.headers.entries()) {
			const lowerKey = key.toLowerCase();
			if (
				lowerKey === "access-control-allow-origin" ||
				lowerKey === "access-control-allow-methods" ||
				lowerKey === "access-control-allow-headers" ||
				lowerKey === "content-encoding" ||
				lowerKey === "content-length" ||
				lowerKey === "transfer-encoding" ||
				lowerKey === "connection"
			) {
				continue;
			}
			res.setHeader(key, value);
		}
		setCorsHeaders(req, res);

		if (!upstream.body) {
			res.end();
			return;
		}
		Readable.fromWeb(upstream.body).pipe(res);
	} catch (error) {
		console.error("[proxy] Request failed:", error);
		res.statusCode = 502;
		res.setHeader("Content-Type", "application/json");
		res.end(
			JSON.stringify({
				error: error instanceof Error ? error.message : String(error),
			}),
		);
	}
});

const scriptDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(scriptDir, "..");
const viteBinCandidates = [
	resolve(exampleDir, "node_modules", "vite", "bin", "vite.js"),
	resolve(exampleDir, "..", "..", "..", "node_modules", "vite", "bin", "vite.js"),
];
const viteBin = viteBinCandidates.find((path) => existsSync(path));

if (!viteBin) {
	console.error("Failed to locate Vite binary.");
	process.exit(1);
}

const viteArgs = process.argv.slice(2);
const finalViteArgs = viteArgs.length > 0 ? viteArgs : DEFAULT_VITE_ARGS;

async function start() {
	let upstreamProxyUrl =
		process.env.PI_WEB_UI_UPSTREAM_PROXY ||
		process.env.HTTPS_PROXY ||
		process.env.HTTP_PROXY ||
		process.env.ALL_PROXY;

	if (!upstreamProxyUrl && (await isPortOpen("127.0.0.1", 7890))) {
		upstreamProxyUrl = DEFAULT_UPSTREAM_PROXY_URL;
	}

	if (upstreamProxyUrl) {
		const useInsecureTls =
			process.env.PI_WEB_UI_PROXY_INSECURE_TLS === "1" ||
			upstreamProxyUrl === DEFAULT_UPSTREAM_PROXY_URL;
		upstreamDispatcher = new ProxyAgent(
			useInsecureTls
				? {
						uri: upstreamProxyUrl,
						requestTls: { rejectUnauthorized: false },
					}
				: upstreamProxyUrl,
		);
		console.log(`[proxy] Upstream proxy enabled: ${upstreamProxyUrl}`);
	}

	await new Promise((resolvePromise, rejectPromise) => {
		proxyServer.once("error", rejectPromise);
		proxyServer.listen(PROXY_PORT, "127.0.0.1", () => {
			proxyServer.off("error", rejectPromise);
			resolvePromise();
		});
	});
	console.log(`[proxy] CORS proxy running at http://localhost:${PROXY_PORT}`);

	const viteProcess = spawn(process.execPath, [viteBin, ...finalViteArgs], {
		cwd: exampleDir,
		stdio: "inherit",
		env: process.env,
	});

	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		proxyServer.close();
		upstreamDispatcher?.close?.();
		if (!viteProcess.killed) {
			viteProcess.kill("SIGTERM");
		}
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	viteProcess.on("exit", (code) => {
		proxyServer.close(() => {
			process.exit(code ?? 0);
		});
	});
}

start().catch((error) => {
	console.error(
		`Failed to start local CORS proxy on port ${PROXY_PORT}:`,
		error instanceof Error ? error.message : String(error),
	);
	process.exit(1);
});
