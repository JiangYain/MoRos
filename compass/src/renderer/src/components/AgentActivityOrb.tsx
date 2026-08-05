import { ThinkingOrb } from "thinking-orbs";
import { type TranslationKey, useI18n } from "../i18n";
import type { ThreadActivityState } from "./threadActivity";

const STATUS_KEYS: Record<ThreadActivityState, TranslationKey> = {
  working: "thread.activityStatus.working",
  searching: "thread.activityStatus.searching",
  solving: "thread.activityStatus.solving",
  composing: "thread.activityStatus.composing",
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
  const classes = ["agent-activity-orb", className].filter(Boolean).join(" ");
  const orb = (
    <ThinkingOrb
      state={state}
      size={20}
      theme="auto"
      role="presentation"
      aria-hidden="true"
      aria-label=""
      className="agent-activity-orb-canvas"
      data-agent-activity-state={state}
    />
  );

  if (decorative) {
    return (
      <span className={classes} data-agent-activity-orb={state} aria-hidden="true">
        {orb}
      </span>
    );
  }

  return (
    <span
      className={classes}
      data-agent-activity-orb={state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {orb}
      <span className="agent-activity-status-text">{t(STATUS_KEYS[state])}</span>
    </span>
  );
}
