import { ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMoros } from "../store";
import { useI18n } from "../i18n";
import { decideQuickPromptWheel } from "./quick-prompts-wheel";

// 滚动速度（px/ms）：duration = overflow / speed，距离越长耗时越久。
const SCROLL_SPEED_PX_PER_MS = 0.06;
const RESET_DURATION_MS = 240;

// 累积滚轮 delta 达到阈值后切换一项，并锁定到整段滚轮手势结束。
// 只有连续 WHEEL_RESET_MS 没有新事件才解锁，避免触控板一次手势跳过多项。
const WHEEL_THRESHOLD = 40;
const WHEEL_RESET_MS = 200;

interface QuickPromptButtonProps {
  index: number;
  text: string;
}

function QuickPromptButton({ index, text }: QuickPromptButtonProps): React.JSX.Element {
  const seedComposer = useMoros((s) => s.seedComposer);
  const reduced = useReducedMotion();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const textEl = textRef.current;
    if (!wrap || !textEl) return;
    const measure = (): void => {
      const next = Math.max(0, Math.round(textEl.scrollWidth - wrap.clientWidth));
      setOverflow(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(textEl);
    return () => ro.disconnect();
  }, [text]);

  const canReveal = !reduced && overflow > 0;
  const translate = revealed && canReveal ? -overflow : 0;
  const revealDuration = Math.min(2400, Math.max(300, Math.round(overflow / SCROLL_SPEED_PX_PER_MS)));
  const transition = reduced
    ? "none"
    : revealed
      ? `transform ${revealDuration}ms linear`
      : `transform ${RESET_DURATION_MS}ms ease-out`;

  return (
    <button
      type="button"
      className="quick-prompt-btn"
      title={reduced ? text : undefined}
      onClick={() => seedComposer(text)}
      onMouseEnter={() => setRevealed(true)}
      onMouseLeave={() => setRevealed(false)}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
    >
      <span className="quick-prompt-idx" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <span className="quick-prompt-text-wrap" ref={wrapRef}>
        <span className="quick-prompt-text" ref={textRef} style={{ transform: `translateX(${translate}px)`, transition }}>
          {text}
        </span>
      </span>
    </button>
  );
}

export function QuickPrompts(): React.JSX.Element {
  const { t } = useI18n();
  const configuredPrompts = useMoros((state) => state.settings?.quickPrompts);
  const prompts = configuredPrompts ?? [t("hero.prompt1"), t("hero.prompt2"), t("hero.prompt3")];
  const [index, setIndex] = useState(0);
  const accumulatedRef = useRef(0);
  const gestureLockedRef = useRef(false);
  const resetTimeoutRef = useRef<number | null>(null);

  const switchBy = useCallback((delta: number): void => {
    setIndex((current) => (current + delta + prompts.length) % prompts.length);
  }, [prompts.length]);

  useEffect(() => {
    setIndex((current) => Math.min(current, prompts.length - 1));
  }, [prompts.length]);

  const currentIndex = Math.min(index, Math.max(0, prompts.length - 1));
  const currentPrompt = prompts[currentIndex] ?? "";

  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>): void => {
    const decision = decideQuickPromptWheel(
      prompts.length,
      accumulatedRef.current + event.deltaY,
      WHEEL_THRESHOLD,
      gestureLockedRef.current,
    );

    if (decision.preventDefault) {
      event.preventDefault();
    }

    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = window.setTimeout(() => {
      accumulatedRef.current = 0;
      gestureLockedRef.current = false;
      resetTimeoutRef.current = null;
    }, WHEEL_RESET_MS);

    if (decision.resetAccumulator) {
      accumulatedRef.current = 0;
    } else {
      accumulatedRef.current += event.deltaY;
    }

    if (decision.lockGesture) {
      gestureLockedRef.current = true;
    }

    if (decision.switchDirection !== 0) {
      switchBy(decision.switchDirection);
    }
  }, [switchBy, prompts.length]);

  useEffect(() => () => {
    if (resetTimeoutRef.current !== null) window.clearTimeout(resetTimeoutRef.current);
  }, []);

  return (
    <div
      className="quick-prompts"
      onWheel={onWheel}
      role={prompts.length > 1 ? "group" : undefined}
      aria-label={prompts.length > 1 ? t("settings.quickPromptsScrollHint") : undefined}
    >
      <QuickPromptButton index={currentIndex} text={currentPrompt} />
      {prompts.length > 1 && (
        <span className="quick-prompts-status" aria-live="polite">
          {t("settings.quickPromptsPosition", { current: currentIndex + 1, total: prompts.length })}
        </span>
      )}
      {prompts.length > 1 && (
        <button
          type="button"
          className="quick-prompts-next"
          aria-label={t("settings.quickPromptsNext")}
          title={t("settings.quickPromptsNext")}
          onClick={() => switchBy(1)}
        >
          <ChevronRight size={13} strokeWidth={1.7} aria-hidden />
        </button>
      )}
    </div>
  );
}
