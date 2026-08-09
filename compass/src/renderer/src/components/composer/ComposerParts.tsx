import type { UiSkill } from "@shared/types";
import { Box, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../../i18n";
import type { ComposerAttachment } from "./composer-attachments";

export interface SlashCommandItem {
  command: string;
  name: string;
  description: string;
}

export function QueueChips({ steering, followUp }: { steering: string[]; followUp: string[] }): React.JSX.Element | null {
  const { t } = useI18n();
  if (steering.length === 0 && followUp.length === 0) return null;
  return (
    <div className="queue-chips">
      {steering.map((message, index) => (
        <span className="queue-chip" key={`s-${index}`}><span className="tag">{t("composer.steer")}</span><span className="txt">{message}</span></span>
      ))}
      {followUp.map((message, index) => (
        <span className="queue-chip" key={`f-${index}`}><span className="tag">{t("composer.followUp")}</span><span className="txt">{message}</span></span>
      ))}
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
  if (attachments.length === 0) return null;
  return (
    <div className="composer-attachments">
      {attachments.map((image, index) => (
        <div className="composer-attachment" key={image.id}>
          <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name ?? t("composer.attachment", { number: index + 1 })} />
          <button type="button" aria-label={t("composer.removeImage", { number: index + 1 })} onClick={() => onRemove(image.id)}>
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      ))}
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
