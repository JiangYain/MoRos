import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { AgentService } from "./agent";
import { AuthLoginController } from "./auth-login-controller";
import { runPrerequisiteAction } from "./prerequisite-actions";

let mainWindow: BrowserWindow | undefined;
let agent: AgentService | undefined;
let authLoginController: AuthLoginController | undefined;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 400,
    minHeight: 640,
    frame: false,
    backgroundColor: "#FFFFFF",
    show: false,
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

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  // 临时验证钩子：COMPASS_CAPTURE=<输出目录> 时，在若干时间点抓取页面并退出
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

function registerIpc(service: AgentService, authController: AuthLoginController): void {
  ipcMain.handle("app:init", () => service.buildInitPayload());
  ipcMain.handle("runtime:prerequisite-action", async (_event, actionId: string) => {
    await runPrerequisiteAction(actionId, mainWindow);
    return service.buildInitPayload();
  });
  ipcMain.handle("agent:prompt", (_event, text: string) => service.prompt(text));
  ipcMain.handle("agent:abort", () => service.abort());
  ipcMain.handle("agent:new-session", async () => {
    await service.start();
    return service.buildInitPayload();
  });
  ipcMain.handle("agent:open-session", async (_event, path: string) => {
    await service.start({ sessionPath: path });
    return service.buildInitPayload();
  });
  ipcMain.handle("sessions:list", () => service.listSessions());
  ipcMain.handle("models:set", (_event, provider: string, id: string) =>
    service.setModel(provider, id),
  );
  ipcMain.handle("thinking:set", (_event, level) => service.setThinkingLevel(level));
  ipcMain.handle("auth:set-key", async (_event, provider: string, key: string) => {
    await service.setApiKey(provider, key);
    return service.buildInitPayload();
  });
  ipcMain.handle("auth:login-provider", (_event, provider: string) =>
    authController.loginProvider(provider),
  );
  ipcMain.handle("auth:remove", async (_event, provider: string) => {
    service.removeApiKey(provider);
    return service.buildInitPayload();
  });
  ipcMain.handle("skills:set-enabled", async (_event, name: string, enabled: boolean) => {
    await service.setSkillEnabled(name, enabled);
    return service.buildInitPayload();
  });
  ipcMain.handle("skills:add-dir", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择技能目录",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    await service.addSkillDir(result.filePaths[0]);
    return service.buildInitPayload();
  });
  ipcMain.handle("skills:remove-dir", async (_event, dir: string) => {
    await service.removeSkillDir(dir);
    return service.buildInitPayload();
  });
  ipcMain.handle("settings:set-workspace", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择工作目录",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    await service.setWorkspaceDir(result.filePaths[0]);
    return service.buildInitPayload();
  });
  ipcMain.handle("shell:open-path", (_event, path: string) => shell.openPath(path));

  ipcMain.on("win:control", (_event, action: "minimize" | "maximize" | "close") => {
    if (!mainWindow) return;
    if (action === "minimize") mainWindow.minimize();
    else if (action === "maximize") {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else mainWindow.close();
  });
}

app.whenReady().then(async () => {
  agent = new AgentService((event) => {
    mainWindow?.webContents.send("agent:event", event);
  });
  authLoginController = new AuthLoginController(agent, () => mainWindow);
  registerIpc(agent, authLoginController);
  mainWindow = createWindow();

  try {
    await agent.start();
  } catch (error) {
    console.error("Failed to start agent session:", error);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("window-all-closed", () => {
  authLoginController?.abortAll();
  void agent?.shutdown().finally(() => app.quit());
});
