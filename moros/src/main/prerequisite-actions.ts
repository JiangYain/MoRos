import type { BrowserWindow } from "electron";
import type { AppLanguage } from "@shared/types";
import { dialog, shell } from "electron";
import { spawn } from "node:child_process";
import { getRuntimePrerequisiteAction, INSTALL_GIT_WITH_WINGET_ACTION_ID } from "./prerequisites";

export async function runPrerequisiteAction(
  actionId: string,
  ownerWindow?: BrowserWindow,
  language: AppLanguage = "zh-CN",
): Promise<void> {
  const action = getRuntimePrerequisiteAction(actionId);
  if (!action) {
    throw new Error(`Unknown prerequisite action: ${actionId}`);
  }

  if (action.kind === "refresh") return;

  if (action.kind === "open-url") {
    await shell.openExternal(action.url);
    return;
  }

  if (action.id === INSTALL_GIT_WITH_WINGET_ACTION_ID && process.platform !== "win32") {
    throw new Error("Git for Windows installer action is only available on Windows.");
  }

  const copy: Record<AppLanguage, { buttons: [string, string]; message: string; detail: string }> = {
    "zh-CN": {
      buttons: ["打开安装命令", "取消"], message: "安装 Git for Windows",
      detail: `Moros 将打开 PowerShell 执行：\n${action.command}\n\n安装完成后回到 Moros，点击“刷新检测”。`,
    },
    "zh-TW": {
      buttons: ["開啟安裝指令", "取消"], message: "安裝 Git for Windows",
      detail: `Moros 將開啟 PowerShell 執行：\n${action.command}\n\n安裝完成後回到 Moros，按一下「重新檢查」。`,
    },
    en: {
      buttons: ["Open install command", "Cancel"], message: "Install Git for Windows",
      detail: `Moros will open PowerShell and run:\n${action.command}\n\nAfter installation, return to Moros and select “Check again”.`,
    },
    de: {
      buttons: ["Installationsbefehl öffnen", "Abbrechen"], message: "Git for Windows installieren",
      detail: `Moros öffnet PowerShell und führt Folgendes aus:\n${action.command}\n\nKehren Sie danach zu Moros zurück und wählen Sie „Erneut prüfen“.`,
    },
  };
  const localized = copy[language];
  const result = ownerWindow
    ? await dialog.showMessageBox(ownerWindow, {
        type: "question",
        buttons: localized.buttons,
        defaultId: 0,
        cancelId: 1,
        message: localized.message,
        detail: localized.detail,
      })
    : { response: 0 };
  if (result.response !== 0) return;

  const command = `${action.command}; Write-Host ""; Write-Host "Install finished. Return to Moros and click Refresh."`;
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
