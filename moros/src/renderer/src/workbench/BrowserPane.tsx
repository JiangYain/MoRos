import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, MousePointer2, RefreshCw, Scan, X } from "lucide-react";
import type { WorkbenchScope, WorkbenchTab } from "../../../shared/workbench";
import { isDesktop } from "../ipc";
import { useMoros } from "../store";
import { useWorkbenchText } from "./useWorkbench";

export function BrowserPane({ scope, tab, active }: { scope: WorkbenchScope; tab: WorkbenchTab; active: boolean }): React.JSX.Element {
  const { wt, errorText } = useWorkbenchText();
  const call = useMoros((state) => state.workbenchCall);
  const browser = useMoros((state) => state.workbenchBrowsers?.[tab.id]);
  const initialUrl = tab.resource.kind === "browser" ? tab.resource.url : "";
  const [address, setAddress] = useState(initialUrl);
  const [error, setError] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const addressRef = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const fail = (error: unknown): void => setError(errorText(error));
  useEffect(() => { if (document.activeElement !== addressRef.current) setAddress(browser?.url ?? initialUrl); }, [browser?.url, initialUrl]);
  useEffect(() => {
    if (!isDesktop) return;
    void call({ scope, operation: "browser", tabId: tab.id, action: "inspect" }).catch(fail);
  }, [tab.id]);
  useEffect(() => {
    if (!isDesktop || !viewport.current) return;
    const element = viewport.current;
    const update = (): void => {
      const rect = element.getBoundingClientRect();
      void call({ scope, operation: "browser", tabId: tab.id, action: "bounds", bounds: {
        x: Math.max(0, rect.x), y: Math.max(0, rect.y), width: rect.width, height: rect.height,
        visible: active && Boolean(browser?.url) && rect.width > 0 && rect.height > 0 && !error && !browser?.error,
      } }).catch(fail);
    };
    const observer = new ResizeObserver(update); observer.observe(element);
    window.addEventListener("resize", update); update();
    return () => {
      observer.disconnect(); window.removeEventListener("resize", update);
      void call({ scope, operation: "browser", tabId: tab.id, action: "bounds", bounds: { x: 0, y: 0, width: 0, height: 0, visible: false } }).catch(() => undefined);
    };
  }, [tab.id, active, error, browser?.error, browser?.url, consoleOpen]);
  useEffect(() => { if (active && !initialUrl) addressRef.current?.focus(); }, [active]);
  const navigate = (event: React.FormEvent): void => {
    event.preventDefault(); setError("");
    void call({ scope, operation: "browser", tabId: tab.id, action: "navigate", url: address }).catch(fail);
  };
  const action = (action: "back" | "forward" | "reload"): void => {
    setError(""); void call({ scope, operation: "browser", tabId: tab.id, action }).catch(fail);
  };
  useEffect(() => {
    const onShortcut = (event: Event): void => {
      const detail = (event as CustomEvent).detail;
      if (detail?.tabId === tab.id && detail.action === "address") { addressRef.current?.focus(); addressRef.current?.select(); }
    };
    window.addEventListener("moros:workbench-shortcut", onShortcut);
    return () => window.removeEventListener("moros:workbench-shortcut", onShortcut);
  }, [tab.id]);
  return <section className="wb-browser-pane" aria-label={browser?.title || tab.title}>
    <form className="wb-browser-address" onSubmit={navigate}>
      <button type="button" aria-label={wt("back")} disabled={!isDesktop || !browser?.canGoBack} onClick={() => action("back")}><ArrowLeft size={14} /></button>
      <button type="button" aria-label={wt("forward")} disabled={!isDesktop || !browser?.canGoForward} onClick={() => action("forward")}><ArrowRight size={14} /></button>
      <button type="button" aria-label={wt("reload")} disabled={!isDesktop} onClick={() => action("reload")}><RefreshCw size={14} /></button>
      <input ref={addressRef} aria-label={wt("address")} placeholder={wt("enterUrl")} value={address} onChange={(event) => setAddress(event.target.value)} disabled={!isDesktop} spellCheck={false} />
      <button type="submit" disabled={!isDesktop}>{wt("go")}</button>
    </form>
    {!isDesktop ? <div className="wb-empty"><p>{wt("browserWebLimit")}</p><a href={initialUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />{wt("openExternalBrowser")}</a></div> : <>
      {browser?.url && <div className="wb-subtoolbar">
        <button aria-pressed={browser?.annotationMode === "element"} onClick={() => void call({ scope, operation: "browser", tabId: tab.id, action: "annotate", mode: "element" }).catch(fail)}><MousePointer2 size={14} />{wt("annotateElement")}</button>
        <button aria-label={wt("annotateRegion")} title={wt("annotateRegion")} aria-pressed={browser?.annotationMode === "region"} onClick={() => void call({ scope, operation: "browser", tabId: tab.id, action: "annotate", mode: "region" }).catch(fail)}><Scan size={14} /></button>
        <span className="wb-spacer" />
        {browser?.loading && <span role="status">{wt("loading")}</span>}
        <button onClick={() => setConsoleOpen(!consoleOpen)} aria-expanded={consoleOpen}>{wt("consoleErrors", { count: browser?.consoleErrors.length ?? 0 })}</button>
      </div>}
      {browser?.annotationMode && <div className="wb-notice">{wt("annotationHint")}<button aria-label={wt("cancel")} onClick={() => void call({ scope, operation: "browser", tabId: tab.id, action: "cancel-annotation" }).catch(fail)}><X size={14} /></button></div>}
      {(error || browser?.error) && <div className="wb-error" role="alert">{error || errorText(browser?.error)}<button onClick={() => action("reload")}>{wt("retry")}</button></div>}
      <div className="wb-browser-viewport" ref={viewport} aria-label={wt("browser")}>{!browser?.url && <div className="wb-browser-start"><Globe size={26} strokeWidth={1.3} /><span>{wt("browseStart")}</span><small>{wt("enterUrl")}</small></div>}</div>
      {consoleOpen && <div className="wb-browser-console">{browser?.consoleErrors.map((entry, index) => <div key={`${entry.at}-${index}`}><code>{entry.message}</code><small>{entry.source}:{entry.line}</small></div>)}</div>}
      <div className="wb-browser-isolation">{wt("browserIsolation")}</div>
    </>}
  </section>;
}
