export const THREAD_CONFIRMATION_DURATION_MS = 5_000;

export function remainingConfirmationSeconds(
  deadline: number,
  now: number = Date.now(),
): number {
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}

export function startThreadConfirmationTimeout(
  onElapsed: () => void,
  durationMs: number = THREAD_CONFIRMATION_DURATION_MS,
): () => void {
  let active = true;
  const timeout = setTimeout(() => {
    if (!active) return;
    active = false;
    onElapsed();
  }, durationMs);

  return () => {
    if (!active) return;
    active = false;
    clearTimeout(timeout);
  };
}
