import type {
  AgentUiEvent,
  CompassBackendApi,
  InitPayload,
  VoiceInputResult,
} from "@shared/types";
import { dialog, shell, type BrowserWindow, type OpenDialogOptions } from "electron";
import { spawn } from "node:child_process";
import type { AgentService } from "./agent";
import type { AuthLoginController } from "./auth-login-controller";
import { runPrerequisiteAction } from "./prerequisite-actions";

interface CompassBackendOptions {
  service: AgentService;
  authController: AuthLoginController;
  getWindow: () => BrowserWindow | undefined;
  emitEvent: (event: AgentUiEvent) => void;
}

function windowsDictationScript(windowHandle: string): string {
  return `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CompassVoiceInput {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr windowHandle);

  [DllImport("user32.dll")]
  public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);
}
"@

[long]$windowHandle = ${windowHandle}
[void][CompassVoiceInput]::SetForegroundWindow([IntPtr]$windowHandle)
Start-Sleep -Milliseconds 80
[CompassVoiceInput]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
[CompassVoiceInput]::keybd_event(0x48, 0, 0, [UIntPtr]::Zero)
[CompassVoiceInput]::keybd_event(0x48, 0, 2, [UIntPtr]::Zero)
[CompassVoiceInput]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
`;
}

function startWindowsDictation(ownerWindow?: BrowserWindow): Promise<VoiceInputResult> {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "语音输入目前仅支持 Windows。" });
  }
  if (!ownerWindow || ownerWindow.isDestroyed()) {
    return Promise.resolve({ ok: false, error: "Compass 主窗口不可用。" });
  }

  ownerWindow.restore();
  ownerWindow.focus();
  ownerWindow.webContents.focus();
  const handleBuffer = ownerWindow.getNativeWindowHandle();
  const windowHandle =
    handleBuffer.length >= 8
      ? handleBuffer.readBigUInt64LE(0).toString()
      : handleBuffer.readUInt32LE(0).toString();

  return new Promise((resolveResult) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-Command",
        windowsDictationScript(windowHandle),
      ],
      { stdio: "ignore", windowsHide: true },
    );
    child.once("error", (error) => {
      resolveResult({ ok: false, error: `无法启动 Windows 语音输入：${error.message}` });
    });
    child.once("close", (code) => {
      resolveResult(
        code === 0
          ? { ok: true }
          : { ok: false, error: `Windows 语音输入启动失败（退出码 ${code ?? "unknown"}）。` },
      );
    });
  });
}

async function chooseDirectory(
  ownerWindow: BrowserWindow | undefined,
  title: string,
): Promise<string | undefined> {
  const options: OpenDialogOptions = { title, properties: ["openDirectory"] };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

export function createCompassBackendApi(options: CompassBackendOptions): CompassBackendApi {
  const { service, authController, getWindow, emitEvent } = options;

  const publish = (payload: InitPayload): InitPayload => {
    emitEvent({ kind: "state-refresh", payload });
    return payload;
  };

  const buildAndPublish = async (): Promise<InitPayload> => publish(await service.buildInitPayload());

  return {
    init: () => service.buildInitPayload(),
    prompt: (text, images) => service.prompt(text, images),
    abort: () => service.abort(),
    newSession: async () => {
      await service.start();
      return buildAndPublish();
    },
    openSession: async (path) => {
      await service.start({ sessionPath: path });
      return buildAndPublish();
    },
    listSessions: () => service.listSessions(),
    renameSession: (path, name) => service.renameSession(path, name),
    deleteSession: async (path) => {
      const result = await service.deleteSession(path);
      if (result.ok) await buildAndPublish();
      return result;
    },
    archiveSession: async (path) => {
      const result = await service.archiveSession(path);
      if (result.ok) await buildAndPublish();
      return result;
    },
    setModel: (provider, id) => service.setModel(provider, id),
    setModelEnabled: async (provider, id, enabled) => {
      await service.setModelEnabled(provider, id, enabled);
      return buildAndPublish();
    },
    setThinkingLevel: async (level) => {
      const stats = service.setThinkingLevel(level);
      emitEvent({ kind: "stats", stats });
      return stats;
    },
    setPermissionMode: async (mode) => service.setPermissionMode(mode),
    setApiKey: async (provider, key) => {
      await service.setApiKey(provider, key);
      return buildAndPublish();
    },
    loginProvider: async (provider) => publish(await authController.loginProvider(provider)),
    removeApiKey: async (provider) => {
      await service.removeApiKey(provider);
      return buildAndPublish();
    },
    runPrerequisiteAction: async (actionId) => {
      await runPrerequisiteAction(actionId, getWindow());
      return buildAndPublish();
    },
    setSkillEnabled: async (name, enabled) => {
      await service.setSkillEnabled(name, enabled);
      return buildAndPublish();
    },
    addSkillDir: async () => {
      const dir = await chooseDirectory(getWindow(), "选择技能目录");
      if (!dir) return null;
      await service.addSkillDir(dir);
      return buildAndPublish();
    },
    removeSkillDir: async (dir) => {
      await service.removeSkillDir(dir);
      return buildAndPublish();
    },
    setWorkspaceDir: async () => {
      const dir = await chooseDirectory(getWindow(), "选择工作目录");
      if (!dir) return null;
      await service.setWorkspaceDir(dir);
      return buildAndPublish();
    },
    openPath: async (path) => {
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    },
    startDictation: () => startWindowsDictation(getWindow()),
  };
}
