import { useId } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { type TranslationKey, useI18n } from "../i18n";
import type { ThreadActivityState } from "./threadActivity";

const STATUS_KEYS: Record<ThreadActivityState, TranslationKey> = {
  working: "thread.activityStatus.working",
  searching: "thread.activityStatus.searching",
  solving: "thread.activityStatus.solving",
};

export function AgentActivityOrb({
  state,
  decorative = false,
  className,
}: {
  state: ThreadActivityState;
  decorative?: boolean;
  className?: string;
}): React.JSX.Element {
  const { t } = useI18n();
  const accentFilterId = `agent-activity-orb-accent-${useId().replace(/:/g, "")}`;
  const activeState = state;
  const classes = ["agent-activity-orb", className].filter(Boolean).join(" ");
  const orb = (
    <>
      <svg width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id={accentFilterId} colorInterpolationFilters="sRGB">
            <feFlood floodColor="var(--color-accent)" result="accent" />
            <feComposite in="accent" in2="SourceAlpha" operator="in" />
          </filter>
        </defs>
      </svg>
      <ThinkingOrb
        state={activeState}
        size={20}
        theme="auto"
        role="presentation"
        aria-hidden="true"
        aria-label=""
        className="agent-activity-orb-canvas"
        data-agent-activity-state={activeState}
        style={{ filter: `url(#${accentFilterId})` }}
      />
    </>
  );

  if (decorative) {
    return (
      <span className={classes} data-agent-activity-orb={activeState} aria-hidden="true">
        {orb}
      </span>
    );
  }

  return (
    <span
      className={classes}
      data-agent-activity-orb={activeState}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {orb}
      <span className="agent-activity-status-text">{t(STATUS_KEYS[activeState])}</span>
    </span>
  );
}
