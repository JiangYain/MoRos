import { MessageSquare, Trash2 } from "lucide-react";
import { useState } from "react";
import type { WorkbenchFeedback } from "../../../shared/workbench";
import { WorkbenchDialog } from "./WorkbenchDialog";
import { sourceLabel, useWorkbench, useWorkbenchText } from "./useWorkbench";
import { useMoros } from "../store";

export function FeedbackTrigger(): React.JSX.Element | null {
  const { scope, feedback, setUI } = useWorkbench();
  const { wt } = useWorkbenchText();
  if (!scope || !feedback.length) return null;
  const count = feedback.filter((item) => item.selected).length;
  const sources = [...new Set(feedback.map((item) => sourceLabel(item.source)))].slice(0, 2).join(" · ");
  return <button className="wb-feedback-trigger" onClick={() => setUI(scope, { feedbackOpen: true })} aria-label={wt("feedbackCount", { count })}>
    <MessageSquare size={13} /><span>{wt("feedbackCount", { count })}</span><small>{sources}</small>
  </button>;
}

export function FeedbackDialogs(): React.JSX.Element | null {
  const { scope, feedback, ui, setUI, call, editFeedback } = useWorkbench();
  const { wt, errorText } = useWorkbenchText();
  const supportsImages = useMoros((state) => state.stats?.model?.supportsImages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!scope) return null;
  if (ui.draft) {
    const draft = ui.draft;
    const close = (): void => { setError(""); setUI(scope, { draft: undefined }); };
    const save = async (event: React.FormEvent): Promise<void> => {
      event.preventDefault(); setBusy(true); setError("");
      try { await call({ scope, operation: "feedback", action: "add", feedback: draft }); close(); }
      catch (error) { setError(errorText(error)); }
      finally { setBusy(false); }
    };
    return <WorkbenchDialog title={wt("addComment")} close={close}>
      <form onSubmit={(event) => void save(event)}>
        <p className="wb-feedback-source">{sourceLabel(draft.source)}{draft.source.side ? ` · ${wt(draft.source.side)}` : ""}</p>
        {draft.screenshot && <img className="wb-feedback-screenshot" src={draft.screenshot} alt={wt("screenshot")} />}
        {draft.evidence && <details><summary>{wt("evidence")}</summary><pre>{draft.evidence}</pre></details>}
        <label>{wt("comment")}<textarea rows={4} value={draft.comment} onChange={(event) => setUI(scope, { draft: { ...draft, comment: event.target.value } })} /></label>
        <label className="wb-checkbox"><input type="checkbox" checked={draft.selected} onChange={(event) => setUI(scope, { draft: { ...draft, selected: event.target.checked } })} />{wt("include")}</label>
        {error && <p className="wb-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={close}>{wt("cancel")}</button><button className="wb-primary" disabled={busy || !draft.comment.trim()}>{wt("saveFeedback")}</button></footer>
      </form>
    </WorkbenchDialog>;
  }
  if (!ui.feedbackOpen) return null;
  return <WorkbenchDialog title={wt("feedback")} close={() => { setError(""); setUI(scope, { feedbackOpen: false }); }}>
    {!feedback.length && <p className="wb-empty">{wt("feedbackEmpty")}</p>}
    {!supportsImages && feedback.some((item) => item.screenshot) && <p className="wb-notice">{wt("textOnlyFeedback")}</p>}
    <div className="wb-feedback-list">{feedback.map((item) => <article key={item.id}>
      <label className="wb-checkbox"><input type="checkbox" checked={item.selected} onChange={(event) => void editFeedback(item.id, event.target.checked).catch((error: unknown) => setError(errorText(error)))} /><span>{sourceLabel(item.source)}</span></label>
      <button className="wb-feedback-remove" aria-label={wt("removeFeedback")} onClick={() => void editFeedback(item.id).catch((error: unknown) => setError(errorText(error)))}><Trash2 size={13} /></button>
      <p>{item.comment}</p>
      {item.screenshot && <details><summary>{wt("screenshot")}</summary><img src={item.screenshot} alt={wt("screenshot")} /></details>}
      {item.evidence && <details><summary>{wt("evidence")}</summary><pre>{item.evidence}</pre></details>}
    </article>)}</div>
    {error && <p className="wb-error" role="alert">{error}</p>}
  </WorkbenchDialog>;
}

export function SentFeedback({ items }: { items?: WorkbenchFeedback[] }): React.JSX.Element | null {
  const { wt } = useWorkbenchText();
  if (!items?.length) return null;
  return <details className="wb-sent-feedback"><summary><MessageSquare size={12} />{wt("sentFeedback", { count: items.length })}</summary>
    {items.map((item) => <div key={item.id}><small>{sourceLabel(item.source)}</small><p>{item.comment}</p></div>)}
  </details>;
}
