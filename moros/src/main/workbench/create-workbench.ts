import { app, dialog, shell, type BrowserWindow } from "electron";
import { join } from "node:path";
import type { AgentService } from "../agent";
import type { AgentUiEvent } from "../../shared/types";
import { workbenchText } from "../../shared/workbench-i18n.ts";
import { WorkbenchService } from "./service.ts";
import { WorkbenchBrowsers } from "./browser.ts";
import { WorkbenchTerminals } from "./terminals.ts";
import { WorkbenchArtifacts } from "./artifacts.ts";

export function createWorkbench(options: {
  agent: AgentService; getWindow(): BrowserWindow | undefined;
  internalOrigins(): string[]; artifactOrigin(): string;
  emit(event: AgentUiEvent): void;
}): { service: WorkbenchService; artifacts: WorkbenchArtifacts } {
  let service: WorkbenchService;
  const emit = (event: Parameters<WorkbenchServiceOptionsEmit>[0]): void => {
    options.emit(event);
    if (event.type === "browser") void service?.browserChanged(event).catch(() => undefined);
  };
  const artifacts = new WorkbenchArtifacts(options.artifactOrigin);
  service = new WorkbenchService({
    directory: join(app.getPath("userData"), "workbench"),
    currentScope: () => {
      try { const stats = options.agent.getStats(); return { workspaceDir: stats.workspaceDir ?? "", sessionId: stats.sessionId }; }
      catch { return undefined; }
    },
    emit,
    terminals: new WorkbenchTerminals(emit),
    browsers: new WorkbenchBrowsers({ getWindow: options.getWindow, internalOrigins: options.internalOrigins, isArtifactAllowed: (url, scope) => artifacts.allowed(url, scope), emit }),
    artifacts,
    pickFile: async (root) => {
      const settings = options.agent.getSettingsView();
      const dialogOptions = { title: workbenchText(settings.language, "file"), defaultPath: root, properties: ["openFile"] as ["openFile"] };
      const owner = options.getWindow();
      const selected = owner ? await dialog.showOpenDialog(owner, dialogOptions) : await dialog.showOpenDialog(dialogOptions);
      return selected.canceled ? undefined : selected.filePaths[0];
    },
    openFile: async (path) => { const error = await shell.openPath(path); if (error) throw new Error(error); },
  });
  return { service, artifacts };
}

type WorkbenchServiceOptionsEmit = import("./service.ts").WorkbenchServiceOptions["emit"];
