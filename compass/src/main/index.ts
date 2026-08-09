import type { AgentUiEvent, CompassBackendApi } from "@shared/types";
import {
  BACKEND_OPERATION_METHODS,
  invokeBackendOperation,
  ipcChannelForBackendMethod,
} from "@shared/transport-contract";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { AgentService } from "./agent";
import { AuthLoginController } from "./auth-login-controller";
import { ClientDatabase } from "./client-database";
import { createCompassBackendApi } from "./compass-api";
import { DependencyManager } from "./dependency-manager";
import {
  observeInitialNavigation,
  shouldShowStartupErrorDialog,
} from "./startup-navigation";
import { startCompassWebServer, type CompassWebServer } from "./web-server";

const DEFAULT_WEB_PORT = 5173;
const DEFAULT_DEV_API_PORT = 4317;

const userDataOverride = process.env.COMPASS_USER_DATA_DIR?.trim();
if (userDataOverride) {
  const userDataPath = resolve(userDataOverride);
  mkdirSync(userDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.compass.desktop");
}

let mainWindow: BrowserWindow | undefined;
let agent: AgentService | undefined;
let authLoginController: AuthLoginController | undefined;
let clientDatabase: ClientDatabase | undefined;
let dependencyManager: DependencyManager | undefined;
let webServer: CompassWebServer | undefined;
let shutdownPromise: Promise<void> | undefined;
const agentEventListeners = new Set<(event: AgentUiEvent) => void>();

function emitAgentEvent(event: AgentUiEvent): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("agent:event", event);
    }
  } catch (error) {
    console.error("Failed to send agent event to the desktop renderer:", error);
  }
  for (const listener of agentEventListeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("Failed to send agent event to a web listener:", error);
    }
  }
}

function subscribeToAgentEvents(listener: (event: AgentUiEvent) => void): () => void {
  agentEventListeners.add(listener);
  return () => agentEventListeners.delete(listener);
}

function envPort(name: string, fallback: number, allowZero = false): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(value) || value < minimum || value > 65_535) {
    throw new Error(`${name} must be an integer between ${minimum} and 65535.`);
  }
  return value;
}

function getAppIconPath(): string | undefined {
  const fileName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const devResources = join(import.meta.dirname, "../../resources", fileName);
  const packagedResources = join(process.resourcesPath, fileName);
  const candidates = app.isPackaged
    ? [packagedResources, devResources]
    : [devResources, packagedResources];
  return candidates.find((candidate) => existsSync(candidate));
}

function openExternal(url: string): void {
  void shell.openExternal(url).catch((error: unknown) => {
    console.error("Failed to open an external URL:", error);
  });
}

function createWindow(rendererUrl: string): BrowserWindow {
  const icon = getAppIconPath();
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 400,
    minHeight: 640,
    frame: false,
    backgroundColor: "#FFFFFF",
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("maximize", () => window.webContents.send("win:maximized", true));
  window.on("unmaximize", () => window.webContents.send("win:maximized", false));
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  // Do not gate backend startup on the first navigation. The renderer may
  // legitimately reload before loadURL settles (the smoke migration does),
  // which Electron reports as ERR_ABORTED even though the window is healthy.
  void observeInitialNavigation(window.loadURL(rendererUrl), (error) => {
    console.error(`Failed to load the Compass renderer at ${rendererUrl}:`, error);
    if (!window.isDestroyed()) window.destroy();
  });

  // Temporary visual verification hook: capture the renderer at a few settled moments.
  if (process.env.COMPASS_CAPTURE) {
    const outDir = process.env.COMPASS_CAPTURE;
    window.webContents.once("did-finish-load", () => {
      const moments = [900, 2600, 5200];
      for (const [index, delay] of moments.entries()) {
        setTimeout(async () => {
          try {
            const image = await window.webContents.capturePage();
            const { writeFileSync } = await import("node:fs");
            writeFileSync(join(outDir, `capture-${index + 1}.png`), image.toPNG());
          } catch (error) {
            console.error("capture failed", error);
          }
          if (index === moments.length - 1) app.quit();
        }, delay);
      }
    });
  }
  return window;
}

