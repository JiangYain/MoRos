import { Folder, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../ipc";
import { useCompass } from "../../store";

const CONTEXT_SEGMENTS = [
  { key: "systemPrompt", label: "System prompt", color: "#777777" },
  { key: "toolDefinitions", label: "Tool definitions", color: "#7562d6" },
  { key: "rules", label: "Rules", color: "#008553" },
  { key: "skills", label: "Skills", color: "#b57700" },
  { key: "mcpTools", label: "MCP & dynamic tools", color: "#a91768" },
  { key: "subagents", label: "Subagent definitions", color: "#2d7fc0" },
  { key: "conversation", label: "Conversation", color: "#d83a1f" },
] as const;

function workspaceName(path: string | undefined): string {
  const parts = path?.split(/[\\/]/).filter(Boolean) ?? [];
  return parts.at(-1) ?? "选择工作区";
}

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
}

export function ContextUsageSurface({ expanded, onClose }: ContextUsageSurfaceProps): React.JSX.Element {
  const settings = useCompass((state) => state.settings);
  const stats = useCompass((state) => state.stats);
  const [reportOpen, setReportOpen] = useState(true);
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

  return (
    <div className={`workspace-context-shell${expanded ? " expanded" : ""}`}>
      <div className="workspace-context-surface">
        {expanded && (
          <section className="context-usage-panel" aria-label="Context usage">
            <div className="context-usage-inner">
              <div className="context-usage-head">
                <span>Context Usage</span>
                <div>
                  <button
                    type="button"
                    className="context-report-toggle"
                    aria-expanded={reportOpen}
                    onClick={() => setReportOpen((current) => !current)}
                  >
                    {breakdown.estimated ? "Estimated breakdown" : "View Report"}
                  </button>
                  <button type="button" className="context-close" aria-label="Close context usage" onClick={onClose}>
                    <X size={14} strokeWidth={1.55} />
                  </button>
                </div>
              </div>
              <div className="context-usage-meta">
                <span>{contextKnown ? `${Math.round(contextPercent)}% Full` : "— Full"}</span>
                <span>{formatCount(displayTokens)} / {formatCount(contextWindow)} Tokens</span>
              </div>
              <div className="context-usage-meter" aria-hidden="true">
                {rows.filter((segment) => segment.tokens > 0).map((segment) => (
                  <span
                    key={segment.key}
                    style={{
                      backgroundColor: segment.color,
                      flexBasis: `${contextWindow > 0 ? (segment.tokens / contextWindow) * 100 : 0}%`,
                    }}
                  />
                ))}
              </div>
              {reportOpen && (
                <div className="context-usage-list">
                  {rows.map((segment) => (
                    <div className="context-usage-row" key={segment.key}>
                      <span className="context-usage-swatch" style={{ backgroundColor: segment.color }} />
                      <span>{segment.label}</span>
                      <b>{formatCount(segment.tokens, breakdown.estimated)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        <button
          type="button"
          className="workspace-tab"
          title={settings?.workspaceDir}
          onClick={() => {
            if (settings?.workspaceDir) void api.openPath(settings.workspaceDir);
          }}
        >
          <Folder size={15} strokeWidth={1.6} />
          <span>{workspaceName(settings?.workspaceDir)}</span>
        </button>
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
  const rawPercent = useCompass((state) => state.stats?.contextPercent);
  const contextPercent = Math.min(100, Math.max(0, rawPercent ?? 0));
  const contextKnown = rawPercent !== null && rawPercent !== undefined;

  return (
    <div className="toolbar-anchor context-anchor">
      <button
        type="button"
        className={`context-trigger${expanded ? " active" : ""}${contextPercent > 75 ? " high" : ""}`}
        aria-label={contextKnown ? `上下文已使用 ${Math.round(contextPercent)}%` : "上下文用量未知"}
        aria-expanded={expanded}
        title="Context usage"
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
