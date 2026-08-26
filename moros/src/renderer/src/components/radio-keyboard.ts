/**
 * Keyboard navigation helper for radiogroup widgets (role="radio").
 *
 * Implements the WAI-ARIA roving-tabindex pattern: ArrowUp/ArrowLeft move to
 * the previous option, ArrowDown/ArrowRight to the next, Home jumps to the
 * first option, End to the last. All wrap-free except arrow keys, which wrap
 * per the radiogroup spec when the list is not empty.
 *
 * Returns -1 for unrecognized keys so callers can fall through to default
 * handling (e.g. letting Enter/Space activate the focused option).
 */
export type RadioNavigationKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End";

export function isRadioNavigationKey(key: string): key is RadioNavigationKey {
  return key === "ArrowUp" || key === "ArrowDown"
    || key === "ArrowLeft" || key === "ArrowRight"
    || key === "Home" || key === "End";
}

/**
 * Compute the next focused index for a radiogroup given the pressed key.
 * Returns the unchanged current index when the list is empty. Arrows wrap
 * around the edges. Home/End clamp to the first/last item.
 */
export function nextRadioIndex(
  currentIndex: number,
  itemCount: number,
  key: RadioNavigationKey,
): number {
  if (itemCount <= 0) return -1;
  const lastIndex = itemCount - 1;
  const safeCurrent = currentIndex < 0 || currentIndex > lastIndex ? 0 : currentIndex;
  switch (key) {
    case "ArrowUp":
    case "ArrowLeft":
      return safeCurrent === 0 ? lastIndex : safeCurrent - 1;
    case "ArrowDown":
    case "ArrowRight":
      return safeCurrent === lastIndex ? 0 : safeCurrent + 1;
    case "Home":
      return 0;
    case "End":
      return lastIndex;
    default:
      return safeCurrent;
  }
}
