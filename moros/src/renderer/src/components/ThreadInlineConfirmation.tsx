import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  remainingConfirmationSeconds,
  startThreadConfirmationTimeout,
  type ThreadConfirmationAction,
  THREAD_CONFIRMATION_DURATION_MS,
} from "./thread-confirmation";

interface ThreadInlineConfirmationProps {
  action: ThreadConfirmationAction;
  busy: boolean;
  sessionTitle: string;
  onCancel(): void;
  onConfirm(): void;
}

const COUNTDOWN_TICK_MS = 100;

export function ThreadInlineConfirmation({
  action,
  busy,
  sessionTitle,
  onCancel,
  onConfirm,
}: ThreadInlineConfirmationProps): React.JSX.Element {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const deadlineRef = useRef(Date.now() + THREAD_CONFIRMATION_DURATION_MS);
  const cancelAutoCommitRef = useRef<(() => void) | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);
  const onConfirmRef = useRef(onConfirm);
  const [remainingSeconds, setRemainingSeconds] = useState(
    remainingConfirmationSeconds(deadlineRef.current),
  );

  useEffect(() => {
    onConfirmRef.current = onConfirm;
  }, [onConfirm]);

  const clearTimers = useCallback((): void => {
    cancelAutoCommitRef.current?.();
    if (intervalRef.current) clearInterval(intervalRef.current);
    cancelAutoCommitRef.current = null;
    intervalRef.current = null;
  }, []);

  const confirm = useCallback((): void => {
    if (settledRef.current || busy) return;
    settledRef.current = true;
    clearTimers();
    onConfirmRef.current();
  }, [busy, clearTimers]);

  const cancel = useCallback((): void => {
    if (settledRef.current || busy) return;
    settledRef.current = true;
    clearTimers();
    onCancel();
  }, [busy, clearTimers, onCancel]);

  useEffect(() => {
    if (busy) {
      clearTimers();
      return;
    }

    deadlineRef.current = Date.now() + THREAD_CONFIRMATION_DURATION_MS;
    settledRef.current = false;
    setRemainingSeconds(remainingConfirmationSeconds(deadlineRef.current));

    intervalRef.current = setInterval(() => {
      setRemainingSeconds(remainingConfirmationSeconds(deadlineRef.current));
    }, COUNTDOWN_TICK_MS);
    cancelAutoCommitRef.current = startThreadConfirmationTimeout(
      confirm,
      THREAD_CONFIRMATION_DURATION_MS,
    );

    return clearTimers;
  }, [busy, clearTimers, confirm]);

  const actionLabel = t(action === "delete" ? "thread.delete" : "thread.archive");

  return (
    <motion.div
      className={`thread-inline-confirmation ${action}`}
      role="alertdialog"
      aria-label={t("thread.confirmAction", { action: actionLabel })}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="thread-inline-confirmation-panel">
        <svg
          className="thread-confirmation-countdown"
          viewBox="0 0 18 18"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <circle className="thread-confirmation-countdown-track" cx="9" cy="9" r="6.75" />
          <circle className="thread-confirmation-countdown-progress" cx="9" cy="9" r="6.75" />
          <text x="9" y="9">{Math.max(1, remainingSeconds)}</text>
        </svg>
        <span className="thread-confirmation-copy">{sessionTitle}</span>
        <span className="thread-confirmation-sr-only" aria-live="polite">
          {remainingSeconds > 0
            ? t("thread.autoAction", { seconds: remainingSeconds, action: actionLabel })
            : t("thread.doingAction", { action: actionLabel })}
        </span>
        <div className="thread-confirmation-actions">
          <button type="button" className="undo-btn" autoFocus disabled={busy} onClick={cancel}>
            {busy ? t("thread.processing") : t("thread.undo")}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
