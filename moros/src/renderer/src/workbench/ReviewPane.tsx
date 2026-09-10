import { useCallback, useEffect, useState } from "react";
import { MessageSquarePlus, RefreshCw } from "lucide-react";
import type { ReviewFile, ReviewHunk, ReviewLine, ReviewRange, ReviewSelection, WorkbenchReview, WorkbenchScope, WorkbenchTab } from "../../../shared/workbench";
import { useMoros } from "../store";
import { useWorkbenchText } from "./useWorkbench";

const rangeKey = (range: ReviewRange) => range === "last-turn" ? "lastTurn" as const : range;
const ownershipKey = (ownership: ReviewFile["ownership"]) => ownership === "agent" ? "agentChange" as const : ownership === "other" ? "otherChange" as const : ownership;

export function ReviewPane({ scope, tab }: { scope: WorkbenchScope; tab: WorkbenchTab }): React.JSX.Element {
  const { wt, errorText } = useWorkbenchText();
  const call = useMoros((state) => state.workbenchCall);
  const open = useMoros((state) => state.openWorkbench);
  const setUI = useMoros((state) => state.setWorkbenchUI);
  const resource = tab.resource.kind === "review" ? tab.resource : { kind: "review" as const, range: "unstaged" as const };
  const [review, setReview] = useState<WorkbenchReview>();
  const [selectedPath, setSelectedPath] = useState(resource.path ?? "");
  const [ref, setRef] = useState(resource.ref ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const reply = await call({ scope, operation: "review", tabId: tab.id, action: "read" });
      setReview(reply.review);
      setSelectedPath((path) => reply.review?.files.some((file) => file.path === path) ? path : reply.review?.files[0]?.path ?? "");
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }, [tab.id]);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (action: "stage" | "unstage" | "prepare-revert", paths?: string[], hunkId?: string): Promise<void> => {
    if (!review) return;
    setBusy(true); setError("");
    const selection: ReviewSelection = { version: review.version, paths, hunkId };
    try {
      const reply = await call({ scope, operation: "review", tabId: tab.id, action, selection });
      if ("confirmation" in reply) setUI(scope, { confirmation: { value: reply.confirmation, request: { scope, operation: "review", tabId: tab.id, action: "revert", confirmation: reply.confirmation.token } } });
      if ("review" in reply) { setReview(reply.review); setSelectedPath((path) => reply.review!.files.some((file) => file.path === path) ? path : reply.review!.files[0]?.path ?? ""); }
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const listener = (event: Event): void => { if ((event as CustomEvent).detail?.tabId === tab.id) void load(); };
    window.addEventListener("moros:review-refresh", listener);
    return () => window.removeEventListener("moros:review-refresh", listener);
  }, [load, tab.id]);
  const file = review?.files.find((file) => file.path === selectedPath);
  const comment = (line: ReviewLine, side: "left" | "right"): void => {
    if (!file || !review) return;
    const number = side === "left" ? line.oldLine : line.newLine;
    if (!number) return;
    setUI(scope, { draft: { id: crypto.randomUUID(), kind: "review", comment: "", selected: true, createdAt: Date.now(),
      source: { path: side === "left" ? file.oldPath ?? file.path : file.path, side, line: number, version: review.version, range: review.range, ref: review.ref }, evidence: line.text,
    } });
  };
  return <section className="wb-review-pane" aria-label={wt("review")}>
    <form className="wb-review-controls" onSubmit={(event) => { event.preventDefault(); void open({ kind: "review", range: resource.range, ref: ref.trim() || undefined }); }}>
      <select aria-label={wt("reviewScope")} value={resource.range} onChange={(event) => void open({ kind: "review", range: event.target.value as ReviewRange })}>
        {(["unstaged", "staged", "branch", "commit", "last-turn"] as const).map((range) => <option key={range} value={range}>{wt(rangeKey(range))}</option>)}
      </select>
      {(resource.range === "branch" || resource.range === "commit") && <><input aria-label={wt("gitRef")} value={ref} onChange={(event) => setRef(event.target.value)} placeholder={resource.range === "commit" ? "HEAD" : wt("gitRef")} /><button>{wt("open")}</button></>}
      <span className="wb-spacer" />
      <button type="button" aria-label={wt("refresh")} disabled={busy} onClick={() => void load()}><RefreshCw size={14} /></button>
    </form>
    <div className="wb-review-summary">
      <span title={review?.root}>{review?.branch ?? ""}</span><span className="wb-diff-add">+{review?.additions ?? 0}</span><span className="wb-diff-del">−{review?.deletions ?? 0}</span><span className="wb-spacer" />
      {resource.range === "unstaged" && <button disabled={busy || !review?.files.length} onClick={() => void mutate("stage")}>{wt("stageAll")}</button>}
      {resource.range === "unstaged" && <button disabled={busy || !review?.files.length} onClick={() => void mutate("prepare-revert")}>{wt("revert")}</button>}
      {resource.range === "staged" && <button disabled={busy || !review?.files.length} onClick={() => void mutate("unstage")}>{wt("unstageAll")}</button>}
    </div>
    {review?.warning && <div className="wb-notice">{errorText(review.warning)}</div>}
    {error && <div className="wb-error" role="alert">{error}<button onClick={() => void load()}>{wt("retry")}</button></div>}
    {!review && busy && <div className="wb-empty" role="status">{wt("loading")}</div>}
    {review && !review.files.length && <div className="wb-empty">{wt("noChanges")}</div>}
    {Boolean(review?.files.length) && <div className="wb-review-body">
      <nav className="wb-review-files" aria-label={wt("changedFiles")}>
        {review!.files.map((file) => <button key={file.path} className={file.path === selectedPath ? "active" : ""} onClick={() => setSelectedPath(file.path)} title={file.path}>
          <span>{file.path}</span><small className={`wb-ownership ${file.ownership}`}>{wt(ownershipKey(file.ownership))}</small><small><b className="wb-diff-add">+{file.additions}</b> <b className="wb-diff-del">−{file.deletions}</b></small>
        </button>)}
      </nav>
      {file && <div className="wb-diff-file">
        <div className="wb-subtoolbar"><span className="wb-path" title={file.path}>{file.path}</span><span className="wb-spacer" />
          {resource.range === "unstaged" && <><button disabled={busy} onClick={() => void mutate("stage", [file.path])}>{wt("stage")}</button><button disabled={busy} onClick={() => void mutate("prepare-revert", [file.path])}>{wt("revert")}</button></>}
          {resource.range === "staged" && <button disabled={busy} onClick={() => void mutate("unstage", [file.path])}>{wt("unstage")}</button>}
        </div>
        {file.binary && <div className="wb-empty">{wt("binary")}</div>}
        {file.hunks.map((hunk) => <DiffHunk key={`${review!.version}-${hunk.id}`} hunk={hunk} file={file} range={resource.range} busy={busy} comment={comment} mutate={(action) => void mutate(action, [file.path], hunk.id)} />)}
      </div>}
    </div>}
  </section>;
}

