import { modelSelectionKey, type ThinkingLevel } from "@shared/types";
import { Check, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useCompass } from "../../store";

const EFFORT_LABELS: Partial<Record<ThinkingLevel, string>> = {
  off: "Light",
  minimal: "Light",
  low: "Light",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

type ModelMenuView = "root" | "model" | "effort" | "speed";

interface ModelMenuProps {
  open: boolean;
  onClose(): void;
  onOpenSettings(): void;
  onToggle(): void;
}

export function ModelMenu({ open, onClose, onOpenSettings, onToggle }: ModelMenuProps): React.JSX.Element {
  const stats = useCompass((state) => state.stats);
  const settings = useCompass((state) => state.settings);
  const models = useCompass((state) => state.models);
  const setModel = useCompass((state) => state.setModel);
  const setThinkingLevel = useCompass((state) => state.setThinkingLevel);
  const [view, setView] = useState<ModelMenuView>("root");

  useEffect(() => {
    if (!open) setView("root");
  }, [open]);

  const thinkingLevels = stats?.model?.thinkingLevels ?? [];
  const supportsThinking = thinkingLevels.some((level) => level !== "off");
  const effortOptions = useMemo(() => {
    const options: Array<{ level: ThinkingLevel; label: string }> = [];
    const light = (["low", "minimal", "off"] as ThinkingLevel[]).find((level) =>
      thinkingLevels.includes(level),
    );
    if (light) options.push({ level: light, label: "Light" });
    for (const level of ["medium", "high", "xhigh", "max"] as ThinkingLevel[]) {
      if (thinkingLevels.includes(level)) options.push({ level, label: EFFORT_LABELS[level] ?? level });
    }
    if (options.length === 0 && thinkingLevels[0]) {
      options.push({ level: thinkingLevels[0], label: EFFORT_LABELS[thinkingLevels[0]] ?? thinkingLevels[0] });
    }
    return options;
  }, [thinkingLevels]);
  const activeEffortLabel = EFFORT_LABELS[stats?.thinkingLevel ?? "off"] ?? "Light";
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
        <span className="model-pill-name">{stats?.model?.name ?? "Select model"}</span>
        {supportsThinking && <span className="model-pill-thinking">{activeEffortLabel}</span>}
        <ChevronDown size={12} strokeWidth={1.6} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="popover model-popover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="model-menu-main">
                <MenuRow label="Model" value={stats?.model?.name ?? "Select"} active={view === "model"} onOpen={() => setView("model")} />
                <MenuRow label="Effort" value={supportsThinking ? activeEffortLabel : "—"} active={view === "effort"} disabled={!supportsThinking} onOpen={() => setView("effort")} />
                <MenuRow label="Speed" value="Standard" active={view === "speed"} onOpen={() => setView("speed")} />
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
                <span>Add Model</span>
                <Plus size={14} strokeWidth={1.55} />
              </button>
            </motion.div>

            <AnimatePresence mode="wait">
              {view !== "root" && (
                <motion.div
                  key={view}
                  className="popover model-submenu"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="model-submenu-title">
                    {view === "model" ? "Model" : view === "effort" ? "Effort" : "Speed"}
                  </div>
                  {view === "model" && (
                    <div className="model-submenu-list model-options-list">
                      {enabledModels.length === 0 && <div className="popover-empty">Add a model in Settings.</div>}
                      {enabledModels.map((model) => {
                        const current = stats?.model?.provider === model.provider && stats.model.id === model.id;
                        return (
                          <button
                            type="button"
                            key={`${model.provider}/${model.id}`}
                            onClick={() => {
                              void setModel(model.provider, model.id);
                              setView("root");
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
                            setView("root");
                          }}
                        >
                          <span>{option.label}</span>
                          {activeEffortLabel === option.label && <Check size={14} strokeWidth={1.65} />}
                        </button>
                      ))}
                    </div>
                  )}
                  {view === "speed" && (
                    <div className="model-submenu-list">
                      <button type="button" onClick={() => setView("root")}>
                        <span>Standard</span>
                        <Check size={14} strokeWidth={1.65} />
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuRow({
  active,
  disabled = false,
  label,
  onOpen,
  value,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onOpen(): void;
  value: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={active ? "active" : ""}
      onMouseEnter={onOpen}
      onFocus={onOpen}
      onClick={onOpen}
    >
      <span>{label}</span>
      <b>{value}</b>
      <ChevronRight size={14} strokeWidth={1.55} />
    </button>
  );
}
