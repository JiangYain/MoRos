import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCompass } from "../../store";
import { type TranslationKey, useI18n } from "../../i18n";
import { PERMISSION_OPTIONS } from "../permissions";

interface PermissionMenuProps {
  open: boolean;
  onClose(): void;
  onToggle(): void;
}

export function PermissionMenu({ open, onClose, onToggle }: PermissionMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const settings = useCompass((state) => state.settings);
  const setPermissionMode = useCompass((state) => state.setPermissionMode);
  const permissionMode = settings?.permissionMode ?? "full";
  const selected = PERMISSION_OPTIONS.find((option) => option.id === permissionMode) ?? PERMISSION_OPTIONS[2];
  const SelectedIcon = selected.icon;
  const isFull = permissionMode === "full";

  return (
    <div className="toolbar-anchor permission-anchor">
      <button
        type="button"
        className={`permission-pill${isFull ? " mode-full" : ""}${open ? " active" : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <SelectedIcon size={14} strokeWidth={1.65} />
        <span>{t(`settings.permission.${selected.id}` as TranslationKey)}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="popover permission-popover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {PERMISSION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const optionIsFull = option.id === "full";
              return (
                <button
                  type="button"
                  className={`permission-option${optionIsFull ? " mode-full" : ""}`}
                  key={option.id}
                  onClick={() => {
                    onClose();
                    void setPermissionMode(option.id);
                  }}
                >
                  <Icon size={16} strokeWidth={1.55} />
                  <span>
                    <b>{t(`settings.permission.${option.id}` as TranslationKey)}</b>
                    <small>{t(`settings.permission.${option.id}Description` as TranslationKey)}</small>
                  </span>
                  {permissionMode === option.id && <Check size={15} strokeWidth={1.65} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