function registerIpc(api: CompassBackendApi): void {
  for (const method of BACKEND_OPERATION_METHODS) {
    ipcMain.handle(ipcChannelForBackendMethod(method), (_event, ...args: unknown[]) =>
      invokeBackendOperation(api, method, args),
    );
  }
  ipcMain.on("win:control", (_event, action: "minimize" | "maximize" | "close") => {
    if (!mainWindow) return;
    if (action === "minimize") mainWindow.minimize();
    else if (action === "maximize") {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else mainWindow.close();
  });
}

async function startApplication(): Promise<void> {
  const databasePath = process.env.COMPASS_DATABASE_PATH?.trim()
    || join(app.getPath("userData"), "compass.sqlite3");
  const database = new ClientDatabase(databasePath);
  clientDatabase = database;
  agent = new AgentService(emitAgentEvent, () => database.getRegistry());
  authLoginController = new AuthLoginController(agent, emitAgentEvent);
  dependencyManager = new DependencyManager({
    rootDir: join(app.getPath("userData"), "dependencies"),
    openPath: (path) => shell.openPath(path),
    openExternal: (url) => shell.openExternal(url),
    onProgress: (progress) => emitAgentEvent({ kind: "dependency-install-progress", progress }),
    getExecutablePath: (dependencyId) => agent?.getDependencyExecutablePath(dependencyId),
    setExecutablePath: (dependencyId, path) => agent?.setDependencyExecutablePath(dependencyId, path),
  });
  const backendApi = createCompassBackendApi({
    service: agent,
    authController: authLoginController,
    clientDatabase: database,
    dependencyManager,
    getWindow: () => mainWindow,
    emitEvent: emitAgentEvent,
  });
  registerIpc(backendApi);

  const devRendererUrl = process.env.ELECTRON_RENDERER_URL;
  const development = Boolean(devRendererUrl);
  const serverPort = development
    ? envPort("COMPASS_WEB_API_PORT", DEFAULT_DEV_API_PORT)
    : envPort("COMPASS_WEB_PORT", DEFAULT_WEB_PORT, true);
  webServer = await startCompassWebServer({
    api: backendApi,
    port: serverPort,
    rendererDir: development ? undefined : join(import.meta.dirname, "../renderer"),
    publicUrl: devRendererUrl,
    subscribe: subscribeToAgentEvents,
  });

  const rendererUrl = devRendererUrl ?? webServer.url;
  mainWindow = createWindow(rendererUrl);
  console.log(`[Compass] Web app: ${rendererUrl}`);
  if (development) console.log(`[Compass] Web API: ${webServer.url}`);

  try {
    await agent.start();
  } catch (error) {
    console.error("Failed to start agent session:", error);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(devRendererUrl ?? webServer?.url ?? rendererUrl);
    }
  });
}

function shutdown(): Promise<void> {
  if (!shutdownPromise) {
    authLoginController?.abortAll();
    dependencyManager?.shutdown();
    shutdownPromise = Promise.allSettled([
      agent?.shutdown() ?? Promise.resolve(),
      webServer?.close() ?? Promise.resolve(),
    ]).then(() => {
      clientDatabase?.close();
      clientDatabase = undefined;
    });
  }
  return shutdownPromise;
}

void app
  .whenReady()
  .then(startApplication)
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed to start Compass:", error);
    await shutdown();
    if (shouldShowStartupErrorDialog(process.env)) {
      dialog.showErrorBox("Compass 启动失败", message);
      app.quit();
    } else {
      // Native dialogs are invisible and blocking on headless CI runners.
      app.exit(1);
    }
  });

app.on("before-quit", () => authLoginController?.abortAll());

app.on("window-all-closed", () => {
  void shutdown()
    .catch((error: unknown) => {
      console.error("Failed to shut down Compass cleanly:", error);
    })
    .finally(() => app.quit());
});
