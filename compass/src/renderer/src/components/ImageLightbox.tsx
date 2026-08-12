import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";

/**
 * Full-screen image preview rendered into document.body. Focus moves to the
 * close button while open and returns to the trigger element on close.
 * Escape, the close button, and backdrop clicks all close the preview.
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const reducedMotion = Boolean(useReducedMotion());
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        // Capture-phase interception keeps Escape exclusive to the modal
        // instead of also dismissing composer popovers behind it.
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        // The dialog exposes a single focusable control, so keep focus on it.
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      trigger?.focus();
    };
  }, []);

  return createPortal(
    <motion.div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt || t("common.viewImage")}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      onClick={onClose}
    >
      <motion.img
        src={src}
        alt={alt ?? ""}
        initial={reducedMotion ? false : { scale: 0.98 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={(event) => event.stopPropagation()}
      />
      <button
        ref={closeButtonRef}
        type="button"
        className="image-lightbox-close"
        aria-label={t("common.closeImagePreview")}
        title={t("common.closeImagePreview")}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X size={17} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </motion.div>,
    document.body,
  );
}
