import type { UiApprovalRequest } from "@shared/types";
import { Terminal } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { ignoreCommandFailure, useCompass } from "../../store";
import { AgentActivityOrb } from "../AgentActivityOrb";
import { summarizeThreadArgs } from "./thread-format";
import { THREAD_ENTRANCE } from "./ThreadMessages";

export function ApprovalRequest({
  request,
  shortcutActive,
  showExplanationOrb,
}: {
  request: UiApprovalRequest;
  shortcutActive: boolean;
  showExplanationOrb: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const resolveApproval = useCompass((state) => state.resolveApproval);
  const [responding, setResponding] = useState<"allow" | "deny" | null>(null);
  const commandText = summarizeThreadArgs(request.args) || request.detail.split(/\r?\n/).slice(1).join(" ");
  const explanation = request.explanation?.trim();
  const explanationState = explanation
    ? "ready"
    : request.explanationPending === false
      ? "unavailable"
      : "pending";
  const explanationText = explanation ?? t("thread.commandExplanationUnavailable");

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const metaKeyLabel = isMac ? "⌘↵" : "Ctrl+↵";

  const respond = useCallback((allowed: boolean): void => {
    if (responding !== null) return;
    setResponding(allowed ? "allow" : "deny");
    ignoreCommandFailure(resolveApproval(request.id, allowed).finally(() => setResponding(null)));
  }, [responding, request.id, resolveApproval]);

  useEffect(() => {
    if (!shortcutActive) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (responding !== null) return;
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || target.matches("input, textarea, select"))
      ) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        respond(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        respond(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [responding, respond, shortcutActive]);

  return (
    <motion.section className="approval-request" aria-label={t("thread.actionApproval")} {...THREAD_ENTRANCE}>
      <div className="approval-request-header">
        <div className="approval-request-badge">
          <Terminal size={11} strokeWidth={2.2} aria-hidden />
          <span>{t("thread.actionApproval")}</span>
        </div>
        <strong>{request.message}</strong>
      </div>
      <pre className="approval-request-command">{commandText || request.toolName}</pre>
      <div
        className={`approval-request-explanation ${explanationState}`}
        aria-live="polite"
        aria-busy={explanationState === "pending"}
      >
        {explanationState === "pending"
          ? showExplanationOrb
            ? <AgentActivityOrb state="solving" className="approval-request-explanation-orb" />
            : <span>{t("common.loading")}</span>
          : explanationText}
      </div>
      <div className="approval-request-actions">
        <button
          type="button"
          className="approval-deny"
          disabled={responding !== null}
          onClick={() => respond(false)}
        >
          <span>{responding === "deny" ? t("thread.denying") : t("thread.deny")}</span>
          {shortcutActive && <kbd className="approval-kbd">Esc</kbd>}
        </button>
        <button
          type="button"
          className="approval-allow"
          disabled={responding !== null}
          onClick={() => respond(true)}
        >
          <span>{responding === "allow" ? t("thread.allowing") : t("thread.allowOnce")}</span>
          {shortcutActive && <kbd className="approval-kbd">{metaKeyLabel}</kbd>}
        </button>
      </div>
    </motion.section>
  );
}
