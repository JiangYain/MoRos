import type {
  AgentUiEvent,
  AppLanguage,
  MorosBackendApi,
  InitPayload,
  VoiceInputResult,
} from "@shared/types";
import { dialog, shell, type BrowserWindow, type OpenDialogOptions } from "electron";
import { spawn } from "node:child_process";
import type { AgentService } from "./agent";
import type { AuthLoginController } from "./auth-login-controller";
import type { DependencyManager, DependencySnapshotOptions } from "./dependency-manager";
import { focusWindowForDictation } from "./dictation-window";
import { ModelMutationCoordinator } from "./model-mutation-coordinator";
import { runPrerequisiteAction } from "./prerequisite-actions";
import { completeSessionRemoval } from "./session-removal-completion";
import type { WorkbenchService } from "./workbench/service";

interface MorosBackendOptions {
  workbench?: WorkbenchService;
  service: AgentService;
  authController: AuthLoginController;
  dependencyManager: DependencyManager;
  getWindow: () => BrowserWindow | undefined;
  emitEvent: (event: AgentUiEvent) => void;
}

const BACKEND_COPY: Record<AppLanguage, {
  voiceWindowsOnly: string;
  mainWindowUnavailable: string;
  voiceStartFailed: string;
  voiceExitFailed: string;
  chooseSkillDirectory: string;
  chooseWorkspace: string;
}> = {
  "zh-CN": {
    voiceWindowsOnly: "语音输入目前仅支持 Windows。", mainWindowUnavailable: "Moros 主窗口不可用。",
    voiceStartFailed: "无法启动 Windows 语音输入：{error}", voiceExitFailed: "Windows 语音输入启动失败（退出码 {code}）。",
    chooseSkillDirectory: "选择技能目录", chooseWorkspace: "选择工作目录",
  },
  "zh-TW": {
    voiceWindowsOnly: "語音輸入目前僅支援 Windows。", mainWindowUnavailable: "Moros 主視窗無法使用。",
    voiceStartFailed: "無法啟動 Windows 語音輸入：{error}", voiceExitFailed: "Windows 語音輸入啟動失敗（結束代碼 {code}）。",
    chooseSkillDirectory: "選擇技能目錄", chooseWorkspace: "選擇工作目錄",
  },
  en: {
    voiceWindowsOnly: "Voice input is currently available only on Windows.", mainWindowUnavailable: "The Moros window is unavailable.",
    voiceStartFailed: "Could not start Windows voice input: {error}", voiceExitFailed: "Windows voice input failed to start (exit code {code}).",
    chooseSkillDirectory: "Choose skill directory", chooseWorkspace: "Choose working directory",
  },
  de: {
    voiceWindowsOnly: "Die Spracheingabe ist derzeit nur unter Windows verfügbar.", mainWindowUnavailable: "Das Moros-Fenster ist nicht verfügbar.",
    voiceStartFailed: "Windows-Spracheingabe konnte nicht gestartet werden: {error}", voiceExitFailed: "Windows-Spracheingabe konnte nicht gestartet werden (Exitcode {code}).",
    chooseSkillDirectory: "Skill-Verzeichnis auswählen", chooseWorkspace: "Arbeitsverzeichnis auswählen",
  },
};

function backendMessage(language: AppLanguage, key: keyof (typeof BACKEND_COPY)[AppLanguage], values: Record<string, string> = {}): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    BACKEND_COPY[language][key],
  );
}

function windowsDictationScript(windowHandle: string): string {
  return `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class MorosVoiceInput {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr windowHandle);

  [DllImport("user32.dll")]
  public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);
}
"@

[long]$windowHandle = ${windowHandle}
[void][MorosVoiceInput]::SetForegroundWindow([IntPtr]$windowHandle)
Start-Sleep -Milliseconds 80
[MorosVoiceInput]::keybd_event(0x5B, 0, 0, [UIntPtr]::Zero)
[MorosVoiceInput]::keybd_event(0x48, 0, 0, [UIntPtr]::Zero)
[MorosVoiceInput]::keybd_event(0x48, 0, 2, [UIntPtr]::Zero)
[MorosVoiceInput]::keybd_event(0x5B, 0, 2, [UIntPtr]::Zero)
`;
}

