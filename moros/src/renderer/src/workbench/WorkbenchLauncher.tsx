import { File, GitCompareArrows, Globe, PanelRight, SquareTerminal } from "lucide-react";
import { useMoros } from "../store";
import { useWorkbench, useWorkbenchText } from "./useWorkbench";

export function WorkbenchLauncher(): React.JSX.Element {
  const { scope, state, call } = useWorkbench();
  const { wt, errorText } = useWorkbenchText();
  const open = useMoros((state) => state.openWorkbench);
  const fail = (error: unknown): void => { useMoros.getState().setError(errorText(error)); };
  return <div className="wb-launcher">
    <div className="wb-launch-extra">
      <button title={wt("files")} aria-label={wt("files")} onClick={() => void open({ kind: "files" })}><File size={14} /></button>
      <button title={wt("newTerminal")} aria-label={wt("newTerminal")} onClick={() => void open({ kind: "terminal" })}><SquareTerminal size={14} /></button>
      <button title={wt("openBrowser")} aria-label={wt("openBrowser")} onClick={() => void open({ kind: "browser", url: "" })}><Globe size={14} /></button>
      <button title={wt("review")} aria-label={wt("review")} onClick={() => void open({ kind: "review", range: "unstaged" })}><GitCompareArrows size={14} /></button>
    </div>
    <button title={wt("openPanel")} aria-label={wt("openPanel")} aria-expanded={state?.open && !state.collapsed || false} onClick={() => {
      if (!scope) { fail("WB_NO_WORKSPACE"); return; }
      void call({ scope, operation: "layout", open: !state?.open || state.collapsed, collapsed: false }).catch(fail);
    }}><PanelRight size={16} /></button>
  </div>;
}
