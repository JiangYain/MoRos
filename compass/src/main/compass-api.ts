import type {
  AgentUiEvent,
  AppLanguage,
  CompassBackendApi,
  InitPayload,
  VoiceInputResult,
} from "@shared/types";
import { dialog, shell, type BrowserWindow, type OpenDialogOptions } from "electron";
import { spawn } from "node:child_process";
import type { AgentService } from "./agent";
import type { AuthLoginController } from "./auth-login-controller";
import type { ClientDatabase } from "./client-database";
import type { DependencyManager, DependencySnapshotOptions } from "./dependency-manager";
import { focusWindowForDictation } from "./dictation-window";
import { ModelMutationCoordinator } from "./model-mutation-coordinator";
import { runPrerequisiteAction } from "./prerequisite-actions";
import { completeSessionRemoval } from "./session-removal-completion";

interface CompassBackendOptions {
  service: AgentService;
  authController: AuthLoginController;
  clientDatabase: ClientDatabase;
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
  chooseTargetExecutable: string;
}> = {
  "zh-CN": {
    voiceWindowsOnly: "语音输入目前仅支持 Windows。", mainWindowUnavailable: "Compass 主窗口不可用。",
    voiceStartFailed: "无法启动 Windows 语音输入：{error}", voiceExitFailed: "Windows 语音输入启动失败（退出码 {code}）。",
    chooseSkillDirectory: "选择技能目录", chooseWorkspace: "选择工作目录",
    chooseTargetExecutable: "选择要由 Compass 使用的 Target.exe",
  },
  "zh-TW": {
    voiceWindowsOnly: "語音輸入目前僅支援 Windows。", mainWindowUnavailable: "Compass 主視窗無法使用。",
    voiceStartFailed: "無法啟動 Windows 語音輸入：{error}", voiceExitFailed: "Windows 語音輸入啟動失敗（結束代碼 {code}）。",
    chooseSkillDirectory: "選擇技能目錄", chooseWorkspace: "選擇工作目錄",
    chooseTargetExecutable: "選擇要由 Compass 使用的 Target.exe",
  },
  en: {
    voiceWindowsOnly: "Voice input is currently available only on Windows.", mainWindowUnavailable: "The Compass window is unavailable.",
    voiceStartFailed: "Could not start Windows voice input: {error}", voiceExitFailed: "Windows voice input failed to start (exit code {code}).",
    chooseSkillDirectory: "Choose skill directory", chooseWorkspace: "Choose working directory",
    chooseTargetExecutable: "Choose the Target.exe Compass should use",
  },
  de: {
    voiceWindowsOnly: "Die Spracheingabe ist derzeit nur unter Windows verfügbar.", mainWindowUnavailable: "Das Compass-Fenster ist nicht verfügbar.",
    voiceStartFailed: "Windows-Spracheingabe konnte nicht gestartet werden: {error}", voiceExitFailed: "Windows-Spracheingabe konnte nicht gestartet werden (Exitcode {code}).",
    chooseSkillDirectory: "Skill-Verzeichnis auswählen", chooseWorkspace: "Arbeitsverzeichnis auswählen",
    chooseTargetExecutable: "Target.exe für Compass auswählen",
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

async function chooseExecutable(
  ownerWindow: BrowserWindow | undefined,
  title: string,
): Promise<string | undefined> {
  const options: OpenDialogOptions = {
    title,
    properties: ["openFile"],
    filters: [{ name: "Target.exe", extensions: ["exe"] }],
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? undefined : result.filePaths[0];
}

export function createCompassBackendApi(options: CompassBackendOptions): CompassBackendApi {
  const { service, authController, clientDatabase, dependencyManager, getWindow, emitEvent } = options;

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
  const publishClientRegistry = <Registry extends InitPayload["clientRegistry"]>(registry: Registry): Registry => {
    emitEvent({ kind: "client-registry-changed", registry });
    return registry;
  };
  const sessionRemovalCompletion = {
    clearAssignment: (sessionId: string) => {
      publishClientRegistry(clientDatabase.unassignSession(sessionId));
    },
    publish: () => buildAndPublish(),
  };

  return {
    init: async () => withDependencies(await service.buildInitPayload()),
    getDeveloperContext: () => Promise.resolve(service.getDeveloperContext()),
    prompt: (text, images, clientMessageId) => service.prompt(text, images, clientMessageId),
    abort: () => service.abort(),
    resolveApproval: async (id, allowed) => service.resolveApproval(id, allowed),
    removeQueuedMessage: async (kind, index, text) => service.removeQueuedMessage(kind, index, text),
    newSession: async () => {
      await service.start();
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
    importLegacyClientRegistry: async (serializedRegistry) =>
      publishClientRegistry(clientDatabase.importLegacyRegistry(serializedRegistry)),
    saveClientProfile: async (profile) =>
      publishClientRegistry(clientDatabase.saveProfile(profile)),
    updateClientProfile: async (originalName, profile) =>
      publishClientRegistry(clientDatabase.updateProfile(originalName, profile)),
    deleteClientProfile: async (name) =>
      publishClientRegistry(clientDatabase.deleteProfile(name)),
    assignSessionClient: async (sessionId, clientName) =>
      publishClientRegistry(clientDatabase.assignSession(sessionId, clientName)),
    unassignSessionClient: async (sessionId) =>
      publishClientRegistry(clientDatabase.unassignSession(sessionId)),
    listClientAudiograms: async (clientName) => clientDatabase.listAudiograms(clientName),
    saveClientAudiogram: async (clientName, record) =>
      clientDatabase.saveAudiogram(clientName, record),
    deleteClientAudiogram: async (clientName, id) =>
      clientDatabase.deleteAudiogram(clientName, id),
    setModel: (provider, id) => modelMutations.setModel(provider, id),
    setModelEnabled: (provider, id, enabled) =>
      modelMutations.setModelEnabled(provider, id, enabled),
    setSummaryModel: async (provider, id) => service.setSummaryModel(provider, id),
    setThinkingLevel: async (level) => {
      const stats = await service.setThinkingLevel(level);
      emitEvent({ kind: "stats", stats });
      return stats;
    },
    setPermissionMode: async (mode) => service.setPermissionMode(mode),
    setLanguage: async (language) => service.setLanguage(language),
    setCommandExplanationLanguage: async (language) =>
      service.setCommandExplanationLanguage(language),
    setComposerSendKey: async (sendKey) => service.setComposerSendKey(sendKey),
    setQuickPrompts: async (prompts) => service.setQuickPrompts(prompts),
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
    selectDependencyExecutable: async (dependencyId, requestedPath) => {
      const language = service.getSettingsView().language;
      const path = requestedPath ?? await chooseExecutable(
          getWindow(),
          backendMessage(language, "chooseTargetExecutable"),
        );
      if (!path) return null;
      await dependencyManager.setExecutable(dependencyId, path);
      const dependencies = await dependencyManager.snapshot(service.getPrerequisites(), { force: true });
      emitEvent({ kind: "dependencies-changed", dependencies });
      return dependencies;
    },
    resetDependencyExecutable: async (dependencyId) => {
      await dependencyManager.setExecutable(dependencyId, undefined);
      const dependencies = await dependencyManager.snapshot(service.getPrerequisites(), { force: true });
      emitEvent({ kind: "dependencies-changed", dependencies });
      return dependencies;
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
