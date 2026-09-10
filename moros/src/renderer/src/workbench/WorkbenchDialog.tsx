import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { focusComposer, useWorkbenchText } from "./useWorkbench";

export function WorkbenchDialog({ title, children, close }: { title: string; children: ReactNode; close(): void }): React.JSX.Element {
  const { wt } = useWorkbenchText();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (root.current?.querySelector<HTMLElement>("textarea, input, select") ?? root.current?.querySelector<HTMLElement>("button"))?.focus();
    return () => { if (previous?.isConnected) previous.focus(); else focusComposer(); };
  }, []);
  return <div className="wb-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="wb-dialog" role="dialog" aria-modal="true" aria-label={title} ref={root} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== "Tab") return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter((element) => element.offsetParent !== null);
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    }}>
      <header><h2>{title}</h2><button aria-label={wt("close")} onClick={close}><X size={16} /></button></header>
      {children}
    </div>
  </div>;
}
