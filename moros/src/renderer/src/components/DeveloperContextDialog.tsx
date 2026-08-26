import type { DeveloperContextSnapshot } from "@shared/types";
import { Copy, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { localeFor, useI18n } from "../i18n";

type ContextTab = "system" | "messages";

interface DeveloperContextDialogProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  snapshot: DeveloperContextSnapshot | null;
  onClose(): void;
  onRefresh(): void;
}

export function DeveloperContextDialog({
  open,
  loading,
  error,
  snapshot,
  onClose,
  onRefresh,
}: DeveloperContextDialogProps): React.JSX.Element | null {
  const { language, t } = useI18n();
  const [tab, setTab] = useState<ContextTab>("system");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  const usage = snapshot?.contextTokens == null
    ? t("context.noUsage")
    : `${snapshot.contextTokens.toLocaleString(localeFor(language))} / ${snapshot.contextWindow.toLocaleString(localeFor(language))} tokens`;
  const currentText = tab === "system"
    ? snapshot?.effectiveSystemPrompt ?? ""
    : JSON.stringify(snapshot?.messages ?? [], null, 2);

  const copyCurrent = async (): Promise<void> => {
    await navigator.clipboard.writeText(currentText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_200);
  };

  return createPortal(
    <div className="developer-context-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="developer-context-dialog" role="dialog" aria-modal="true" aria-label={t("context.title")}>
        <header>
          <div>
            <span>{t("context.developer")}</span>
            <h2>{t("context.title")}</h2>
          </div>
          <div className="developer-context-actions">
            <button type="button" aria-label={t("context.refresh")} title={t("common.refresh")} onClick={onRefresh} disabled={loading}>
              <RefreshCw size={15} className={loading ? "spinning" : ""} />
            </button>
            <button type="button" aria-label={t("context.close")} title={t("common.close")} onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="developer-context-summary">
          <div><span>{t("context.session")}</span><b>{snapshot?.sessionId || t("context.notCreated")}</b></div>
          <div><span>{t("context.context")}</span><b>{usage}</b></div>
          <div><span>{t("context.usage")}</span><b>{snapshot?.contextPercent == null ? t("common.unknown") : `${snapshot.contextPercent.toFixed(1)}%`}</b></div>
        </div>

        <nav aria-label={t("context.title")}>
          {([
            ["system", t("context.systemPrompt")],
            ["messages", t("context.messages", { count: snapshot?.messages.length ?? 0 })],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="developer-context-content">
          {loading && !snapshot ? <p className="developer-context-state">{t("context.loading")}</p> : null}
          {error ? <p className="developer-context-state error">{error}</p> : null}
          {!loading || snapshot ? <pre>{currentText}</pre> : null}
          <button type="button" className="developer-context-copy" onClick={() => void copyCurrent()}>
            <Copy size={13} /> {copied ? t("common.copied") : t("context.copyCurrent")}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
