import type {
  AgentUiEvent,
  AppLanguage,
  CommandExplanationLanguage,
  CompassApi,
  PermissionMode,
  ThinkingLevel,
  UiImageAttachment,
} from "@shared/types";
import { contextBridge, ipcRenderer } from "electron";

const api: CompassApi = {
  init: () => ipcRenderer.invoke("app:init"),
  getDeveloperContext: () => ipcRenderer.invoke("developer:context"),
  prompt: (text: string, images?: UiImageAttachment[], clientMessageId?: string) =>
    ipcRenderer.invoke("agent:prompt", text, images, clientMessageId),
  abort: () => ipcRenderer.invoke("agent:abort"),
  resolveApproval: (id, allowed) => ipcRenderer.invoke("agent:resolve-approval", id, allowed),
  newSession: () => ipcRenderer.invoke("agent:new-session"),
  openSession: (path) => ipcRenderer.invoke("agent:open-session", path),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  renameSession: (path, name) => ipcRenderer.invoke("sessions:rename", path, name),
  deleteSession: (path) => ipcRenderer.invoke("sessions:delete", path),
  archiveSession: (path) => ipcRenderer.invoke("sessions:archive", path),
  importLegacyClientRegistry: (serializedRegistry) =>
    ipcRenderer.invoke("clients:import-legacy", serializedRegistry),
  saveClientProfile: (profile) => ipcRenderer.invoke("clients:save-profile", profile),
  assignSessionClient: (sessionId, clientName) =>
    ipcRenderer.invoke("clients:assign-session", sessionId, clientName),
  unassignSessionClient: (sessionId) => ipcRenderer.invoke("clients:unassign-session", sessionId),
  setModel: (provider, id) => ipcRenderer.invoke("models:set", provider, id),
  setModelEnabled: (provider, id, enabled) =>
    ipcRenderer.invoke("models:set-enabled", provider, id, enabled),
  setSummaryModel: (provider, id) => ipcRenderer.invoke("models:set-summary", provider, id),
  setThinkingLevel: (level: ThinkingLevel) => ipcRenderer.invoke("thinking:set", level),
  setPermissionMode: (mode: PermissionMode) => ipcRenderer.invoke("permissions:set", mode),
  setLanguage: (language: AppLanguage) => ipcRenderer.invoke("settings:set-language", language),
  setCommandExplanationLanguage: (language: CommandExplanationLanguage) =>
    ipcRenderer.invoke("settings:set-command-explanation-language", language),
  setQuickPrompts: (prompts) => ipcRenderer.invoke("settings:set-quick-prompts", prompts),
  setApiKey: (provider, key) => ipcRenderer.invoke("auth:set-key", provider, key),
  loginProvider: (provider) => ipcRenderer.invoke("auth:login-provider", provider),
  removeApiKey: (provider) => ipcRenderer.invoke("auth:remove", provider),
  runPrerequisiteAction: (actionId) => ipcRenderer.invoke("runtime:prerequisite-action", actionId),
  refreshDependencies: () => ipcRenderer.invoke("dependencies:refresh"),
  installDependency: (dependencyId, sessionId) =>
    ipcRenderer.invoke("dependencies:install", dependencyId, sessionId),
  cancelDependencyInstall: (dependencyId) => ipcRenderer.invoke("dependencies:cancel", dependencyId),
  openDependencySource: (dependencyId) =>
    ipcRenderer.invoke("dependencies:open-source", dependencyId),
  selectDependencyExecutable: (dependencyId, path) =>
    ipcRenderer.invoke("dependencies:select-executable", dependencyId, path),
  resetDependencyExecutable: (dependencyId) =>
    ipcRenderer.invoke("dependencies:reset-executable", dependencyId),
  setSkillEnabled: (name, enabled) => ipcRenderer.invoke("skills:set-enabled", name, enabled),
  addSkillDir: () => ipcRenderer.invoke("skills:add-dir"),
  removeSkillDir: (dir) => ipcRenderer.invoke("skills:remove-dir", dir),
  setWorkspaceDir: () => ipcRenderer.invoke("settings:set-workspace"),
  openPath: (path) => ipcRenderer.invoke("shell:open-path", path),
  startDictation: () => ipcRenderer.invoke("voice:start-dictation"),
  onAgentEvent: (listener) => {
    const handler = (_event: unknown, payload: AgentUiEvent): void => listener(payload);
    ipcRenderer.on("agent:event", handler);
    return () => ipcRenderer.removeListener("agent:event", handler);
  },
  windowControl: (action) => ipcRenderer.send("win:control", action),
  onMaximizeChange: (listener) => {
    const handler = (_event: unknown, maximized: boolean): void => listener(maximized);
    ipcRenderer.on("win:maximized", handler);
    return () => ipcRenderer.removeListener("win:maximized", handler);
  },
};

contextBridge.exposeInMainWorld("compass", api);
