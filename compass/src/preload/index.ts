import type { AgentUiEvent, CompassApi, ThinkingLevel } from "@shared/types";
import { contextBridge, ipcRenderer } from "electron";

const api: CompassApi = {
  init: () => ipcRenderer.invoke("app:init"),
  prompt: (text) => ipcRenderer.invoke("agent:prompt", text),
  abort: () => ipcRenderer.invoke("agent:abort"),
  newSession: () => ipcRenderer.invoke("agent:new-session"),
  openSession: (path) => ipcRenderer.invoke("agent:open-session", path),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  setModel: (provider, id) => ipcRenderer.invoke("models:set", provider, id),
  setThinkingLevel: (level: ThinkingLevel) => ipcRenderer.invoke("thinking:set", level),
  setApiKey: (provider, key) => ipcRenderer.invoke("auth:set-key", provider, key),
  loginProvider: (provider) => ipcRenderer.invoke("auth:login-provider", provider),
  removeApiKey: (provider) => ipcRenderer.invoke("auth:remove", provider),
  setSkillEnabled: (name, enabled) => ipcRenderer.invoke("skills:set-enabled", name, enabled),
  addSkillDir: () => ipcRenderer.invoke("skills:add-dir"),
  removeSkillDir: (dir) => ipcRenderer.invoke("skills:remove-dir", dir),
  setWorkspaceDir: () => ipcRenderer.invoke("settings:set-workspace"),
  openPath: (path) => ipcRenderer.invoke("shell:open-path", path),
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
