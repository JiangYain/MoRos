import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useWorkbenchText } from "./useWorkbench";

GlobalWorkerOptions.workerSrc = pdfWorker;
export function PdfView({ dataUrl }: { dataUrl: string }): React.JSX.Element {
  const { wt } = useWorkbenchText();
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useEffect(() => {
    const data = Uint8Array.from(atob(dataUrl.split(",")[1]), (value) => value.charCodeAt(0));
    const loading = getDocument({ data, enableXfa: false });
    let active = true;
    void loading.promise.then((document) => { if (active) { setDocument(document); setPage(1); } }).catch((error: unknown) => { if (active) setError(String(error)); });
    return () => { active = false; void loading.destroy(); };
  }, [dataUrl]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    void document.getPage(page).then((pdfPage) => {
      if (!active || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.max(0.1, (width - 28) / base.width) * zoom;
      const viewport = pdfPage.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      canvas.current.width = Math.floor(viewport.width * dpr); canvas.current.height = Math.floor(viewport.height * dpr);
      canvas.current.style.width = `${viewport.width}px`; canvas.current.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvas: canvas.current, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
      return task.promise;
    }).catch((error: unknown) => { if (active && !String(error).includes("RenderingCancelled")) setError(String(error)); });
    return () => { active = false; task?.cancel(); };
  }, [document, page, zoom, width]);
  return <div className="wb-pdf" ref={host}>
    <div className="wb-subtoolbar">
      <button aria-label={wt("previousPage")} disabled={page <= 1} onClick={() => setPage((page) => page - 1)}><ChevronLeft size={14} /></button>
      <span>{wt("page", { page, total: document?.numPages ?? "…" })}</span>
      <button aria-label={wt("nextPage")} disabled={!document || page >= document.numPages} onClick={() => setPage((page) => page + 1)}><ChevronRight size={14} /></button>
      <span className="wb-spacer" />
      <button aria-label={wt("zoomOut")} onClick={() => setZoom((zoom) => Math.max(0.5, zoom - 0.25))}><Minus size={14} /></button>
      <button onClick={() => setZoom(1)}>{wt("fit")}</button>
      <button aria-label={wt("zoomIn")} onClick={() => setZoom((zoom) => Math.min(4, zoom + 0.25))}><Plus size={14} /></button>
    </div>
    {error && <div className="wb-error" role="alert">{error}</div>}
    <div className="wb-pdf-pages"><canvas ref={canvas} role="img" aria-label={wt("page", { page, total: document?.numPages ?? "…" })} /></div>
  </div>;
}
