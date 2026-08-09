import type {
  AgentUiEvent,
  CompassApi,
} from "@shared/types";
import {
  type BackendMethod,
  type BackendOperationResult,
  type BackendTransportInvoker,
  createBackendTransportClient,
  ipcChannelForBackendMethod,
} from "@shared/transport-contract";
import { contextBridge, ipcRenderer } from "electron";

const invokeElectronBackend: BackendTransportInvoker = <Method extends BackendMethod>(
  method: Method,
  args: readonly unknown[],
): Promise<BackendOperationResult<Method>> => (
  ipcRenderer.invoke(ipcChannelForBackendMethod(method), ...args) as Promise<BackendOperationResult<Method>>
);
const backend = createBackendTransportClient(invokeElectronBackend);

const api: CompassApi = {
  ...backend,
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
