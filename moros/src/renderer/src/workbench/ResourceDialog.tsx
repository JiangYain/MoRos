import { useState } from "react";
import type { ReviewRange } from "../../../shared/workbench";
import { isDesktop } from "../ipc";
import { WorkbenchDialog } from "./WorkbenchDialog";
import { useWorkbench, useWorkbenchText } from "./useWorkbench";

export function ResourceDialog(): React.JSX.Element | null {
  const { scope, ui, setUI, call } = useWorkbench();
  const { wt, errorText } = useWorkbenchText();
  const [value, setValue] = useState("");
  const [line, setLine] = useState("");
  const [range, setRange] = useState<ReviewRange>("unstaged");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!scope || !ui.resourceInput) return null;
  const kind = ui.resourceInput;
  const close = (): void => { setUI(scope, { resourceInput: undefined }); setValue(""); setLine(""); setError(""); };
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await call({ scope, operation: "open", resource: kind === "file" ? { kind, path: value.trim(), ...(line ? { line: Number(line) } : {}) } : kind === "browser" ? { kind, url: value.trim() } : { kind, range, ref: value.trim() || undefined } });
      close();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  return <WorkbenchDialog title={wt(kind === "file" ? "file" : kind === "browser" ? "openBrowser" : "review")} close={close}>
    <form onSubmit={(event) => void submit(event)}>
      {kind === "review" && <label>{wt("reviewScope")}<select value={range} onChange={(event) => setRange(event.target.value as ReviewRange)}>{(["unstaged", "staged", "branch", "commit", "last-turn"] as const).map((range) => <option key={range} value={range}>{wt(range === "last-turn" ? "lastTurn" : range)}</option>)}</select></label>}
      <label>{wt(kind === "file" ? "path" : kind === "browser" ? "address" : "gitRef")}<input value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} placeholder={kind === "browser" ? "http://localhost:3000" : undefined} /></label>
      {kind === "file" && <label>{wt("line")}<input type="number" min={1} value={line} onChange={(event) => setLine(event.target.value)} /></label>}
      {error && <p className="wb-error" role="alert">{error}</p>}
      <footer>
        {kind === "file" && isDesktop && <button type="button" onClick={() => { setBusy(true); void call({ scope, operation: "pick-file" }).then(close).catch((error: unknown) => setError(errorText(error))).finally(() => setBusy(false)); }}>{wt("files")}…</button>}
        <span className="wb-spacer" /><button type="button" onClick={close}>{wt("cancel")}</button><button className="wb-primary" disabled={busy || (kind !== "review" && !value.trim())}>{wt("open")}</button>
      </footer>
    </form>
  </WorkbenchDialog>;
}

export function ConfirmationDialog(): React.JSX.Element | null {
  const { scope, ui, call, setUI } = useWorkbench();
  const { wt, errorText } = useWorkbenchText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!scope || !ui.confirmation) return null;
  const { value, request } = ui.confirmation;
  const close = (): void => { setUI(scope, { confirmation: undefined }); setError(""); };
  const confirm = async (): Promise<void> => {
    setBusy(true); setError("");
    try {
      await call(request); close();
      if (request.operation === "review") window.dispatchEvent(new CustomEvent("moros:review-refresh", { detail: { tabId: request.tabId } }));
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  return <WorkbenchDialog title={wt(value.kind === "revert" ? "revertConfirm" : "close")} close={close}>
    <p>{errorText(value.message)}</p>
    {value.paths && <ul className="wb-confirm-paths">{value.paths.map((path) => <li key={path}>{path}</li>)}</ul>}
    {value.hunkHeader && <p>{wt("hunk")}: <code>{value.hunkHeader}</code></p>}
    {error && <p className="wb-error" role="alert">{error}</p>}
    <footer><button onClick={close}>{wt("cancel")}</button><button className="wb-danger" onClick={() => void confirm()} disabled={busy}>{wt(value.kind === "revert" ? "revertConfirm" : "close")}</button></footer>
  </WorkbenchDialog>;
}
