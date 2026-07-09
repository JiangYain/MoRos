import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { AgentService } from "./agent";
import {
  GIT_FOR_WINDOWS_DOWNLOAD_URL,
  INSTALL_GIT_WITH_WINGET_ACTION_ID,
  OPEN_GIT_DOWNLOAD_ACTION_ID,
  REFRESH_PREREQUISITES_ACTION_ID,
  WINGET_GIT_COMMAND,
} from "./prerequisites";

let mainWindow: BrowserWindow | undefined;
let agent: AgentService | undefined;
const activeAuthLogins = new Map<string, AbortController>();

function abortActiveAuthLogin(provider: string): void {
  const active = activeAuthLogins.get(provider);
  if (active && !active.signal.aborted) {
    active.abort();
  }
}

function abortAllActiveAuthLogins(): void {
  for (const controller of activeAuthLogins.values()) {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  }
  activeAuthLogins.clear();
}

function waitForAuthCancellation(provider: string, signal: AbortSignal): Promise<string> {
  return new Promise((_resolve, reject) => {
    const cancel = (): void => reject(new Error(`Login cancelled for ${provider}`));
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function runPrerequisiteAction(actionId: string): Promise<void> {
  if (actionId === REFRESH_PREREQUISITES_ACTION_ID) return;
  if (actionId === OPEN_GIT_DOWNLOAD_ACTION_ID) {
    await shell.openExternal(GIT_FOR_WINDOWS_DOWNLOAD_URL);
    return;
  }
  if (actionId !== INSTALL_GIT_WITH_WINGET_ACTION_ID) {
    throw new Error(`Unknown prerequisite action: ${actionId}`);
  }
  if (process.platform !== "win32") {
    throw new Error("Git for Windows installer action is only available on Windows.");
  }

  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["打开安装命令", "取消"],
        defaultId: 0,
        cancelId: 1,
        message: "安装 Git for Windows",
        detail: `Compass 将打开 PowerShell 执行：\n${WINGET_GIT_COMMAND}\n\n安装完成后回到 Compass，点击“刷新检测”。`,
      })
    : { response: 0 };
  if (result.response !== 0) return;

  const command = `${WINGET_GIT_COMMAND}; Write-Host ""; Write-Host "Install finished. Return to Compass and click Refresh."`;
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", command],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    },
  );
  child.unref();
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
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

function registerIpc(service: AgentService): void {
  ipcMain.handle("app:init", () => service.buildInitPayload());
  ipcMain.handle("runtime:prerequisite-action", async (_event, actionId: string) => {
    await runPrerequisiteAction(actionId);
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
  ipcMain.handle("auth:login-provider", async (_event, provider: string) => {
    abortActiveAuthLogin(provider);
    const authController = new AbortController();
    activeAuthLogins.set(provider, authController);
    try {
      await service.loginProvider(provider, {
        signal: authController.signal,
        onAuth: (info) => {
          const message = [info.instructions, info.url].filter(Boolean).join("\n");
          mainWindow?.webContents.send("agent:event", {
            kind: "notice",
            tone: "info",
            text: message || `正在打开 ${provider} 登录页面…`,
            ts: Date.now(),
          });
          void shell.openExternal(info.url);
        },
        onDeviceCode: (info) => {
          mainWindow?.webContents.send("agent:event", {
            kind: "notice",
            tone: "info",
            text: `Open ${info.verificationUri}\nCode: ${info.userCode}`,
            ts: Date.now(),
          });
          void shell.openExternal(info.verificationUri);
        },
        onPrompt: async (prompt) => {
          if (prompt.allowEmpty) return "";
          mainWindow?.webContents.send("agent:event", {
            kind: "notice",
            tone: "warn",
            text: `${prompt.message}：当前桌面界面不支持手动输入回调码，请在打开的浏览器中完成本机回调。`,
            ts: Date.now(),
          });
          return "";
        },
        onProgress: (message) => {
          mainWindow?.webContents.send("agent:event", {
            kind: "notice",
            tone: "info",
            text: message,
            ts: Date.now(),
          });
        },
        onManualCodeInput: () => waitForAuthCancellation(provider, authController.signal),
        onSelect: async (prompt) => {
          const selected = prompt.options[0]?.id;
          mainWindow?.webContents.send("agent:event", {
            kind: "notice",
            tone: "info",
            text: selected
              ? `${prompt.message}：已选择 ${prompt.options[0]?.label ?? selected}`
              : `${prompt.message}：没有可用选项。`,
            ts: Date.now(),
          });
          return selected;
        },
      });
      return service.buildInitPayload();
    } finally {
      if (!authController.signal.aborted) {
        authController.abort();
      }
      if (activeAuthLogins.get(provider) === authController) {
        activeAuthLogins.delete(provider);
      }
    }
  });
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
  registerIpc(agent);
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
  abortAllActiveAuthLogins();
  void agent?.shutdown().finally(() => app.quit());
});
