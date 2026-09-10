import { Folder, X } from "lucide-react";
import type { ContextUsageCategoryKey } from "@shared/types";
import { useEffect, useId, useState } from "react";
import { type TranslationKey, useI18n } from "../../i18n";
import { ignoreCommandFailure, useMoros } from "../../store";
import { QuickPrompts } from "../QuickPrompts";
import { buildContextRingCallouts, CONTEXT_RING_CALLOUT_VIEWBOX } from "./context-usage-ring";

const FIXED_CONTEXT_SEGMENTS = [
  { key: "systemPrompt", labelKey: "composer.segment.systemPrompt", color: "#777777" },
  { key: "rules", labelKey: "composer.segment.rules", color: "#008553" },
  { key: "skills", labelKey: "composer.segment.skills", color: "#b57700" },
  { key: "toolDefinitions", labelKey: "composer.segment.toolDefinitions", color: "#7562d6" },
  { key: "mcpTools", labelKey: "composer.segment.mcpTools", color: "#a91768" },
  { key: "subagents", labelKey: "composer.segment.subagents", color: "#2d7fc0" },
] as const;

const RUNTIME_CONTEXT_SEGMENTS = [
  { key: "conversation", labelKey: "composer.segment.conversation", color: "#d83a1f" },
  { key: "read", labelKey: "composer.segment.read", color: "#0a8872" },
  { key: "write", labelKey: "composer.segment.write", color: "#2463d4" },
  { key: "edit", labelKey: "composer.segment.edit", color: "#8a4bc2" },
  { key: "bash", labelKey: "composer.segment.bash", color: "#d06b12" },
  { key: "otherTools", labelKey: "composer.segment.otherTools", color: "#536173" },
] as const;

const CONTEXT_GROUPS = [
  { key: "fixed", labelKey: "composer.contextFixed", segments: FIXED_CONTEXT_SEGMENTS },
  { key: "runtime", labelKey: "composer.contextRuntime", segments: RUNTIME_CONTEXT_SEGMENTS },
] as const;

const CONTEXT_SEGMENTS = [...FIXED_CONTEXT_SEGMENTS, ...RUNTIME_CONTEXT_SEGMENTS] as const;

const DETAIL_COLORS = [
  "#0a8872",
  "#d06b12",
  "#2463d4",
  "#a91768",
  "#7562d6",
  "#2d7fc0",
  "#b57700",
  "#536173",
  "#d83a1f",
  "#16803f",
  "#7c3aed",
  "#0789a8",
] as const;

function formatCount(value: number, approximate = false): string {
  const rounded = approximate && value < 1_000 ? Math.round(value / 10) * 10 : value;
  const formatted = rounded >= 1_000_000
    ? `${(rounded / 1_000_000).toFixed(1)}M`
    : rounded >= 1_000
      ? `${(rounded / 1_000).toFixed(1)}K`
      : String(rounded);
  return approximate ? `~${formatted}` : formatted;
}

function detailColor(baseColor: string, index: number): string {
  if (index === 0) return baseColor;
  const alternatives = DETAIL_COLORS.filter((color) => color !== baseColor);
  return alternatives[(index - 1) % alternatives.length];
}

function formatCalloutLabel(label: string): string {
  if (label.length <= 22) return label;
  const pathTail = label.split(/[\\/]/).at(-1) ?? label;
  return pathTail.length <= 22 ? pathTail : `${pathTail.slice(0, 19)}...`;
}

interface ContextUsageSurfaceProps {
  expanded: boolean;
  onClose(): void;
  showQuickPrompts?: boolean;
}

