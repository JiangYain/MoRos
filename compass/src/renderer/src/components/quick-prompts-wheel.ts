/**
 * Pure decision logic for the quick-prompts wheel handler.
 *
 * Requirements:
 *  - A single quick prompt must never hijack the page scroll.
 *  - With multiple prompts, only prevent the default scroll when a switch will
 *    actually happen or the gesture is still being accumulated towards one.
 *  - Once a switch fires, lock further switches until the wheel gesture rests
 *    for the reset window, so one trackpad swipe does not skip multiple items.
 */

export interface WheelDecision {
  /** Whether to call preventDefault on the wheel event. */
  preventDefault: boolean;
  /** -1 = previous, 1 = next, 0 = do not switch yet. */
  switchDirection: -1 | 0 | 1;
  /** Reset the accumulated delta back to 0 after applying this event. */
  resetAccumulator: boolean;
  /** Whether to engage the gesture lock for subsequent events. */
  lockGesture: boolean;
}

/**
 * Decide what to do for a wheel tick on the quick-prompts surface.
 *
 * @param promptsLength   How many quick prompts are configured.
 * @param accumulatedDelta The signed accumulated deltaY since the last reset.
 * @param threshold       |delta| that must accumulate before a switch fires.
 * @param gestureLocked   Whether the gesture lock is currently held.
 */
export function decideQuickPromptWheel(
  promptsLength: number,
  accumulatedDelta: number,
  threshold: number,
  gestureLocked: boolean,
): WheelDecision {
  // Single (or empty) prompt: never hijack scroll, never switch, never lock.
  if (promptsLength <= 1) {
    return {
      preventDefault: false,
      switchDirection: 0,
      resetAccumulator: true,
      lockGesture: false,
    };
  }

  // Multiple prompts but the lock is held: keep absorbing the gesture so the
  // page does not scroll, but do not switch again until the lock releases.
  if (gestureLocked) {
    return {
      preventDefault: true,
      switchDirection: 0,
      resetAccumulator: false,
      lockGesture: true,
    };
  }

  // Not enough accumulated delta to switch yet. Keep accumulating and prevent
  // default so the surface does not jitter between scrolling and switching.
  if (Math.abs(accumulatedDelta) < threshold) {
    return {
      preventDefault: true,
      switchDirection: 0,
      resetAccumulator: false,
      lockGesture: false,
    };
  }

  // Threshold crossed: fire exactly one switch and lock until the rest window.
  return {
    preventDefault: true,
    switchDirection: accumulatedDelta > 0 ? 1 : -1,
    resetAccumulator: true,
    lockGesture: true,
  };
}
