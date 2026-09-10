import { useEffect, useRef, useState } from "react";
import { File, GitCompareArrows, Globe, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Plus, SquareTerminal, X } from "lucide-react";
import type { WorkbenchEvent, WorkbenchTab } from "../../../shared/workbench";
import { useMoros } from "../store";
import { FilePane } from "./FilePane";
import { FilesPane } from "./FilesPane";
import { TerminalPane } from "./TerminalPane";
import { BrowserPane } from "./BrowserPane";
import { ReviewPane } from "./ReviewPane";
import { WorkbenchStart } from "./WorkbenchStart";
import { useNativeBrowserOcclusion } from "./useNativeBrowserOcclusion";
import { FeedbackDialogs } from "./Feedback";
import { ConfirmationDialog, ResourceDialog } from "./ResourceDialog";
import { focusComposer, sameScope, useWorkbench, useWorkbenchText } from "./useWorkbench";
import "../styles/Workbench/index.css";

export function Workbench({ hidden }: { hidden: boolean }): React.JSX.Element | null {
  const { scope, key, state, ui, call, setUI } = useWorkbench();
  const { wt, errorText } = useWorkbenchText();
  const open = useMoros((state) => state.openWorkbench);
  const terminalStatus = useMoros((state) => state.workbenchTerminalStatus);
  const root = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(window.innerWidth < 1100);
  const [maximum, setMaximum] = useState(800);
  const [dragWidth, setDragWidth] = useState<number>();
  const resizeStart = useRef<{ x: number; width: number } | undefined>(undefined);
  const [dragTab, setDragTab] = useState<string>();
  const [addMenu, setAddMenu] = useState(false);
  const browserOccluded = useNativeBrowserOcclusion();
  const priorWidth = useRef(660);
  const overlay = Boolean(ui.draft || ui.feedbackOpen || ui.confirmation || ui.resourceInput || dragTab || dragWidth !== undefined || addMenu);
  useEffect(() => {
    const resize = (): void => {
      const narrow = window.innerWidth < 1100; setNarrow(narrow);
      const sidebar = document.querySelector(".sidebar")?.getBoundingClientRect().width ?? 0;
      setMaximum(narrow ? Math.max(280, window.innerWidth) : Math.max(280, Math.min(1200, window.innerWidth - sidebar - 400)));
    };
    const observer = new ResizeObserver(resize);
    const main = document.querySelector(".main-col"); if (main) observer.observe(main);
    window.addEventListener("resize", resize); resize();
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [hidden]);
  const fail = (error: unknown): void => { if (scope) setUI(scope, { error: errorText(error) }); };
  const closeTab = async (tabId: string): Promise<void> => {
    if (!scope) return;
    try {
      const reply = await call({ scope, operation: "close", tabId });
      if (reply.confirmation) setUI(scope, { confirmation: { value: reply.confirmation, request: { scope, operation: "close", tabId, confirmation: reply.confirmation.token } } });
    } catch (error) { fail(error); }
  };
  const activate = (id: string): void => { if (scope) void call({ scope, operation: "layout", activeTabId: id, open: true, collapsed: false }).then(() => requestAnimationFrame(() => document.getElementById(`wb-tab-${id}`)?.focus())).catch(fail); };
  const cycle = (direction: number): void => {
    if (!state?.tabs.length) return;
    const index = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
    activate(state.tabs[(index + direction + state.tabs.length) % state.tabs.length].id);
  };
  const reorder = (id: string, target: string): void => {
    if (!scope || !state || id === target) return;
    const order = state.tabs.map((tab) => tab.id).filter((value) => value !== id);
    order.splice(order.indexOf(target), 0, id);
    void call({ scope, operation: "layout", order }).catch(fail);
  };
  useEffect(() => {
    const shortcut = (event: Event): void => {
      const detail = (event as CustomEvent<Extract<WorkbenchEvent, { type: "shortcut" }>>).detail;
      if (!detail || !scope || !sameScope(detail.scope, scope)) return;
      if (detail.action === "close") void closeTab(detail.tabId);
      if (detail.action === "next") cycle(1);
      if (detail.action === "previous") cycle(-1);
      if (detail.action === "chat") focusComposer();
    };
    const keydown = (event: KeyboardEvent): void => {
      if (!scope || hidden || ui.draft || ui.feedbackOpen || ui.confirmation || ui.resourceInput || event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "p" && (event.shiftKey || root.current?.contains(document.activeElement))) { event.preventDefault(); void open({ kind: "files" }); }
        if (key === "t" && !event.shiftKey) { event.preventDefault(); void open({ kind: "browser", url: "" }); }
        if (key === "`") { event.preventDefault(); void open({ kind: "terminal" }); }
        if (key === "g" && event.shiftKey) { event.preventDefault(); void open({ kind: "review", range: "unstaged" }); }
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (!scope) return;
        void call({ scope, operation: "layout", open: true, collapsed: false }).then(() => requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tab"][tabindex="0"], button')?.focus())).catch(fail);
      }
    };
    window.addEventListener("moros:workbench-shortcut", shortcut); window.addEventListener("keydown", keydown);
    return () => { window.removeEventListener("moros:workbench-shortcut", shortcut); window.removeEventListener("keydown", keydown); };
  }, [key, state?.activeTabId, state?.tabs, hidden, ui.draft, ui.feedbackOpen, ui.confirmation, ui.resourceInput]);
  useEffect(() => { setDragWidth(undefined); setDragTab(undefined); setAddMenu(false); }, [key]);
  useEffect(() => {
    if (state?.activeTabId && !hidden) requestAnimationFrame(() => document.getElementById(`wb-tab-${state.activeTabId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }, [state?.activeTabId, hidden]);
  useEffect(() => {
    if (narrow && state?.open && !state.collapsed && !hidden) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tab"][tabindex="0"], button')?.focus());
  }, [narrow, state?.open, state?.collapsed, hidden]);
  if (!scope || !state) return null;
  const width = Math.min(maximum, dragWidth ?? state.width);
  const resizedWidth = (clientX: number): number => {
    const start = resizeStart.current;
    return start ? Math.max(280, Math.min(maximum, start.width + start.x - clientX)) : width;
  };
  const shown = state.open && !hidden;
  const layout = (patch: { open?: boolean; collapsed?: boolean; width?: number }): void => { void call({ scope, operation: "layout", ...patch }).catch(fail); };
  const label = (tab: WorkbenchTab): string => tab.resource.kind === "files" ? wt("files") : tab.resource.kind === "review" ? `${wt("review")} · ${wt(tab.resource.range === "last-turn" ? "lastTurn" : tab.resource.range)}` : tab.resource.kind === "terminal" && /^Terminal \d+$/.test(tab.title) ? tab.title.replace("Terminal", wt("terminal")) : tab.title || wt("newTab");
  const icons = { files: File, file: File, terminal: SquareTerminal, browser: Globe, review: GitCompareArrows };
  return <>
    {shown && narrow && !state.collapsed && <button className="wb-scrim" aria-label={wt("closePanel")} onClick={() => layout({ open: false })} />}
    {shown && !narrow && !state.collapsed && <div className="wb-resizer" role="separator" aria-label={wt("resize")} aria-orientation="vertical" aria-valuemin={280} aria-valuemax={Math.round(maximum)} aria-valuenow={Math.round(width)} tabIndex={0}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); resizeStart.current = { x: event.clientX, width }; setDragWidth(width); }}
      onPointerMove={(event) => { if (resizeStart.current) setDragWidth(resizedWidth(event.clientX)); }}
      onPointerUp={(event) => {
        const finalWidth = resizedWidth(event.clientX);
        event.currentTarget.releasePointerCapture(event.pointerId);
        resizeStart.current = undefined;
        setDragWidth(finalWidth);
        void call({ scope, operation: "layout", width: finalWidth }).catch(fail).finally(() => setDragWidth(undefined));
      }}
      onPointerCancel={() => { resizeStart.current = undefined; setDragWidth(undefined); }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); layout({ width: event.key === "Home" ? 280 : event.key === "End" ? maximum : Math.max(280, Math.min(maximum, width + (event.key === "ArrowLeft" ? 16 : -16))) });
      }} />}
    <aside ref={root} id="moros-workbench" className={`wb-shell${state.collapsed ? " collapsed" : ""}${narrow ? " drawer" : ""}`} hidden={!shown} style={{ width: state.collapsed ? 38 : width }} role={narrow && !state.collapsed ? "dialog" : "complementary"} aria-modal={narrow && !state.collapsed ? true : undefined} aria-label={wt("panel")} onKeyDown={(event) => {
      if (addMenu && event.key === "Escape") { event.preventDefault(); setAddMenu(false); return; }
      if (overlay) return;
      if (narrow && event.key === "Tab" && !event.ctrlKey && !event.metaKey) {
        const elements = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"], a[href]') ?? [])].filter((element) => element.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Tab") { event.preventDefault(); event.stopPropagation(); cycle(event.shiftKey ? -1 : 1); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w" && state.activeTabId) { event.preventDefault(); event.stopPropagation(); void closeTab(state.activeTabId); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (narrow) layout({ open: false }); focusComposer(); }
    }}>
      {state.collapsed ? <button className="wb-expand" aria-label={wt("expand")} title={wt("expand")} onClick={() => layout({ collapsed: false })}><PanelRightOpen size={16} /></button> : <>
        <header className="wb-header">
        <div className="wb-tabs" role="tablist" aria-label={wt("tabs")}>
          {state.tabs.map((tab) => { const Icon = icons[tab.resource.kind]; return <div key={tab.id} role="tab" data-workbench-tab={tab.id} id={`wb-tab-${tab.id}`} aria-controls={`wb-content-${tab.id}`} aria-selected={state.activeTabId === tab.id} tabIndex={state.activeTabId === tab.id ? 0 : -1} draggable title={`${label(tab)} · ${wt("reorder", { title: label(tab) })}`} onClick={() => activate(tab.id)}
            onDragStart={(event) => { event.dataTransfer.setData("text/plain", tab.id); setDragTab(tab.id); }} onDragEnd={() => setDragTab(undefined)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); if (state.tabs.some((tab) => tab.id === id)) reorder(id, tab.id); setDragTab(undefined); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(tab.id); }
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault(); const direction = event.key === "ArrowLeft" ? -1 : 1;
                if (event.altKey && event.shiftKey) { const target = state.tabs[state.tabs.findIndex((item) => item.id === tab.id) + direction]; if (target) reorder(tab.id, target.id); }
                else cycle(direction);
              }
            }}><Icon size={13} /><span>{label(tab)}</span>{tab.resource.kind === "terminal" && <i className="wb-tab-status" data-status={terminalStatus[tab.id]?.status} title={terminalStatus[tab.id]?.status === "running" ? wt("running") : terminalStatus[tab.id]?.status === "exited" ? wt("exited", { code: terminalStatus[tab.id]?.exitCode ?? "—" }) : wt("unavailable")} />}<button aria-label={wt("closeTab", { title: label(tab) })} onClick={(event) => { event.stopPropagation(); void closeTab(tab.id); }}><X size={12} /></button></div>; })}
        </div>
          <button className="wb-add-tab" aria-label={wt("addTab")} title={wt("addTab")} aria-expanded={addMenu} onClick={() => setAddMenu(!addMenu)}><Plus size={15} /></button>
          <span className="wb-spacer" />
          {!narrow && <button aria-label={wt(width === maximum ? "restoreWidth" : "maximize")} title={wt(width === maximum ? "restoreWidth" : "maximize")} onClick={() => { if (width === maximum) layout({ width: priorWidth.current }); else { priorWidth.current = width; layout({ width: maximum }); } }}>{width === maximum ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>}
          <button aria-label={wt("collapse")} title={wt("collapse")} onClick={() => layout({ collapsed: true })}><PanelRightClose size={14} /></button>
          <button aria-label={wt("closePanel")} title={wt("closePanel")} onClick={() => { layout({ open: false }); focusComposer(); }}><X size={14} /></button>
        </header>
        {addMenu && <><button className="wb-menu-dismiss" aria-label={wt("close")} onClick={() => setAddMenu(false)} /><WorkbenchStart menu done={() => setAddMenu(false)} /></>}
        {ui.error && <div className="wb-error" role="alert">{errorText(ui.error)}<button aria-label={wt("close")} onClick={() => setUI(scope, { error: undefined })}><X size={12} /></button></div>}
        <div className="wb-content">
          {!state.tabs.length && <WorkbenchStart />}
          {state.tabs.map((tab) => <div className="wb-tab-content" key={tab.id} id={`wb-content-${tab.id}`} role="tabpanel" aria-labelledby={`wb-tab-${tab.id}`} hidden={state.activeTabId !== tab.id}>
            {tab.resource.kind === "file" && <FilePane scope={scope} tab={tab} />}
            {tab.resource.kind === "files" && <FilesPane scope={scope} active={shown && !state.collapsed && state.activeTabId === tab.id} />}
            {tab.resource.kind === "terminal" && <TerminalPane scope={scope} tab={tab} active={shown && !state.collapsed && state.activeTabId === tab.id} />}
            {tab.resource.kind === "browser" && <BrowserPane scope={scope} tab={tab} active={shown && !state.collapsed && !overlay && !browserOccluded && state.activeTabId === tab.id} />}
            {tab.resource.kind === "review" && <ReviewPane scope={scope} tab={tab} />}
          </div>)}
        </div>
      </>}
    </aside>
    {!hidden && <><FeedbackDialogs /><ResourceDialog /><ConfirmationDialog /></>}
    {!shown && ui.error && !ui.resourceInput && <div className="wb-toast" role="alert">{errorText(ui.error)}<button aria-label={wt("close")} onClick={() => setUI(scope, { error: undefined })}><X size={14} /></button></div>}
  </>;
}
