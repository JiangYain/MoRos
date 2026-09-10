import { useEffect, useMemo } from "react";
import { useMoros } from "../store";
import { useI18n } from "../i18n";
import { currentWorkbenchScope } from "./state";
import { emptyWorkbench, workbenchScopeKey, type WorkbenchScope } from "../../../shared/workbench";
import { workbenchError, workbenchText, type WorkbenchTextKey } from "../../../shared/workbench-i18n";
import { mergePendingFeedback } from "./pending-feedback";

export function useWorkbenchText() {
  const { language } = useI18n();
  return {
    language,
    wt: (key: WorkbenchTextKey, values?: Record<string, string | number>) => workbenchText(language, key, values),
    errorText: (error: unknown) => workbenchError(language, error),
  };
}

export function useWorkbench() {
  const stats = useMoros((state) => state.stats);
  const scope = useMemo(() => currentWorkbenchScope({ stats }), [stats?.workspaceDir, stats?.sessionId]);
  const key = scope ? workbenchScopeKey(scope) : "";
  const stored = useMoros((state) => state.workbenchStates?.[key]);
  const ui = useMoros((state) => state.workbenchUI?.[key]);
  const fallback = useMemo(() => scope ? emptyWorkbench(scope) : undefined, [key]);
  const call = useMoros((state) => state.workbenchCall);
  const setUI = useMoros((state) => state.setWorkbenchUI);
  const feedback = useMemo(() => mergePendingFeedback(stored?.feedback, ui?.recalledFeedback), [stored?.feedback, ui?.recalledFeedback]);
  const editFeedback = async (id: string, selected?: boolean): Promise<void> => {
    if (!scope) return;
    const recalled = useMoros.getState().workbenchUI[key]?.recalledFeedback ?? [];
    if (recalled.some((item) => item.id === id)) {
      setUI(scope, { recalledFeedback: selected === undefined ? recalled.filter((item) => item.id !== id)
        : recalled.map((item) => item.id === id ? { ...item, selected } : item) });
    } else {
      await call(selected === undefined ? { scope, operation: "feedback", action: "remove", ids: [id] }
        : { scope, operation: "feedback", action: "update", ids: [id], selected });
    }
  };
  return { scope, key, state: stored ?? fallback, feedback, editFeedback, ui: ui ?? {}, call, setUI };
}

export function useWorkbenchConnection(): void {
  const { scope, key, call, setUI } = useWorkbench();
  useEffect(() => {
    if (!scope) return;
    let active = true;
    void call({ scope, operation: "state" }).catch((error: unknown) => {
      if (active) setUI(scope, { error: error instanceof Error ? error.message : String(error) });
    });
    return () => { active = false; };
  }, [key, call, setUI]);
}

export function focusComposer(): void { document.querySelector<HTMLElement>(".composer-editor")?.focus(); }

export function sourceLabel(source: { path?: string; line?: number; url?: string; title?: string }): string {
  if (source.path) return `${source.path.split(/[\\/]/).at(-1)}${source.line ? `:${source.line}` : ""}`;
  return source.title || source.url || "";
}

export function sameScope(left: WorkbenchScope, right?: WorkbenchScope): boolean { return Boolean(right && workbenchScopeKey(left) === workbenchScopeKey(right)); }
