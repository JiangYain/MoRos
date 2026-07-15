import { modelSelectionKey, type ThinkingLevel } from "@shared/types";
import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompass } from "../../store";
import { useI18n } from "../../i18n";

type ModelMenuView = "root" | "model" | "effort";
type ModelSubmenuView = Exclude<ModelMenuView, "root">;

const SUBMENU_HOVER_DELAY_MS = 120;

interface ModelMenuProps {
  open: boolean;
  onClose(): void;
  onOpenSettings(): void;
  onToggle(): void;
}

export function ModelMenu({ open, onClose, onOpenSettings, onToggle }: ModelMenuProps): React.JSX.Element {
  const { t } = useI18n();
  const stats = useCompass((state) => state.stats);
  const settings = useCompass((state) => state.settings);
  const models = useCompass((state) => state.models);
  const setModel = useCompass((state) => state.setModel);
  const setThinkingLevel = useCompass((state) => state.setThinkingLevel);
  const [view, setView] = useState<ModelMenuView>("root");
  const pendingViewRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setView("root");
      if (pendingViewRef.current !== null) window.clearTimeout(pendingViewRef.current);
      pendingViewRef.current = null;
    }
    return () => {
      if (pendingViewRef.current !== null) window.clearTimeout(pendingViewRef.current);
      pendingViewRef.current = null;
    };
  }, [open]);

  const cancelScheduledView = (): void => {
    if (pendingViewRef.current !== null) window.clearTimeout(pendingViewRef.current);
    pendingViewRef.current = null;
  };

  const openView = (nextView: ModelSubmenuView): void => {
    cancelScheduledView();
    setView(nextView);
  };

  const scheduleView = (nextView: ModelSubmenuView): void => {
    cancelScheduledView();
    if (view === nextView) return;
    pendingViewRef.current = window.setTimeout(() => {
      pendingViewRef.current = null;
      setView(nextView);
    }, SUBMENU_HOVER_DELAY_MS);
  };

  const thinkingLevels = stats?.model?.thinkingLevels ?? [];
  const effortLabel = (level: ThinkingLevel): string => {
    if (level === "medium") return t("composer.medium");
    if (level === "high") return t("composer.high");
    if (level === "xhigh") return t("composer.extraHigh");
    if (level === "max") return t("composer.max");
    return t("composer.light");
  };
  const supportsThinking = thinkingLevels.some((level) => level !== "off");
  const effortOptions = useMemo(() => {
    const options: Array<{ level: ThinkingLevel; label: string }> = [];
    const light = (["low", "minimal", "off"] as ThinkingLevel[]).find((level) =>
      thinkingLevels.includes(level),
    );
    if (light) options.push({ level: light, label: effortLabel(light) });
    for (const level of ["medium", "high", "xhigh", "max"] as ThinkingLevel[]) {
      if (thinkingLevels.includes(level)) options.push({ level, label: effortLabel(level) });
    }
    if (options.length === 0 && thinkingLevels[0]) {
      options.push({ level: thinkingLevels[0], label: effortLabel(thinkingLevels[0]) });
    }
    return options;
  }, [thinkingLevels, t]);
  const activeEffortLabel = effortLabel(stats?.thinkingLevel ?? "off");
  const enabledModels = useMemo(() => {
    const enabled = new Set(settings?.enabledModels ?? []);
    return models.filter((model) => enabled.has(modelSelectionKey(model.provider, model.id)));
  }, [models, settings?.enabledModels]);

  return (
    <div className="toolbar-anchor model-anchor">
      <button
        type="button"
        className={`model-pill${open ? " active" : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="model-pill-name">{stats?.model?.name ?? t("composer.selectModel")}</span>
        {supportsThinking && <span className="model-pill-thinking">{activeEffortLabel}</span>}
        <ChevronDown size={12} strokeWidth={1.6} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="model-menu-layer"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          >
            <AnimatePresence mode="wait">
              {view !== "root" && (
                <motion.div
                  key={view}
                  className="popover model-submenu"
                  data-model-submenu={view}
                  onMouseEnter={cancelScheduledView}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -3 }}
                  transition={{ duration: 0.12 }}
                >
                  <div className="model-submenu-title">
                    {view === "model" ? t("composer.model") : t("composer.effort")}
                  </div>
                  {view === "model" && (
                    <div className="model-submenu-list model-options-list">
                      {enabledModels.length === 0 && <div className="popover-empty">{t("composer.addModelInSettings")}</div>}
                      {enabledModels.map((model) => {
                        const current = stats?.model?.provider === model.provider && stats.model.id === model.id;
                        return (
                          <button
                            type="button"
                            key={`${model.provider}/${model.id}`}
                            onClick={() => {
                              void setModel(model.provider, model.id);
                              onClose();
                            }}
                          >
                            <span>{model.name}</span>
                            {current && <Check size={14} strokeWidth={1.65} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {view === "effort" && (
                    <div className="model-submenu-list">
                      {effortOptions.map((option) => (
                        <button
                          type="button"
                          data-thinking-level={option.level}
                          key={option.level}
                          onClick={() => {
                            void setThinkingLevel(option.level);
                            onClose();
                          }}
                        >
                          <span>{option.label}</span>
                          {activeEffortLabel === option.label && <Check size={14} strokeWidth={1.65} />}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="popover model-popover">
              <div className="model-menu-main">
                <MenuRow view="model" label={t("composer.model")} value={stats?.model?.name ?? t("composer.select")} active={view === "model"} onHoverStart={scheduleView} onHoverEnd={cancelScheduledView} onOpen={openView} />
                <MenuRow view="effort" label={t("composer.effort")} value={supportsThinking ? activeEffortLabel : "—"} active={view === "effort"} disabled={!supportsThinking} onHoverStart={scheduleView} onHoverEnd={cancelScheduledView} onOpen={openView} />
              </div>
              <div className="model-menu-rule" />
              <button
                type="button"
                className="model-add"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
              >
                <span>{t("composer.addModel")}</span>
                <Plus size={14} strokeWidth={1.55} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuRow({
  active,
  disabled = false,
  label,
  onHoverEnd,
  onHoverStart,
  onOpen,
  value,
  view,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onHoverEnd(): void;
  onHoverStart(view: ModelSubmenuView): void;
  onOpen(view: ModelSubmenuView): void;
  value: string;
  view: ModelSubmenuView;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={active ? "active" : ""}
      data-model-menu-view={view}
      onMouseEnter={() => onHoverStart(view)}
      onMouseLeave={onHoverEnd}
      onFocus={() => onOpen(view)}
      onClick={() => onOpen(view)}
    >
      <span>{label}</span>
      <b>{value}</b>
      <ChevronRight size={14} strokeWidth={1.55} />
    </button>
  );
}
