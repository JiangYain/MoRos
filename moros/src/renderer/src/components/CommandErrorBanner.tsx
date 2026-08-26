import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

interface CommandErrorBannerProps {
  message: string | null;
  onClose(): void;
}

const AUTO_DISMISS_DELAY_MS = 8000;

/** Keeps command failures visible in every workspace, including Settings. */
export function CommandErrorBanner({
  message,
  onClose,
}: CommandErrorBannerProps): React.JSX.Element {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const paused = hovered || focused;

  // A replaced or dismissed message restarts the countdown from scratch; the
  // stale pause state of the previous banner must not leak into the next one.
  useEffect(() => {
    setHovered(false);
    setFocused(false);
  }, [message]);

  useEffect(() => {
    if (!message || paused) return;
    const timer = window.setTimeout(() => onCloseRef.current(), AUTO_DISMISS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [message, paused]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="model-banner"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="alert"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          <div className="model-banner-inner error">
            <span>{message}</span>
            <button type="button" className="go" onClick={onClose}>
              {t("common.close")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
