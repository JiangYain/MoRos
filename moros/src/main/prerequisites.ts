import { getAgentDir, getShellConfig, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { RuntimePrerequisiteAction, RuntimePrerequisites } from "@shared/types";

export const INSTALL_GIT_WITH_WINGET_ACTION_ID = "install-git-with-winget";
export const OPEN_GIT_DOWNLOAD_ACTION_ID = "open-git-download";
export const REFRESH_PREREQUISITES_ACTION_ID = "refresh-prerequisites";

export const GIT_FOR_WINDOWS_DOWNLOAD_URL = "https://git-scm.com/download/win";
export const WINGET_GIT_COMMAND =
  "winget install --id Git.Git --exact --source winget --accept-package-agreements --accept-source-agreements";

export const REFRESH_PREREQUISITES_ACTION: RuntimePrerequisiteAction = {
  kind: "refresh",
  id: REFRESH_PREREQUISITES_ACTION_ID,
  label: "刷新检测",
  description: "重新检查 Moros 当前能否找到可用的 Bash。",
};

export const INSTALL_GIT_WITH_WINGET_ACTION: RuntimePrerequisiteAction = {
  kind: "shell-command",
  id: INSTALL_GIT_WITH_WINGET_ACTION_ID,
  label: "打开安装命令",
  description: "打开 PowerShell 并通过 winget 安装 Git for Windows。",
  command: WINGET_GIT_COMMAND,
};

export const OPEN_GIT_DOWNLOAD_ACTION: RuntimePrerequisiteAction = {
  kind: "open-url",
  id: OPEN_GIT_DOWNLOAD_ACTION_ID,
  label: "打开下载页",
  description: "打开 Git for Windows 官方下载页面。",
  url: GIT_FOR_WINDOWS_DOWNLOAD_URL,
};

function installActions(): RuntimePrerequisiteAction[] {
  if (process.platform !== "win32") return [REFRESH_PREREQUISITES_ACTION];
  return [INSTALL_GIT_WITH_WINGET_ACTION, OPEN_GIT_DOWNLOAD_ACTION, REFRESH_PREREQUISITES_ACTION];
}

export function getRuntimePrerequisiteAction(
  actionId: string,
): RuntimePrerequisiteAction | undefined {
  return [INSTALL_GIT_WITH_WINGET_ACTION, OPEN_GIT_DOWNLOAD_ACTION, REFRESH_PREREQUISITES_ACTION].find(
    (action) => action.id === actionId,
  );
}

function configuredShellPath(workspaceDir: string): string | undefined {
  try {
    return SettingsManager.create(workspaceDir, getAgentDir()).getShellPath()?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getRuntimePrerequisites(workspaceDir: string): RuntimePrerequisites {
  const shellPath = configuredShellPath(workspaceDir);
  try {
    const shell = getShellConfig(shellPath);
    return {
      shell: {
        id: "bash",
        name: "Bash / Git Bash",
        ok: true,
        detail: shellPath
          ? "Pi bash 工具已使用 settings.json 中配置的 shellPath。"
          : "Pi bash 工具已可执行 shell 命令。",
        shellPath: shell.shell,
        shellArgs: shell.args,
        actions: [REFRESH_PREREQUISITES_ACTION],
      },
    };
  } catch (error) {
    return {
      shell: {
        id: "bash",
        name: "Bash / Git Bash",
        ok: false,
        detail:
          process.platform === "win32"
            ? `Moros 需要先安装 Git Bash 或其他 bash.exe，Agent 的 shell 工具才能执行。${errorMessage(error)}`
            : errorMessage(error),
        actions: installActions(),
      },
    };
  }
}
