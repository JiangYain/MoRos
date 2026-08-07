import type {
  AgentUiEvent,
  CommandExplanationLanguage,
  CompassBackendApi,
  DependencyId,
  PermissionMode,
  ThinkingLevel,
  UiImageAttachment,
} from "@shared/types";
import type { ClientProfileDraft } from "@shared/client-registry";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { AgentService } from "./agent";
import { AuthLoginController } from "./auth-login-controller";
import { ClientDatabase } from "./client-database";
import { createCompassBackendApi } from "./compass-api";
import { DependencyManager } from "./dependency-manager";
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
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void window.loadURL(rendererUrl);

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
  ipcMain.handle("app:init", () => api.init());
  ipcMain.handle("developer:context", () => api.getDeveloperContext());
  ipcMain.handle("runtime:prerequisite-action", (_event, actionId: string) =>
    api.runPrerequisiteAction(actionId),
  );
  ipcMain.handle("dependencies:refresh", () => api.refreshDependencies());
  ipcMain.handle(
    "dependencies:install",
    (_event, dependencyId: DependencyId, sessionId?: string) =>
      api.installDependency(dependencyId, sessionId),
  );
  ipcMain.handle("dependencies:cancel", (_event, dependencyId: DependencyId) =>
    api.cancelDependencyInstall(dependencyId),
  );
  ipcMain.handle("dependencies:open-source", (_event, dependencyId: DependencyId) =>
    api.openDependencySource(dependencyId),
  );
  ipcMain.handle("dependencies:select-executable", (_event, dependencyId: DependencyId, path?: string) =>
    api.selectDependencyExecutable(dependencyId, path),
  );
  ipcMain.handle("dependencies:reset-executable", (_event, dependencyId: DependencyId) =>
    api.resetDependencyExecutable(dependencyId),
  );
  ipcMain.handle(
    "agent:prompt",
    (_event, text: string, images?: UiImageAttachment[], clientMessageId?: string) =>
      api.prompt(text, images, clientMessageId),
  );
  ipcMain.handle("agent:abort", () => api.abort());
  ipcMain.handle("agent:resolve-approval", (_event, id: string, allowed: boolean) =>
    api.resolveApproval(id, allowed),
  );
  ipcMain.handle("agent:new-session", () => api.newSession());
  ipcMain.handle("agent:open-session", (_event, path: string) => api.openSession(path));
  ipcMain.handle("sessions:list", () => api.listSessions());
  ipcMain.handle("sessions:rename", (_event, path: string, name: string) =>
    api.renameSession(path, name),
  );
  ipcMain.handle("sessions:delete", (_event, path: string) => api.deleteSession(path));
  ipcMain.handle("sessions:archive", (_event, path: string) => api.archiveSession(path));
  ipcMain.handle("clients:import-legacy", (_event, serializedRegistry: string) =>
    api.importLegacyClientRegistry(serializedRegistry),
  );
  ipcMain.handle("clients:save-profile", (_event, profile: ClientProfileDraft) =>
    api.saveClientProfile(profile),
  );
  ipcMain.handle("clients:assign-session", (_event, sessionId: string, clientName: string) =>
    api.assignSessionClient(sessionId, clientName),
  );
  ipcMain.handle("clients:unassign-session", (_event, sessionId: string) =>
    api.unassignSessionClient(sessionId),
  );
  ipcMain.handle("models:set", (_event, provider: string, id: string) =>
    api.setModel(provider, id),
  );
  ipcMain.handle(
    "models:set-enabled",
    (_event, provider: string, id: string, enabled: boolean) =>
      api.setModelEnabled(provider, id, enabled),
  );
  ipcMain.handle("models:set-summary", (_event, provider: string, id: string) =>
    api.setSummaryModel(provider, id),
  );
  ipcMain.handle("thinking:set", (_event, level: ThinkingLevel) =>
    api.setThinkingLevel(level),
  );
  ipcMain.handle("permissions:set", (_event, mode: PermissionMode) =>
    api.setPermissionMode(mode),
  );
  ipcMain.handle("settings:set-language", (_event, language) => api.setLanguage(language));
  ipcMain.handle(
    "settings:set-command-explanation-language",
    (_event, language: CommandExplanationLanguage) =>
      api.setCommandExplanationLanguage(language),
  );
  ipcMain.handle("settings:set-quick-prompts", (_event, prompts) =>
    api.setQuickPrompts(prompts),
  );
  ipcMain.handle("auth:set-key", (_event, provider: string, key: string) =>
    api.setApiKey(provider, key),
  );
  ipcMain.handle("auth:login-provider", (_event, provider: string) =>
    api.loginProvider(provider),
  );
  ipcMain.handle("auth:remove", (_event, provider: string) => api.removeApiKey(provider));
  ipcMain.handle("skills:set-enabled", (_event, name: string, enabled: boolean) =>
    api.setSkillEnabled(name, enabled),
  );
  ipcMain.handle("skills:add-dir", () => api.addSkillDir());
  ipcMain.handle("skills:remove-dir", (_event, dir: string) => api.removeSkillDir(dir));
  ipcMain.handle("settings:set-workspace", () => api.setWorkspaceDir());
  ipcMain.handle("shell:open-path", (_event, path: string) => api.openPath(path));
  ipcMain.handle("voice:start-dictation", () => api.startDictation());

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
    dialog.showErrorBox("Compass 启动失败", message);
    app.quit();
  });

app.on("before-quit", () => authLoginController?.abortAll());

app.on("window-all-closed", () => {
  void shutdown().finally(() => app.quit());
});
