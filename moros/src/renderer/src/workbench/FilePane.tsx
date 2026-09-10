import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, FolderTree, MessageSquarePlus, Minus, Plus, RefreshCw, WrapText } from "lucide-react";
import type { WorkbenchFile, WorkbenchScope, WorkbenchTab } from "../../../shared/workbench";
import { useMoros } from "../store";
import { Markdown } from "../components/Markdown";
import { CodeView, type CodeViewHandle } from "./CodeView";
import { PdfView } from "./PdfView";
import { FileTree } from "./FileTree";
import { useWorkbenchText } from "./useWorkbench";

export function FilePane({ scope, tab }: { scope: WorkbenchScope; tab: WorkbenchTab }): React.JSX.Element {
  const { wt, errorText } = useWorkbenchText();
  const call = useMoros((state) => state.workbenchCall);
  const setUI = useMoros((state) => state.setWorkbenchUI);
  const changes = useMoros((state) => state.workbenchChangedFiles?.[tab.id] ?? 0);
  const [file, setFile] = useState<WorkbenchFile>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadedChange, setLoadedChange] = useState(0);
  const [mode, setMode] = useState<"source" | "preview">(tab.resource.kind === "file" && tab.resource.line ? "source" : "preview");
  const [tree, setTree] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [zoom, setZoom] = useState(1);
  const code = useRef<CodeViewHandle>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await call({ scope, operation: "file", tabId: tab.id, action: "read" });
      setFile(response.file); setLoadedChange(useMoros.getState().workbenchChangedFiles?.[tab.id] ?? 0);
    } catch (error) { setError(errorText(error)); }
    finally { setLoading(false); }
  }, [tab.id, scope.workspaceDir, scope.sessionId, call]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab.resource.kind === "file" && tab.resource.line) setMode("source"); }, [tab.resource]);
  const source = file && (mode === "source" || file.format === "text");
  const annotation = (): void => {
    if (!file) return;
    const selection = code.current?.selection();
    setUI(scope, { draft: { id: crypto.randomUUID(), kind: "file", comment: "", selected: true, createdAt: Date.now(),
      source: { path: file.path, version: file.version, line: selection?.line, endLine: selection?.endLine },
      evidence: selection?.text ?? file.name,
      ...(file.mime === "image/png" && file.dataUrl && file.dataUrl.length < 6_000_000 ? { screenshot: file.dataUrl } : {}),
    } });
  };
  const external = (): void => { void call({ scope, operation: "file", tabId: tab.id, action: "open-system" }).catch((error: unknown) => setError(errorText(error))); };
  return <section className="wb-file-pane" aria-label={file?.name ?? tab.title}>
    <div className="wb-subtoolbar">
      <button aria-label={wt("browseFiles")} title={wt("browseFiles")} onClick={() => void useMoros.getState().openWorkbench({ kind: "files" })}><ArrowLeft size={14} /></button>
      <span className="wb-path" title={file?.path}>{file?.name ?? tab.title}</span>
      {file && ["markdown", "html", "document"].includes(file.format) && <div className="wb-view-toggle">
        <button aria-pressed={mode === "source"} onClick={() => setMode("source")}>{wt("source")}</button>
        <button aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>{wt("preview")}</button>
      </div>}
      <span className="wb-spacer" />
      <button aria-label={wt("fileTree")} title={wt("fileTree")} aria-pressed={tree} onClick={() => setTree(!tree)}><FolderTree size={14} /></button>
      {source && <button aria-label={wt("wrap")} aria-pressed={wrap} onClick={() => setWrap(!wrap)}><WrapText size={14} /></button>}
      <button aria-label={wt("addComment")} title={wt("addComment")} onClick={annotation} disabled={!file}><MessageSquarePlus size={14} /></button>
      <button aria-label={wt("refresh")} title={wt("refresh")} onClick={() => void load()} disabled={loading}><RefreshCw size={14} /></button>
      <button aria-label={wt("external")} title={wt("external")} onClick={external}><ExternalLink size={14} /></button>
    </div>
    {changes > loadedChange && <div className="wb-notice">{wt("changed")} <button onClick={() => void load()}>{wt("refresh")}</button></div>}
    {error && <div role="alert" className="wb-error">{error}<button onClick={() => void load()}>{wt("retry")}</button></div>}
    {loading && !file && <div className="wb-empty" role="status">{wt("loading")}</div>}
    {file?.truncated && <div className="wb-notice">{wt("truncated")}</div>}
    {file?.previewAssetsRestricted && !source && <div className="wb-notice">{wt("externalHtml")}</div>}
    <div className="wb-file-body"><div className="wb-file-view">
    {file && source && <CodeView ref={code} text={file.text ?? ""} path={file.path} wrap={wrap} line={tab.resource.kind === "file" ? tab.resource.line : undefined} />}
    {file && !source && file.format === "markdown" && <div className="wb-markdown"><Markdown text={file.text ?? ""} sourcePath={file.path} /></div>}
    {file && !source && file.format === "html" && <><div className="wb-subtoolbar"><span>{wt("htmlPreview")}</span><span className="wb-spacer" /><button onClick={() => void useMoros.getState().openWorkbench({ kind: "browser", url: file.previewUrl! })}>{wt("interactivePreview")}</button></div><iframe className="wb-document-frame" title={file.name} sandbox="" src={file.previewUrl} /></>}
    {file && !source && file.format === "document" && <iframe className="wb-document-frame" title={file.name} sandbox="" srcDoc={`<!doctype html><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{font:16px/1.6 system-ui;padding:20px;overflow-wrap:anywhere}img{max-width:100%}</style>${file.previewHtml ?? ""}`} />}
    {file?.format === "pdf" && <PdfView dataUrl={file.dataUrl!} />}
    {file?.format === "image" && <>
      <div className="wb-subtoolbar"><button aria-label={wt("zoomOut")} onClick={() => setZoom((zoom) => Math.max(0.25, zoom - 0.25))}><Minus size={14} /></button><button onClick={() => setZoom(1)}>{wt("fit")}</button><button aria-label={wt("zoomIn")} onClick={() => setZoom((zoom) => Math.min(4, zoom + 0.25))}><Plus size={14} /></button></div>
      <div className="wb-image"><img src={file.dataUrl} alt={file.name} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} /></div>
    </>}
    {file?.format === "unsupported" && <div className="wb-empty"><p>{errorText(file.reason ?? "WB_UNSUPPORTED_FORMAT")}</p><button onClick={external}>{wt("external")}</button></div>}
    </div>{tree && <FileTree scope={scope} selected={file?.path} />}</div>
  </section>;
}
