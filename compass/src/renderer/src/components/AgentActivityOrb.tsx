import { useEffect, useId, useRef, useState } from "react";
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
  fallback,
}: {
  state?: ThreadActivityState | null;
  decorative?: boolean;
  className?: string;
  fallback?: React.ReactNode;
}): React.JSX.Element | null {
  const { t } = useI18n();
  const accentFilterId = `agent-activity-orb-accent-${useId().replace(/:/g, "")}`;

  const [displayState, setDisplayState] = useState<ThreadActivityState | undefined>(
    state ?? undefined,
  );
  const startTimeRef = useRef<number>(state ? Date.now() : 0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDisplayState(state);
      startTimeRef.current = Date.now();
    } else {
      const elapsed = Date.now() - startTimeRef.current;
      const minHold = 600;
      if (elapsed < minHold) {
        const remaining = minHold - elapsed;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setDisplayState(undefined);
          timerRef.current = null;
        }, remaining);
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        setDisplayState(undefined);
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state]);

  if (!displayState) {
    return <>{fallback ?? null}</>;
  }

  const activeState = displayState;
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
