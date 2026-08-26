import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n.ts";
import { isRadioNavigationKey, nextRadioIndex } from "../radio-keyboard.ts";
import {
  WORKSPACE_COLORS,
  WORKSPACE_ICONS,
  type WorkspaceAppearance,
} from "./workspace-appearance.ts";

interface WorkspaceAppearanceDialogProps {
  currentAppearance: WorkspaceAppearance;
  anchorPosition?: { x: number; y: number } | null;
  onClose: () => void;
  onChange: (appearance: WorkspaceAppearance) => void;
}

export function WorkspaceAppearanceDialog({
  currentAppearance,
  anchorPosition,
  onClose,
  onChange,
}: WorkspaceAppearanceDialogProps): React.JSX.Element {
  const { t } = useI18n();
  const [selectedIconId, setSelectedIconId] = useState<string>(currentAppearance.iconId || "folder");
  const [selectedColorId, setSelectedColorId] = useState<string>(currentAppearance.colorId || "black");
  const dialogRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!dialogRef.current) return;
    const padding = 12;
    const bounds = dialogRef.current.getBoundingClientRect();
    const targetX = anchorPosition ? anchorPosition.x : window.innerWidth / 2 - bounds.width / 2;
    const targetY = anchorPosition ? anchorPosition.y : window.innerHeight / 2 - bounds.height / 2;

    const left = Math.max(padding, Math.min(targetX, window.innerWidth - bounds.width - padding));
    const top = Math.max(padding, Math.min(targetY, window.innerHeight - bounds.height - padding));

    setPosition({ left, top });
  }, [anchorPosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleSelectColor = useCallback(
    (colorId: string) => {
      setSelectedColorId(colorId);
      onChange({
        iconId: selectedIconId,
        colorId,
      });
    },
    [onChange, selectedIconId],
  );

  const handleSelectIcon = useCallback(
    (iconId: string) => {
      setSelectedIconId(iconId);
      onChange({
        iconId,
        colorId: selectedColorId,
      });
    },
    [onChange, selectedColorId],
  );

  return createPortal(
    <div
      className="workspace-appearance-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="workspace-appearance-popover"
        role="dialog"
        aria-modal="true"
        aria-label={t("sidebar.customizeWorkspace")}
        style={{
          left: position?.left ?? (anchorPosition?.x ?? 100),
          top: position?.top ?? (anchorPosition?.y ?? 100),
          visibility: position ? "visible" : "hidden",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="workspace-appearance-colors"
          role="radiogroup"
          aria-label="Color options"
          onKeyDown={(event) => {
            if (!isRadioNavigationKey(event.key)) return;
            event.preventDefault();
            const index = nextRadioIndex(
              WORKSPACE_COLORS.findIndex((item) => item.id === selectedColorId),
              WORKSPACE_COLORS.length,
              event.key,
            );
            const target = WORKSPACE_COLORS[index];
            if (!target) return;
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
            handleSelectColor(target.id);
          }}
        >
          {WORKSPACE_COLORS.map((color) => {
            const isSelected = selectedColorId === color.id;
            return (
              <button
                type="button"
                key={color.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                aria-label={color.name}
                title={color.name}
                className={`workspace-color-dot-btn${isSelected ? " selected" : ""}`}
                onClick={() => handleSelectColor(color.id)}
              >
                <span
                  className="workspace-color-dot"
                  style={{
                    backgroundColor: color.value,
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className="workspace-appearance-divider" />

        <div
          className="workspace-appearance-icons"
          role="radiogroup"
          aria-label="Icon options"
          onKeyDown={(event) => {
            if (!isRadioNavigationKey(event.key)) return;
            event.preventDefault();
            const index = nextRadioIndex(
              WORKSPACE_ICONS.findIndex((item) => item.id === selectedIconId),
              WORKSPACE_ICONS.length,
              event.key,
            );
            const target = WORKSPACE_ICONS[index];
            if (!target) return;
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
            handleSelectIcon(target.id);
          }}
        >
          {WORKSPACE_ICONS.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedIconId === item.id;
            return (
              <button
                type="button"
                key={item.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                aria-label={item.name}
                title={item.name}
                className={`workspace-icon-btn${isSelected ? " selected" : ""}`}
                onClick={() => handleSelectIcon(item.id)}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="workspace-appearance-footer">
          <button
            type="button"
            className="workspace-appearance-done-btn"
            onClick={onClose}
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
