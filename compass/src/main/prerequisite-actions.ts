import type { BrowserWindow } from "electron";
import { dialog, shell } from "electron";
import { spawn } from "node:child_process";
import { getRuntimePrerequisiteAction, INSTALL_GIT_WITH_WINGET_ACTION_ID } from "./prerequisites";

export async function runPrerequisiteAction(
  actionId: string,
  ownerWindow?: BrowserWindow,
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

  const result = ownerWindow
    ? await dialog.showMessageBox(ownerWindow, {
        type: "question",
        buttons: ["打开安装命令", "取消"],
        defaultId: 0,
        cancelId: 1,
        message: "安装 Git for Windows",
        detail: `Compass 将打开 PowerShell 执行：\n${action.command}\n\n安装完成后回到 Compass，点击“刷新检测”。`,
      })
    : { response: 0 };
  if (result.response !== 0) return;

  const command = `${action.command}; Write-Host ""; Write-Host "Install finished. Return to Compass and click Refresh."`;
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
