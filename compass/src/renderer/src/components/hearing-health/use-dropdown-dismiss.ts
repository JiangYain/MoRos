import { useEffect } from "react";

/** Close a lightweight dropdown on outside pointer-down or Escape. */
export function useDropdownDismiss(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, onClose, open]);
}