export function ContextUsageSurface({ expanded, onClose, showQuickPrompts = false }: ContextUsageSurfaceProps): React.JSX.Element {
  const { t } = useI18n();
  const tooltipId = useId();
  const [activeSegmentKey, setActiveSegmentKey] = useState<string | null>(null);
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<ContextUsageCategoryKey | null>(null);
  const [ringReady, setRingReady] = useState(false);
  const stats = useMoros((state) => state.stats);
  const settings = useMoros((state) => state.settings);
  const setWorkspaceDir = useMoros((state) => state.setWorkspaceDir);
  const openSettings = useMoros((state) => state.openSettings);
  const sessionDisplayName = stats?.sessionName || t("common.untitledSession");
  const workspaceDir = stats?.workspaceDir ?? settings?.workspaceDir ?? "";
  const workspaceDisplayName = workspaceDir.split(/[\\/]/).filter(Boolean).pop() || workspaceDir || t("settings.workspace");
  const noModel = !stats?.model || !stats.modelAuthConfigured;
  const rawPercent = stats?.contextPercent;
  const contextPercent = Math.min(100, Math.max(0, rawPercent ?? 0));
  const contextKnown = rawPercent !== null && rawPercent !== undefined;
  const contextTokens = stats?.contextTokens ?? 0;
  const contextWindow = stats?.contextWindow ?? 0;
  const rawBreakdown = stats?.contextBreakdown;
  const breakdown = {
    systemPrompt: rawBreakdown?.systemPrompt ?? 0,
    toolDefinitions: rawBreakdown?.toolDefinitions ?? 0,
    rules: rawBreakdown?.rules ?? 0,
    skills: rawBreakdown?.skills ?? 0,
    mcpTools: rawBreakdown?.mcpTools ?? 0,
    subagents: rawBreakdown?.subagents ?? 0,
    conversation: rawBreakdown?.conversation ?? contextTokens,
    read: rawBreakdown?.read ?? 0,
    write: rawBreakdown?.write ?? 0,
    edit: rawBreakdown?.edit ?? 0,
    bash: rawBreakdown?.bash ?? 0,
    otherTools: rawBreakdown?.otherTools ?? 0,
    estimated: rawBreakdown?.estimated ?? true,
  };
  const rows = CONTEXT_SEGMENTS.map((segment) => ({
    ...segment,
    tokens: breakdown[segment.key],
  }));
  const groups = CONTEXT_GROUPS.map((group) => {
    const groupRows = group.segments.map((segment) => ({
      ...segment,
      tokens: breakdown[segment.key],
    }));
    return {
      ...group,
      rows: groupRows,
      tokens: groupRows.reduce((total, segment) => total + segment.tokens, 0),
    };
  });
  const displayTokens = contextTokens > 0
    ? contextTokens
    : rows.reduce((total, segment) => total + segment.tokens, 0);
  const breakdownTokens = rows.reduce((total, segment) => total + segment.tokens, 0);
  const selectedDefinition = selectedSegmentKey
    ? CONTEXT_SEGMENTS.find((segment) => segment.key === selectedSegmentKey)
    : undefined;
  const selectedLabel = selectedDefinition
    ? t(selectedDefinition.labelKey as TranslationKey)
    : "";
  const selectedCategoryTokens = selectedDefinition ? breakdown[selectedDefinition.key] : 0;
  const sourceDetails = selectedDefinition
    ? rawBreakdown?.details?.[selectedDefinition.key] ?? []
    : [];
  const detailItems = selectedDefinition && selectedCategoryTokens > 0
    ? sourceDetails.some((item) => item.tokens > 0)
      ? sourceDetails.filter((item) => item.tokens > 0)
      : [{
          id: `${selectedDefinition.key}:total`,
          label: selectedLabel,
          tokens: selectedCategoryTokens,
        }]
    : [];
  const detailTokens = detailItems.reduce((total, item) => total + item.tokens, 0);
  const ringRows = selectedDefinition
    ? detailItems.map((item, index) => ({
        key: `detail:${selectedDefinition.key}:${item.id}`,
        categoryKey: selectedDefinition.key,
        label: item.label,
        color: detailColor(selectedDefinition.color, index),
        tokens: item.tokens,
      }))
    : rows.map((segment) => ({
        ...segment,
        categoryKey: segment.key,
        label: t(segment.labelKey as TranslationKey),
      }));
  const ringScale = selectedDefinition
    ? detailTokens > 0 ? 100 / detailTokens : 0
    : contextWindow > 0
      ? 100 / contextWindow
      : breakdownTokens > 0
        ? contextPercent / breakdownTokens
        : 0;
  let ringOffset = 0;
  const ringSegments = ringRows.map((segment) => {
    const remaining = Math.max(0, 100 - ringOffset);
    const length = Math.min(Math.max(segment.tokens * ringScale, 0), remaining);
    const ringSegment = { ...segment, length, offset: ringOffset };
    ringOffset += length;
    return ringSegment;
  });
  const ringLabel = selectedDefinition
    ? t("composer.contextCategoryDetails", { label: selectedLabel })
    : contextKnown
      ? t("composer.contextUsedPercent", { percent: Math.round(contextPercent) })
      : t("composer.contextUnknown");
  const ringCallouts = buildContextRingCallouts(ringSegments);
  const activeSegment = ringSegments.find((segment) => segment.key === activeSegmentKey && segment.length > 0);

  const selectCategory = (key: ContextUsageCategoryKey): void => {
    if (breakdown[key] <= 0) return;
    setRingReady(false);
    setActiveSegmentKey(null);
    setSelectedSegmentKey(key);
  };

  const showOverview = (): void => {
    setRingReady(false);
    setActiveSegmentKey(null);
    setSelectedSegmentKey(null);
  };

  useEffect(() => {
    if (selectedSegmentKey && selectedCategoryTokens <= 0) {
      setActiveSegmentKey(null);
      setSelectedSegmentKey(null);
    }
  }, [selectedCategoryTokens, selectedSegmentKey]);

  useEffect(() => {
    if (!expanded) {
      setActiveSegmentKey(null);
      setSelectedSegmentKey(null);
      setRingReady(false);
      return;
    }

    setRingReady(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setRingReady(true));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [expanded, selectedSegmentKey]);

  return (
    <div className={`workspace-context-shell${expanded ? " expanded" : ""}`}>
      <div className="workspace-context-surface">
        {expanded && (
          <section className="context-usage-panel" aria-label={t("composer.contextUsage")}>
            <div className="context-usage-inner">
              <div className="context-usage-head">
                <span>{t("composer.contextUsage")}</span>
                <div>
                  <button type="button" className="context-close" aria-label={t("composer.closeContext")} onClick={onClose}>
                    <X size={14} strokeWidth={1.55} />
                  </button>
                </div>
              </div>
              <div className="context-usage-content">
                <div className="context-usage-details">
                  <div className="context-usage-columns">
                    {groups.map((group) => (
                      <section className="context-usage-group" key={group.key} aria-label={t(group.labelKey as TranslationKey)}>
                        <div className="context-usage-group-head">
                          <span>{t(group.labelKey as TranslationKey)}</span>
                          <b>{formatCount(group.tokens, breakdown.estimated)}</b>
                        </div>
                        <div className="context-usage-list">
                          {group.rows.map((segment) => {
                            const label = t(segment.labelKey as TranslationKey);
                            const selected = segment.key === selectedSegmentKey;
                            return (
                              <button
                                type="button"
                                className={`context-usage-row${selected ? " selected" : ""}`}
                                key={segment.key}
                                disabled={segment.tokens <= 0}
                                aria-label={t("composer.contextViewDetails", { label })}
                                aria-pressed={selected}
                                onClick={() => selectCategory(segment.key)}
                              >
                                <span className="context-usage-swatch" style={{ backgroundColor: segment.color }} />
                                <span className="context-usage-row-label">{label}</span>
                                <b>{formatCount(segment.tokens, breakdown.estimated)}</b>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
                <div className={`context-usage-visual${selectedDefinition ? " detail-view" : ""}${activeSegment ? " has-active-segment" : ""}`}>
                  <svg
                    className="context-usage-callouts"
                    viewBox={`0 0 ${CONTEXT_RING_CALLOUT_VIEWBOX.width} ${CONTEXT_RING_CALLOUT_VIEWBOX.height}`}
                    aria-hidden="true"
                  >
                    {ringCallouts.map((callout) => {
                      const active = callout.key === activeSegmentKey;
                      return (
                        <g className={`context-usage-callout${active ? " active" : ""}`} key={callout.key}>
                          <polyline
                            points={`${callout.anchorX},${callout.anchorY} ${callout.elbowX},${callout.elbowY} ${callout.lineEndX},${callout.labelY}`}
                            stroke={callout.color}
                          />
                          <text
                            x={callout.labelX}
                            y={callout.labelY + 3}
                            textAnchor={callout.side === "left" ? "end" : "start"}
                          >
                            {formatCalloutLabel(callout.label)}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="context-usage-ring-shell">
                    <svg className="context-usage-ring" viewBox="0 0 100 100" role="group" aria-label={ringLabel}>
                      <circle className="context-usage-ring-track" cx="50" cy="50" r="40" />
                      {ringSegments.map((segment) => {
                        const active = segment.key === activeSegmentKey && segment.length > 0;
                        const drillable = !selectedDefinition && segment.length > 0;
                        const segmentPercent = segment.length < 0.1 ? "<0.1%" : `${segment.length.toFixed(1)}%`;
                        const segmentLabel = `${segment.label}, ${formatCount(segment.tokens)} ${t("composer.tokens")}, ${segmentPercent}`;
                        return (
                          <circle
                            className={`context-usage-ring-segment${drillable ? " drillable" : ""}${active ? " active" : ""}${segment.length <= 0 ? " empty" : ""}`}
                            key={segment.key}
                            data-context-segment={segment.key}
                            cx="50"
                            cy="50"
                            r="40"
                            pathLength="100"
                            stroke={segment.color}
                            strokeDasharray={ringReady ? `${segment.length} ${100 - segment.length}` : "0 100"}
                            strokeDashoffset={ringReady ? -segment.offset : 0}
                            role={drillable ? "button" : segment.length > 0 ? "img" : undefined}
                            tabIndex={segment.length > 0 ? 0 : undefined}
                            aria-hidden={segment.length <= 0 ? true : undefined}
                            aria-label={segment.length > 0
                              ? drillable
                                ? `${t("composer.contextViewDetails", { label: segment.label })}. ${segmentLabel}`
                                : segmentLabel
                              : undefined}
                            aria-describedby={active ? tooltipId : undefined}
                            onPointerDown={(event) => {
                              if (event.pointerType === "mouse") event.preventDefault();
                            }}
                            onMouseEnter={() => segment.length > 0 && setActiveSegmentKey(segment.key)}
                            onMouseLeave={() => setActiveSegmentKey((current) => current === segment.key ? null : current)}
                            onFocus={() => segment.length > 0 && setActiveSegmentKey(segment.key)}
                            onBlur={() => setActiveSegmentKey((current) => current === segment.key ? null : current)}
                            onClick={drillable ? () => selectCategory(segment.categoryKey) : undefined}
                            onKeyDown={drillable ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                selectCategory(segment.categoryKey);
                              }
                            } : undefined}
                          />
                        );
                      })}
                    </svg>
                    <div className={`context-usage-ring-value${selectedDefinition ? " detail-view" : ""}${activeSegment ? " showing-tooltip" : ""}`}>
                      {activeSegment ? (
                        <div className="context-usage-tooltip" id={tooltipId} role="tooltip">
                          <strong>{activeSegment.label}</strong>
                          <span>{formatCount(activeSegment.tokens)} {t("composer.tokens")}</span>
                          <small>{activeSegment.length < 0.1 ? "<0.1%" : `${activeSegment.length.toFixed(1)}%`}</small>
                        </div>
                      ) : selectedDefinition ? (
                        <button
                          type="button"
                          className="context-usage-ring-back"
                          aria-label={t("composer.contextBackOverview")}
                          onClick={showOverview}
                        >
                          <strong>{selectedLabel}</strong>
                          <span>{formatCount(selectedCategoryTokens)} {t("composer.tokens")}</span>
                          <small>{t("composer.contextBackOverview")}</small>
                        </button>
                      ) : (
                        <div className="context-usage-ring-summary" aria-hidden="true">
                          <strong>{contextKnown ? `${Math.round(contextPercent)}%` : "—"}</strong>
                          <span>{formatCount(displayTokens)} {t("composer.tokens")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="workspace-context-strip">
          <button
            type="button"
            className="workspace-session"
            onClick={() => ignoreCommandFailure(setWorkspaceDir())}
            title={`${t("composer.changeWorkspace")}: ${workspaceDir}`}
            aria-label={`${t("composer.changeWorkspace")}: ${workspaceDisplayName} - ${sessionDisplayName}`}
          >
            <Folder size={13} strokeWidth={1.6} className="workspace-folder-icon" aria-hidden="true" />
            <span className="workspace-dir-name">{workspaceDisplayName}</span>
            <span className="workspace-session-separator" aria-hidden="true">/</span>
            <span className="workspace-session-name">{sessionDisplayName}</span>
          </button>
          {noModel ? (
            <div className="workspace-model-notice">
              <button type="button" onClick={() => openSettings("models")}>
                {t(stats?.model ? "composer.configureCredentialsAction" : "composer.configureModelAction")}
              </button>
            </div>
          ) : showQuickPrompts ? <QuickPrompts /> : null}
        </div>
      </div>
    </div>
  );
}

export function ContextUsageTrigger({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle(): void;
}): React.JSX.Element {
  const { t } = useI18n();
  const rawPercent = useMoros((state) => state.stats?.contextPercent);
  const contextPercent = Math.min(100, Math.max(0, rawPercent ?? 0));
  const contextKnown = rawPercent !== null && rawPercent !== undefined;

  return (
    <div className="toolbar-anchor context-anchor">
      <button
        type="button"
        className={`context-trigger${expanded ? " active" : ""}${contextPercent > 75 ? " high" : ""}`}
        aria-label={contextKnown ? t("composer.contextUsedPercent", { percent: Math.round(contextPercent) }) : t("composer.contextUnknown")}
        aria-expanded={expanded}
        title={t("composer.contextUsage")}
        onClick={onToggle}
      >
        <svg viewBox="0 0 28 28" aria-hidden="true">
          <circle className="context-track" cx="14" cy="14" r="10.5" />
          {contextKnown && (
            <circle
              className="context-progress"
              cx="14"
              cy="14"
              r="10.5"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 - contextPercent}
            />
          )}
        </svg>
      </button>
    </div>
  );
}
