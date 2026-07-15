import { X } from "lucide-react";
import { type TranslationKey, useI18n } from "../../i18n";
import { useCompass } from "../../store";
import { QuickPrompts } from "../QuickPrompts";

const CONTEXT_SEGMENTS = [
  { key: "systemPrompt", labelKey: "composer.segment.systemPrompt", color: "#777777" },
  { key: "toolDefinitions", labelKey: "composer.segment.toolDefinitions", color: "#7562d6" },
  { key: "rules", labelKey: "composer.segment.rules", color: "#008553" },
  { key: "skills", labelKey: "composer.segment.skills", color: "#b57700" },
  { key: "mcpTools", labelKey: "composer.segment.mcpTools", color: "#a91768" },
  { key: "subagents", labelKey: "composer.segment.subagents", color: "#2d7fc0" },
  { key: "conversation", labelKey: "composer.segment.conversation", color: "#d83a1f" },
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

interface ContextUsageSurfaceProps {
  expanded: boolean;
  onClose(): void;
  showQuickPrompts?: boolean;
}

export function ContextUsageSurface({ expanded, onClose, showQuickPrompts = false }: ContextUsageSurfaceProps): React.JSX.Element {
  const { t } = useI18n();
  const stats = useCompass((state) => state.stats);
  const clientRegistry = useCompass((state) => state.clientRegistry);
  const openSettings = useCompass((state) => state.openSettings);
  const sessionId = stats?.sessionId;
  const clientName = sessionId ? clientRegistry.assignments[sessionId] : undefined;
  const clientDisplayName = clientName || t("context.unassigned");
  const noModel = !stats?.model || !stats.modelAuthConfigured;
  const rawPercent = stats?.contextPercent;
  const contextPercent = Math.min(100, Math.max(0, rawPercent ?? 0));
  const contextKnown = rawPercent !== null && rawPercent !== undefined;
  const contextTokens = stats?.contextTokens ?? 0;
  const contextWindow = stats?.contextWindow ?? 0;
  const breakdown = stats?.contextBreakdown ?? {
    systemPrompt: 0,
    toolDefinitions: 0,
    rules: 0,
    skills: 0,
    mcpTools: 0,
    subagents: 0,
    conversation: contextTokens,
    estimated: true,
  };
  const rows = CONTEXT_SEGMENTS.map((segment) => ({
    ...segment,
    tokens: breakdown[segment.key],
  }));
  const displayTokens = contextTokens > 0
    ? contextTokens
    : rows.reduce((total, segment) => total + segment.tokens, 0);
  const breakdownTokens = rows.reduce((total, segment) => total + segment.tokens, 0);
  const ringScale = contextWindow > 0
    ? 100 / contextWindow
    : breakdownTokens > 0
      ? contextPercent / breakdownTokens
      : 0;
  let ringOffset = 0;
  const ringSegments = rows.flatMap((segment) => {
    const length = Math.min(Math.max(segment.tokens * ringScale, 0), 100 - ringOffset);
    if (length <= 0) return [];
    const ringSegment = { ...segment, length, offset: ringOffset };
    ringOffset += length;
    return [ringSegment];
  });
  const ringLabel = contextKnown
    ? t("composer.contextUsedPercent", { percent: Math.round(contextPercent) })
    : t("composer.contextUnknown");

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
                  <div className="context-usage-meta">
                    <span>{contextKnown ? t("composer.contextFull", { percent: Math.round(contextPercent) }) : t("composer.contextNoPercent")}</span>
                    <span>{formatCount(displayTokens)} / {formatCount(contextWindow)} {t("composer.tokens")}</span>
                  </div>
                  <div className="context-usage-list">
                    {rows.map((segment) => (
                      <div className="context-usage-row" key={segment.key}>
                        <span className="context-usage-swatch" style={{ backgroundColor: segment.color }} />
                        <span>{t(segment.labelKey as TranslationKey)}</span>
                        <b>{formatCount(segment.tokens, breakdown.estimated)}</b>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="context-usage-visual" role="img" aria-label={ringLabel}>
                  <div className="context-usage-ring-shell">
                    <svg className="context-usage-ring" viewBox="0 0 100 100" aria-hidden="true">
                      <circle className="context-usage-ring-track" cx="50" cy="50" r="40" />
                      {ringSegments.map((segment) => (
                        <circle
                          className="context-usage-ring-segment"
                          key={segment.key}
                          cx="50"
                          cy="50"
                          r="40"
                          pathLength="100"
                          stroke={segment.color}
                          strokeDasharray={`${segment.length} ${100 - segment.length}`}
                          strokeDashoffset={-segment.offset}
                        />
                      ))}
                    </svg>
                    <div className="context-usage-ring-value" aria-hidden="true">
                      <strong>{contextKnown ? `${Math.round(contextPercent)}%` : "—"}</strong>
                      <span>{formatCount(displayTokens)} {t("composer.tokens")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <div className="workspace-context-strip">
          <div className="workspace-client" title={clientName ?? t("context.unassigned")}>
            <span className="workspace-client-name">{clientDisplayName}</span>
          </div>
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
  const rawPercent = useCompass((state) => state.stats?.contextPercent);
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
