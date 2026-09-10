import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, File, FilePlus2, FileSearch, Folder, FolderOpen, Search } from "lucide-react";
import type { WorkbenchDirectory, WorkbenchScope } from "../../../shared/workbench";
import { parseWorkbenchLink } from "../../../shared/workbench-links";
import { useMoros } from "../store";
import { isDesktop } from "../ipc";
import { FileTree } from "./FileTree";
import { WorkbenchDialog } from "./WorkbenchDialog";
import { useWorkbench, useWorkbenchText } from "./useWorkbench";

export function FilesPane({ scope, active }: { scope: WorkbenchScope; active: boolean }): React.JSX.Element {
  const { state, call, setUI } = useWorkbench();
  const { wt, errorText } = useWorkbenchText();
  const open = useMoros((state) => state.openWorkbench);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (active) input.current?.focus(); }, [active]);
  const [history, setHistory] = useState<Array<string | undefined>>([undefined]);
  const [position, setPosition] = useState(0);
  const folder = history[position];
  const [result, setResult] = useState<WorkbenchDirectory>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState<"file" | "folder">();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const basename = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
  useEffect(() => {
    if (!query.trim() && !folder) { setResult(undefined); setError(""); setLoading(false); return; }
    let disposed = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void call({ scope, operation: "directory", path: folder, query: query.trim() || undefined }).then((reply) => {
        if (!disposed) { setResult(reply.directory); setError(""); }
      }).catch((error: unknown) => { if (!disposed) setError(errorText(error)); }).finally(() => { if (!disposed) setLoading(false); });
    }, query ? 180 : 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [scope.sessionId, scope.workspaceDir, query, folder, revision]);
  const navigate = (path: string): void => {
    setHistory((current) => [...current.slice(0, position + 1), path]); setPosition(position + 1); setQuery("");
  };
  const choose = (entry: WorkbenchDirectory["entries"][number]): void => { if (entry.directory) navigate(entry.path); else void open({ kind: "file", path: entry.path }); };
  const create = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await call({ scope, operation: "create-entry", path: `${folder ?? scope.workspaceDir}/${name.trim()}`, directory: creating === "folder" });
      setCreating(undefined); setName(""); setRevision((value) => value + 1);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  const recent = (state?.recentFiles ?? []).map((entry) => ({ ...entry, name: basename(entry.path), directory: false }));
  const entries = query.trim() || folder ? result?.entries ?? [] : recent;
  return <section className="wb-files-pane" aria-label={wt("files")}>
    <div className="wb-subtoolbar">
      <button aria-label={wt("back")} disabled={position === 0} onClick={() => { setPosition(position - 1); setQuery(""); }}><ArrowLeft size={14} /></button>
      <button aria-label={wt("forward")} disabled={position === history.length - 1} onClick={() => { setPosition(position + 1); setQuery(""); }}><ArrowRight size={14} /></button>
      {folder && <span className="wb-path" title={folder}>{basename(folder)}</span>}
      <span className="wb-spacer" />
      <button aria-label={wt("path")} title={wt("path")} onClick={() => setUI(scope, { resourceInput: "file" })}><FileSearch size={14} /></button>
      {isDesktop && <button aria-label={wt("file")} title={wt("file")} onClick={() => void call({ scope, operation: "pick-file" }).catch((error: unknown) => setError(errorText(error)))}><FolderOpen size={14} /></button>}
    </div>
    <div className="wb-files-layout">
      <div className="wb-files-home">
        <form className="wb-files-search" role="search" onSubmit={(event) => {
          event.preventDefault();
          const direct = parseWorkbenchLink(query);
          if (direct?.kind === "file" && (/[\\/]|:\d+$|#L\d+$/.test(query) || !entries.length)) void open(direct);
          else if (entries[0]) choose(entries[0]);
        }}><Search size={14} /><input ref={input} aria-label={wt("filesSearch")} placeholder={wt("filesSearch")} value={query} onChange={(event) => setQuery(event.target.value)} spellCheck={false} /></form>
        <button className="wb-files-new" onClick={() => { setCreating("file"); setError(""); }}><FilePlus2 size={15} />{wt("newFile")}</button>
        <div className="wb-files-section-label">{query.trim() ? wt("files") : folder ? basename(folder) : wt("recents")}</div>
        {loading && <p className="wb-files-hint" role="status">{wt("loading")}</p>}
        {error && !creating && <p className="wb-error" role="alert">{error}</p>}
        {!loading && !entries.length && <p className="wb-files-hint">{wt(query || folder ? "noFiles" : "noRecents")}</p>}
        <div className="wb-files-results">{entries.map((entry) => <button key={entry.path} title={entry.path} onClick={() => choose(entry)}>{entry.directory ? <Folder size={14} /> : <File size={14} />}<span>{entry.name}</span><small>{entry.path.replaceAll("\\", "/").replace(scope.workspaceDir.replaceAll("\\", "/"), "").replace(/\/[^/]+$/, "").replace(/^\//, "")}</small></button>)}</div>
        {result?.truncated && <p className="wb-files-hint">{wt("searchFilesLimit")}</p>}
      </div>
      <FileTree key={revision} scope={scope} rootPath={folder} onCreate={(directory) => { setCreating(directory ? "folder" : "file"); setError(""); }} />
    </div>
    {creating && <WorkbenchDialog title={wt(creating === "file" ? "newFile" : "newFolder")} close={() => { setCreating(undefined); setName(""); setError(""); }}>
      <form onSubmit={(event) => void create(event)}><label>{wt("entryName")}<input value={name} onChange={(event) => setName(event.target.value)} spellCheck={false} /></label>
        {error && <p className="wb-error" role="alert">{error}</p>}
        <footer><button type="button" onClick={() => setCreating(undefined)}>{wt("cancel")}</button><button className="wb-primary" disabled={busy || !name.trim()}>{wt("create")}</button></footer>
      </form>
    </WorkbenchDialog>}
  </section>;
}
