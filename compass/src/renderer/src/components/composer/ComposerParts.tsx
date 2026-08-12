import type { QueuedMessageKind, UiSkill } from "@shared/types";
import { Box, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import { ImageLightbox } from "../ImageLightbox";
import type { ComposerAttachment } from "./composer-attachments";

export interface SlashCommandItem {
  command: string;
  name: string;
  description: string;
}

export function QueueChips({
  steering,
  followUp,
  onRecall,
  onWithdraw,
}: {
  steering: string[];
  followUp: string[];
  /** Withdraw the queued message and restore its text into the draft. */
  onRecall: (kind: QueuedMessageKind, index: number, message: string) => void;
  /** Withdraw the queued message without touching the draft. */
  onWithdraw: (kind: QueuedMessageKind, index: number, message: string) => void;
}): React.JSX.Element | null {
  const { t } = useI18n();
  if (steering.length === 0 && followUp.length === 0) return null;
  const chip = (kind: QueuedMessageKind, message: string, index: number): React.JSX.Element => (
    <span className="queue-chip" key={`${kind === "steering" ? "s" : "f"}-${index}`}>
      <button
        type="button"
        className="queue-chip-body"
        title={t("composer.queueRecall")}
        aria-label={t("composer.queueRecall")}
        onClick={() => onRecall(kind, index, message)}
      >
        <span className="tag">{t(kind === "steering" ? "composer.steer" : "composer.followUp")}</span>
        <span className="txt">{message}</span>
      </button>
      <button
        type="button"
        className="queue-chip-remove"
        title={t("composer.queueWithdraw")}
        aria-label={t("composer.queueWithdraw")}
        onClick={() => onWithdraw(kind, index, message)}
      >
        <X size={12} strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  );
  return (
    <div className="queue-chips">
      {steering.map((message, index) => chip("steering", message, index))}
      {followUp.map((message, index) => chip("followUp", message, index))}
    </div>
  );
}

interface SlashCommandPopoverProps {
  items: SlashCommandItem[];
  open: boolean;
  selectedIndex: number;
  onApply: (item: SlashCommandItem) => void;
  onHighlight: (index: number) => void;
}

export function SlashCommandPopover(props: SlashCommandPopoverProps): React.JSX.Element {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {props.open && (
        <motion.div className="popover slash-popover" initial={{ opacity: 0, y: 5, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }}>
          <div className="slash-popover-list" role="listbox" aria-label={t("composer.skillCommands")}>
            {props.items.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === props.selectedIndex}
                key={item.command}
                className={`popover-item${index === props.selectedIndex ? " hl" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => props.onHighlight(index)}
                onClick={() => props.onApply(item)}
              >
                <span className="name">{item.command}</span>
                <span className="desc">{item.description}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SelectedSkill({ skill, onRemove }: { skill: UiSkill | null; onRemove: () => void }): React.JSX.Element | null {
  const { t } = useI18n();
  if (!skill) return null;
  return (
    <div className="composer-skill-selection" role="group" aria-label={t("composer.selectedSkill")}>
      <span className="composer-skill-chip"><Box size={16} strokeWidth={1.75} aria-hidden="true" /><span>{skill.name}</span></span>
      <button type="button" aria-label={t("composer.removeSkill", { name: skill.name })} title={t("composer.removeSkill", { name: skill.name })} onClick={onRemove}>
        <X size={13} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ComposerAttachments({ attachments, onRemove }: { attachments: ComposerAttachment[]; onRemove: (id: string) => void }): React.JSX.Element | null {
  const { t } = useI18n();
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  if (attachments.length === 0) return null;
  return (
    <div className="composer-attachments">
      {attachments.map((image, index) => {
        const src = `data:${image.mimeType};base64,${image.data}`;
        const alt = image.name ?? t("composer.attachment", { number: index + 1 });
        return (
          <div className="composer-attachment" key={image.id}>
            {/* The legacy `.composer-attachment button` selector styles the remove
                control, so the preview trigger stays on the image itself. */}
            <img
              src={src}
              alt={alt}
              role="button"
              tabIndex={0}
              aria-label={t("common.viewImage")}
              onClick={() => setPreview({ src, alt })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setPreview({ src, alt });
                }
              }}
            />
            <button type="button" aria-label={t("composer.removeImage", { number: index + 1 })} onClick={() => onRemove(image.id)}>
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        );
      })}
      {preview && <ImageLightbox src={preview.src} alt={preview.alt} onClose={() => setPreview(null)} />}
    </div>
  );
}

export function DictationStatus({ busy, label, phase, preview }: { busy: boolean; label: string; phase: string; preview: string }): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {busy && (
        <motion.div className={`dictation-status ${phase}`} role="status" aria-live="polite" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
          <span className="dictation-wave" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</span>
          <span className="dictation-copy"><strong>{label}</strong><small title={preview}>{preview}</small></span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
