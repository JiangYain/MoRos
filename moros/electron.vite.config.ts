import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function envPort(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return value;
}

const webPort = envPort("MOROS_WEB_PORT", 53210);
const webApiPort = envPort("MOROS_WEB_API_PORT", 53211);
// Vite binds before Electron's main process. Retained browser tabs may reconnect
// immediately, so hold their API requests until the main-process server is ready.
const devApiStartupTimeoutMs = 45_000;

function canConnectToDevApi(): Promise<boolean> {
  return new Promise((resolveConnection) => {
    const socket = createConnection({ host: "127.0.0.1", port: webApiPort });
    let settled = false;
    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveConnection(connected);
    };

    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForDevApi(): Promise<boolean> {
  const deadline = Date.now() + devApiStartupTimeoutMs;
  do {
    if (await canConnectToDevApi()) return true;
    await delay(100);
  } while (Date.now() < deadline);
  return false;
}

let devApiReady = false;
let devApiStartupGate: Promise<boolean> | undefined;

async function ensureDevApiReady(): Promise<boolean> {
  if (devApiReady) return true;
  devApiStartupGate ??= waitForDevApi().then((ready) => {
    devApiReady = ready;
    if (!ready) devApiStartupGate = undefined;
    return ready;
  });
  return devApiStartupGate;
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@shared": resolve("src/shared") },
    },
    build: {
      outDir: "out/main",
      rollupOptions: { output: { format: "es" } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@shared": resolve("src/shared") },
    },
    build: {
      outDir: "out/preload",
      rollupOptions: { output: { format: "cjs" } },
    },
  },
  renderer: {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${webApiPort}`,
          changeOrigin: true,
          bypass: async () => ((await ensureDevApiReady()) ? undefined : false),
          configure: (proxy) => {
            proxy.on("error", (error) => {
              if ((error as NodeJS.ErrnoException).code === "ECONNREFUSED") {
                devApiReady = false;
                devApiStartupGate = undefined;
              }
            });
          },
        },
      },
    },
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@": resolve("src/renderer/src"),
      },
    },
    build: { outDir: "out/renderer" },
  },
});
