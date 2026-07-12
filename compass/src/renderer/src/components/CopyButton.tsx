import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  className?: string;
  label?: string;
  showLabel?: boolean;
  text: string;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Sandboxed or unfocused Electron surfaces can reject the modern API.
      // Fall back to the document copy command below.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command failed");
}

export function CopyButton({
  className = "",
  label = "复制",
  showLabel = false,
  text,
}: CopyButtonProps): React.JSX.Element {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const resetRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
  }, []);

  const copy = async (): Promise<void> => {
    try {
      await copyText(text);
      setState("copied");
    } catch {
      setState("error");
    }
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setState("idle"), 1600);
  };

  const accessibleLabel = state === "copied" ? "已复制" : state === "error" ? "复制失败" : label;
  return (
    <button
      type="button"
      className={`copy-button${className ? ` ${className}` : ""}${state !== "idle" ? ` ${state}` : ""}`}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      disabled={!text}
      onClick={() => void copy()}
    >
      {state === "copied" ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.65} />}
      {showLabel && <span>{accessibleLabel}</span>}
    </button>
  );
}
