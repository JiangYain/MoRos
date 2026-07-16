/**
 * Pure decision logic for the quick-prompts wheel handler.
 *
 * Requirements:
 *  - A single quick prompt must never hijack the page scroll.
 *  - With multiple prompts, only prevent the default scroll on the wheel tick
 *    that actually crosses the threshold and switches the visible prompt.
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

  // The gesture already switched once. Ignore its trailing wheel ticks without
  // continuing to hijack the surrounding page scroll.
  if (gestureLocked) {
    return {
      preventDefault: false,
      switchDirection: 0,
      resetAccumulator: true,
      lockGesture: true,
    };
  }

  // Not enough accumulated delta to switch yet. Keep accumulating, but leave
  // the surrounding page scroll alone until this gesture becomes a switch.
  if (Math.abs(accumulatedDelta) < threshold) {
    return {
      preventDefault: false,
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
