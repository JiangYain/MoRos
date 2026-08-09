import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../i18n";

interface CommandErrorBannerProps {
  message: string | null;
  onClose(): void;
}

/** Keeps command failures visible in every workspace, including Settings. */
export function CommandErrorBanner({
  message,
  onClose,
}: CommandErrorBannerProps): React.JSX.Element {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="model-banner"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="alert"
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
