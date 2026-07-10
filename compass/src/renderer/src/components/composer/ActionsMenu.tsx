import { Folder, ImagePlus, Plus, Settings, Sparkles, SquarePen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCompass } from "../../store";

interface ActionsMenuProps {
  open: boolean;
  onAddImage(): void;
  onClose(): void;
  onToggle(): void;
}

export function ActionsMenu({ open, onAddImage, onClose, onToggle }: ActionsMenuProps): React.JSX.Element {
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
        aria-label="更多操作"
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
              添加图片
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => void newSession())}>
              <SquarePen size={16} strokeWidth={1.6} />
              新对话
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => openSettings("skills"))}>
              <Sparkles size={16} strokeWidth={1.6} />
              技能库
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => void setWorkspaceDir())}>
              <Folder size={16} strokeWidth={1.6} />
              更换工作区
            </button>
            <button type="button" className="menu-action" onClick={() => run(() => openSettings())}>
              <Settings size={16} strokeWidth={1.6} />
              设置
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