function DiffHunk({ hunk, file, range, busy, comment, mutate }: {
  hunk: ReviewHunk; file: ReviewFile; range: ReviewRange; busy: boolean;
  comment(line: ReviewLine, side: "left" | "right"): void;
  mutate(action: "stage" | "unstage" | "prepare-revert"): void;
}): React.JSX.Element {
  const { wt } = useWorkbenchText();
  const [limit, setLimit] = useState(500);
  return <details className="wb-diff-hunk" open>
    <summary><code>{hunk.header}</code><span className="wb-spacer" />{file.status !== "renamed" && <>
      {range === "unstaged" && <><button disabled={busy} onClick={(event) => { event.preventDefault(); mutate("stage"); }}>{wt("stage")}</button><button disabled={busy} onClick={(event) => { event.preventDefault(); mutate("prepare-revert"); }}>{wt("revert")}</button></>}
      {range === "staged" && <button disabled={busy} onClick={(event) => { event.preventDefault(); mutate("unstage"); }}>{wt("unstage")}</button>}
    </>}</summary>
    <div className="wb-diff-lines">{hunk.lines.slice(0, limit).map((line, index) => <div className={`wb-diff-line ${line.kind}`} key={index}>
      <button className="wb-line-number" disabled={!line.oldLine} aria-label={wt("commentLine", { file: file.path, side: wt("left"), line: line.oldLine ?? "" })} onClick={() => comment(line, "left")}>{line.oldLine ?? ""}</button>
      <button className="wb-line-number" disabled={!line.newLine} aria-label={wt("commentLine", { file: file.path, side: wt("right"), line: line.newLine ?? "" })} onClick={() => comment(line, "right")}>{line.newLine ?? ""}</button>
      <span className="wb-diff-sign">{line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " "}</span><code>{line.text || " "}</code>
      <button className="wb-line-comment" aria-label={wt("addComment")} onClick={() => comment(line, line.newLine ? "right" : "left")}><MessageSquarePlus size={12} /></button>
    </div>)}</div>
    {hunk.lines.length > limit && <button className="wb-more-lines" onClick={() => setLimit((limit) => limit + 500)}>{wt("moreLines")}</button>}
  </details>;
}
