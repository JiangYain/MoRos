import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { clampSidebarWidth, parseSidebarWidth, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from "../sidebar-width";

const STORAGE_KEY = "compass.sidebar.width.v1";
interface ResizeState { pointerId: number; startX: number; startWidth: number; currentWidth: number }

export function useSidebarResize(): { width: number; resizing: boolean; resizer: React.JSX.Element } {
  const { t } = useI18n();
  const resizeRef = useRef<ResizeState | null>(null);
  const [width, setWidth] = useState(() => {
    try { return parseSidebarWidth(window.localStorage.getItem(STORAGE_KEY)); }
    catch { return SIDEBAR_DEFAULT_WIDTH; }
  });
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("sidebar-resizing", resizing);
    return () => document.body.classList.remove("sidebar-resizing");
  }, [resizing]);
  const save = (value: number): void => {
    const next = clampSidebarWidth(value);
    setWidth(next);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* In-memory resizing remains available. */ }
  };
  const finish = (): void => {
    const state = resizeRef.current;
    if (!state) return;
    resizeRef.current = null;
    setResizing(false);
    save(state.currentWidth);
  };
  const end = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finish();
  };
  const keyboard = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.shiftKey ? 24 : 8;
    if (event.key === "ArrowLeft") { event.preventDefault(); save(width - delta); }
    else if (event.key === "ArrowRight") { event.preventDefault(); save(width + delta); }
    else if (event.key === "Home") { event.preventDefault(); save(SIDEBAR_MIN_WIDTH); }
    else if (event.key === "End") { event.preventDefault(); save(SIDEBAR_MAX_WIDTH); }
  };
  const resizer = (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-label={t("sidebar.resize")}
      aria-orientation="vertical"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onDoubleClick={() => save(SIDEBAR_DEFAULT_WIDTH)}
      onKeyDown={keyboard}
      onLostPointerCapture={finish}
      onPointerCancel={end}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, currentWidth: width };
        setResizing(true);
      }}
      onPointerMove={(event) => {
        const state = resizeRef.current;
        if (!state || state.pointerId !== event.pointerId) return;
        state.currentWidth = clampSidebarWidth(state.startWidth + event.clientX - state.startX);
        setWidth(state.currentWidth);
      }}
      onPointerUp={end}
    />
  );
  return { width, resizing, resizer };
}
