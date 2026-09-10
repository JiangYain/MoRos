import type { StoreApi } from "zustand";
import type { MorosState } from "../store/state";
import { api } from "../ipc";
import { workbenchText } from "../../../shared/workbench-i18n";
import { workbenchScopeKey, type WorkbenchBrowser, type WorkbenchCall, type WorkbenchConfirmation, type WorkbenchEvent, type WorkbenchFeedback, type WorkbenchRequest, type WorkbenchResource, type WorkbenchScope, type WorkbenchState } from "../../../shared/workbench";

export interface WorkbenchUI {
  recalledFeedback?: WorkbenchFeedback[];
  feedbackOpen?: boolean;
  draft?: WorkbenchFeedback;
  confirmation?: { value: WorkbenchConfirmation; request: WorkbenchRequest };
  resourceInput?: "file" | "browser" | "review";
  error?: string;
}
export interface WorkbenchStoreFields {
  workbenchStates: Record<string, WorkbenchState>;
  workbenchBrowsers: Record<string, WorkbenchBrowser>;
  workbenchTerminalChunks: Record<string, Array<{ data: string; offset: number }>>;
  workbenchTerminalStatus: Record<string, { status: string; exitCode?: number; error?: string; source?: "user" | "agent" }>;
  workbenchChangedFiles: Record<string, number>;
  workbenchUI: Record<string, WorkbenchUI>;
  setWorkbenchState(state: WorkbenchState): void;
  setWorkbenchUI(scope: WorkbenchScope, patch: Partial<WorkbenchUI>): void;
  workbenchCall: WorkbenchCall;
  openWorkbench(resource?: WorkbenchResource): Promise<void>;
  applyWorkbenchEvent(event: WorkbenchEvent): void;
}

export function currentWorkbenchScope(state: Pick<MorosState, "stats">): WorkbenchScope | undefined {
  const stats = state.stats;
  return stats?.workspaceDir && stats.sessionId ? { workspaceDir: stats.workspaceDir, sessionId: stats.sessionId } : undefined;
}

export function createWorkbenchState({ get, set }: { get(): MorosState; set: StoreApi<MorosState>["setState"] }): WorkbenchStoreFields {
  return {
    workbenchStates: {}, workbenchBrowsers: {}, workbenchTerminalChunks: {}, workbenchTerminalStatus: {}, workbenchChangedFiles: {}, workbenchUI: {},
    setWorkbenchState: (state) => set((current) => {
      const key = workbenchScopeKey(state.scope);
      const previous = current.workbenchStates?.[key];
      if (previous && previous.revision > state.revision) return current;
      return { workbenchStates: { ...current.workbenchStates, [key]: state } };
    }),
    setWorkbenchUI: (scope, patch) => set((state) => {
      const key = workbenchScopeKey(scope);
      return { workbenchUI: { ...state.workbenchUI, [key]: { ...state.workbenchUI?.[key], ...patch } } };
    }),
    workbenchCall: async (request) => {
      const reply = await api.workbench(request);
      if ("state" in reply && reply.state) get().setWorkbenchState(reply.state);
      if ("terminal" in reply) {
        const terminal = reply.terminal;
        set((current) => ({ workbenchTerminalStatus: { ...current.workbenchTerminalStatus, [terminal.id]: { status: terminal.status, exitCode: terminal.exitCode, error: terminal.error, source: terminal.commands.at(-1)?.source } } }));
      }
      return reply;
    },
    openWorkbench: async (resource) => {
      const scope = currentWorkbenchScope(get());
      if (!scope) { get().setError(workbenchText(get().settings?.language ?? "en", "WB_NO_WORKSPACE")); return; }
      try {
        get().setWorkbenchUI(scope, { error: undefined });
        await get().workbenchCall(resource ? { scope, operation: "open", resource } : { scope, operation: "layout", open: true, collapsed: false });
      } catch (error) { get().setWorkbenchUI(scope, { error: error instanceof Error ? error.message : String(error) }); }
    },
    applyWorkbenchEvent: (event) => {
      if (event.type === "state") { get().setWorkbenchState(event.state); return; }
      if (event.type === "browser") { set((state) => ({ workbenchBrowsers: { ...state.workbenchBrowsers, [event.browser.id]: event.browser } })); return; }
      if (event.type === "terminal-data") {
        set((state) => {
          const chunks = [...(state.workbenchTerminalChunks?.[event.tabId] ?? []), { data: event.data, offset: event.offset }];
          let size = 0;
          const retained = chunks.reverse().filter((chunk) => { size += chunk.data.length; return size <= 1_000_000; }).reverse();
          return { workbenchTerminalChunks: { ...state.workbenchTerminalChunks, [event.tabId]: retained } };
        });
        return;
      }
      if (event.type === "terminal-status") { set((state) => ({ workbenchTerminalStatus: { ...state.workbenchTerminalStatus, [event.tabId]: { ...state.workbenchTerminalStatus?.[event.tabId], status: event.status, exitCode: event.exitCode, error: event.error, ...(event.source ? { source: event.source } : {}) } } })); return; }
      if (event.type === "file-changed") { set((state) => ({ workbenchChangedFiles: { ...state.workbenchChangedFiles, [event.tabId]: (state.workbenchChangedFiles?.[event.tabId] ?? 0) + 1 } })); return; }
      if (event.type === "annotation") { get().setWorkbenchUI(event.scope, { draft: event.feedback }); return; }
      if (event.type === "shortcut") window.dispatchEvent(new CustomEvent("moros:workbench-shortcut", { detail: event }));
    },
  };
}
