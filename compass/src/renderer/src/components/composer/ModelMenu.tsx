import { modelSelectionKey, type ThinkingLevel } from "@shared/types";
import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompass } from "../../store";
import { useI18n } from "../../i18n";

type ModelMenuView = "root" | "model" | "effort";
type ModelSubmenuView = Exclude<ModelMenuView, "root">;

const SUBMENU_HOVER_DELAY_MS = 120;

function describeArc(cx: number, cy: number, r: number, startAngleDeg: number, endAngleDeg: number): string {
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const FIVE_NOTCH_PATHS = [0, 1, 2, 3, 4].map((i) =>
  describeArc(10, 10, 7.5, -90 + i * 72 + 6, -90 + (i + 1) * 72 - 6)
);

function getEffortNotch(level: ThinkingLevel | undefined, supportsThinking: boolean): number {
  if (!supportsThinking || !level) return 1;
  if (level === "off" || level === "minimal" || level === "low") return 1;
  if (level === "medium") return 2;
  if (level === "high") return 3;
  if (level === "xhigh") return 4;
  if (level === "max") return 5;
  return 1;
}

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
  const reducedMotion = Boolean(useReducedMotion());
  const [view, setView] = useState<ModelMenuView>("root");
  const [isExpanded, setIsExpanded] = useState(false);
  const pendingViewRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  // If popover menu is explicitly open, ensure pill is in expanded state
  useEffect(() => {
    if (open) {
      setIsExpanded(true);
    }
  }, [open]);

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

  // 10-second auto-collapse timer when expanded
  const reset10sTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setIsExpanded(false);
      if (open) onClose();
    }, 10000);
  }, [onClose, open]);

  useEffect(() => {
    if (!isExpanded) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    reset10sTimer();

    const handleUserActivity = () => {
      reset10sTimer();
    };

    window.addEventListener("mousemove", handleUserActivity, { passive: true });
    window.addEventListener("mousedown", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("mousedown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
    };
  }, [isExpanded, reset10sTimer]);

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

  const modelName = stats?.model?.name ?? t("composer.selectModel");
  const tooltipText = `${modelName}${supportsThinking ? ` · ${activeEffortLabel}` : ""}`;
  const thinkingLevel = stats?.thinkingLevel;
  const isMax = thinkingLevel === "max";
  const effortNotch = getEffortNotch(thinkingLevel, supportsThinking);

  return (
    <div className="toolbar-anchor model-anchor">
      <AnimatePresence mode="popLayout" initial={false}>
        {!isExpanded ? (
          <motion.button
            key="ring"
            type="button"
            className="model-pill model-ring-trigger"
            aria-label={tooltipText}
            aria-haspopup="dialog"
            aria-expanded={false}
            title={tooltipText}
            onClick={() => setIsExpanded(true)}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
            transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {FIVE_NOTCH_PATHS.map((d, i) => {
                const isActive = i < effortNotch;
                const isSegmentMax = isActive && isMax;
                return (
                  <path
                    key={i}
                    d={d}
                    className={`model-ring-segment${isActive ? " active-segment" : " track-segment"}${isSegmentMax ? " max-segment" : ""}`}
                  />
                );
              })}
            </svg>
          </motion.button>
        ) : (
          <motion.button
            key="pill"
            type="button"
            className={`model-pill${open ? " active" : ""}`}
            aria-label={tooltipText}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={onToggle}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.94, filter: "blur(2px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(2px)" }}
            transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="model-pill-name">{modelName}</span>
            {supportsThinking && <span className="model-pill-thinking">{activeEffortLabel}</span>}
            <ChevronDown size={12} strokeWidth={1.6} />
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.div
            className="model-menu-layer"
            role="dialog"
            aria-label={tooltipText}
            initial={reducedMotion ? false : { opacity: 0, y: 5, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 3, scale: 0.97 }}
            transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatePresence mode="wait">
              {view !== "root" && (
                <motion.div
                  key={view}
                  className="popover model-submenu"
                  data-model-submenu={view}
                  onMouseEnter={cancelScheduledView}
                  initial={reducedMotion ? false : { opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -3 }}
                  transition={{ duration: reducedMotion ? 0 : 0.12 }}
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