function startWindowsDictation(language: AppLanguage, ownerWindow?: BrowserWindow): Promise<VoiceInputResult> {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: backendMessage(language, "voiceWindowsOnly") });
  }
  if (!ownerWindow || ownerWindow.isDestroyed()) {
    return Promise.resolve({ ok: false, error: backendMessage(language, "mainWindowUnavailable") });
  }

  focusWindowForDictation(ownerWindow);
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
      resolveResult({ ok: false, error: backendMessage(language, "voiceStartFailed", { error: error.message }) });
    });
    child.once("close", (code) => {
      resolveResult(
        code === 0
          ? { ok: true }
          : { ok: false, error: backendMessage(language, "voiceExitFailed", { code: String(code ?? "unknown") }) },
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

export function createMorosBackendApi(options: MorosBackendOptions): MorosBackendApi {
  const { service, authController, dependencyManager, getWindow, emitEvent } = options;

  const publish = (payload: InitPayload): InitPayload => {
    emitEvent({ kind: "state-refresh", payload });
    return payload;
  };

  const withDependencies = async (
    payload: InitPayload,
    dependencyOptions?: DependencySnapshotOptions,
  ): Promise<InitPayload> => ({
    ...payload,
    dependencies: await dependencyManager.snapshot(payload.prerequisites, dependencyOptions),
  });
  const buildAndPublish = async (dependencyOptions?: DependencySnapshotOptions): Promise<InitPayload> =>
    publish(await withDependencies(await service.buildInitPayload(), dependencyOptions));
  const modelMutations = new ModelMutationCoordinator({
    setModel: (provider, id) => service.setModel(provider, id),
    setModelEnabled: (provider, id, enabled) => service.setModelEnabled(provider, id, enabled),
    publish: (allowStaleDependencies) => buildAndPublish(
      allowStaleDependencies ? { allowStale: true } : undefined,
    ),
  });
  const sessionRemovalCompletion = {
    publish: () => buildAndPublish(),
  };

  return {
    workbench: async (request) => {
      if (!options.workbench) throw new Error("Workbench is unavailable.");
      return options.workbench.execute(request, "electron");
    },
    init: async () => withDependencies(await service.buildInitPayload()),
    getDeveloperContext: () => Promise.resolve(service.getDeveloperContext()),
    prompt: (text, images, clientMessageId, feedbackIds, recalledFeedback) => service.prompt(text, images, clientMessageId, feedbackIds, recalledFeedback),
    abort: () => service.abort(),
    resolveApproval: async (id, allowed, scope) => service.resolveApproval(id, allowed, scope),
    removeQueuedMessage: async (kind, index, text, expectedScope) => service.removeQueuedMessage(kind, index, text, expectedScope),
    newSession: async (workspaceDir) => {
      if (workspaceDir) await service.setWorkspaceDir(workspaceDir);
      else await service.start();
      return buildAndPublish({ allowStale: true });
    },
    openSession: async (path) => {
      await service.start({ sessionPath: path });
      return buildAndPublish({ allowStale: true });
    },
    listSessions: () => service.listSessions(),
    searchSessionContent: (query) => service.searchSessionContent(query),
    renameSession: (path, name) => service.renameSession(path, name),
    deleteSession: async (path) => {
      return completeSessionRemoval(
        await service.deleteSession(path),
        sessionRemovalCompletion,
      );
    },
    archiveSession: async (path) => {
      return completeSessionRemoval(
        await service.archiveSession(path),
        sessionRemovalCompletion,
      );
    },
    listArchivedSessions: () => service.listArchivedSessions(),
    restoreArchivedSession: (path) => service.restoreArchivedSession(path),
    setModel: (provider, id) => modelMutations.setModel(provider, id),
    setModelEnabled: (provider, id, enabled) =>
      modelMutations.setModelEnabled(provider, id, enabled),
    setSummaryModel: (provider, id) =>
      modelMutations.publishAfter(() => service.setSummaryModel(provider, id)),
    setThinkingLevel: async (level) => {
      const stats = await service.setThinkingLevel(level);
      emitEvent({ kind: "stats", stats });
      return stats;
    },
    setPermissionMode: (mode) =>
      modelMutations.publishAfter(() => service.setPermissionMode(mode)),
    setLanguage: (language) =>
      modelMutations.publishAfter(() => service.setLanguage(language)),
    setCommandExplanationLanguage: (language) =>
      modelMutations.publishAfter(() => service.setCommandExplanationLanguage(language)),
    setComposerSendKey: (sendKey) =>
      modelMutations.publishAfter(() => service.setComposerSendKey(sendKey)),
    setQuickPrompts: (prompts) =>
      modelMutations.publishAfter(() => service.setQuickPrompts(prompts)),
    setApiKey: (provider, key) =>
      modelMutations.mutateAndPublish(() => service.setApiKey(provider, key)),
    loginProvider: (provider) => {
      // Cancellation must happen before enqueueing so retrying a long-running
      // OAuth flow can release the transaction currently holding the queue.
      authController.cancelProviderLogin(provider);
      return modelMutations.mutateAndPublish(() => authController.loginProvider(provider));
    },
    removeApiKey: (provider) =>
      modelMutations.mutateAndPublish(() => service.removeApiKey(provider)),
    runPrerequisiteAction: async (actionId) => {
      await runPrerequisiteAction(actionId, getWindow(), service.getSettingsView().language);
      return buildAndPublish();
    },
    refreshDependencies: async () => {
      const dependencies = await dependencyManager.snapshot(service.getPrerequisites(), { force: true });
      emitEvent({ kind: "dependencies-changed", dependencies });
      return dependencies;
    },
    installDependency: async (dependencyId, sessionId) =>
      dependencyManager.startInstall(dependencyId, sessionId),
    cancelDependencyInstall: async (dependencyId) =>
      dependencyManager.cancelInstall(dependencyId),
    openDependencySource: async (dependencyId) => dependencyManager.openSource(dependencyId),
    refreshSkills: async () => {
      await service.refreshSkills();
      return buildAndPublish({ allowStale: true });
    },
    setSkillEnabled: async (name, enabled) => {
      await service.setSkillEnabled(name, enabled);
      return buildAndPublish();
    },
    addSkillDir: async () => {
      const language = service.getSettingsView().language;
      const dir = await chooseDirectory(getWindow(), backendMessage(language, "chooseSkillDirectory"));
      if (!dir) return null;
      await service.addSkillDir(dir);
      return buildAndPublish();
    },
    removeSkillDir: async (dir) => {
      await service.removeSkillDir(dir);
      return buildAndPublish();
    },
    setWorkspaceDir: async () => {
      const language = service.getSettingsView().language;
      const dir = await chooseDirectory(getWindow(), backendMessage(language, "chooseWorkspace"));
      if (!dir) return null;
      await service.setWorkspaceDir(dir);
      return buildAndPublish();
    },
    openPath: async (path) => {
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    },
    startDictation: () => startWindowsDictation(service.getSettingsView().language, getWindow()),
  };
}
