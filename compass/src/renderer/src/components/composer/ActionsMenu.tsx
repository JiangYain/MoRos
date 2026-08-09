import { Folder, ImagePlus, Plus, Settings, Sparkles, SquarePen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ignoreCommandFailure, useCompass } from "../../store";
import { useI18n } from "../../i18n";

interface ActionsMenuProps {
  open: boolean;
  onAddImage(): void;
  onClose(): void;
  onToggle(): void;
}

export function ActionsMenu({ open, onAddImage, onClose, onToggle }: ActionsMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const newSession = useCompass((state) => state.newSession);
  const openSettings = useCompass((state) => state.openSettings);
  const setWorkspaceDir = useCompass((state) => state.setWorkspaceDir);

  const run = (action: () => void): void => {
    onClose();
    action();
  };

  return (
    <div className="toolbar-anchor">
      <button
        type="button"
        className={`composer-icon-btn composer-round-btn${open ? " active" : ""}`}
        aria-label={t("composer.moreActions")}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Plus size={19} strokeWidth={1.65} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="popover action-popover"
            initial={{ opacity: 0, y: 5, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
          >
            <button type="button" className="menu-action" onClick={() => run(onAddImage)}>
              <ImagePlus size={16} strokeWidth={1.6} />
              {t("composer.addImage")}
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => ignoreCommandFailure(newSession()))}>
              <SquarePen size={16} strokeWidth={1.6} />
              {t("composer.newConversation")}
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => openSettings("skills"))}>
              <Sparkles size={16} strokeWidth={1.6} />
              {t("sidebar.skillLibrary")}
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => ignoreCommandFailure(setWorkspaceDir()))}>
              <Folder size={16} strokeWidth={1.6} />
              {t("composer.changeWorkspace")}
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => openSettings())}>
              <Settings size={16} strokeWidth={1.6} />
              {t("titlebar.settings")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
