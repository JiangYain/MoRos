export const THREAD_CONFIRMATION_DURATION_MS = 5_000;

export type ThreadConfirmationAction = "archive" | "delete";

export interface ThreadConfirmationState {
  path: string;
  action: ThreadConfirmationAction;
  busy: boolean;
}

export type ThreadConfirmations = Record<string, ThreadConfirmationState>;

export type ThreadConfirmationEvent =
  | { type: "request"; path: string; action: ThreadConfirmationAction }
  | { type: "start"; path: string; action: ThreadConfirmationAction }
  | { type: "clear"; path: string; action?: ThreadConfirmationAction }
  | { type: "clear-idle" };

export function threadConfirmationsReducer(
  confirmations: ThreadConfirmations,
  event: ThreadConfirmationEvent,
): ThreadConfirmations {
  if (event.type === "request") {
    return {
      ...confirmations,
      [event.path]: { path: event.path, action: event.action, busy: false },
    };
  }

  if (event.type === "start") {
    const current = confirmations[event.path];
    if (!current || current.action !== event.action || current.busy) return confirmations;
    return { ...confirmations, [event.path]: { ...current, busy: true } };
  }

  if (event.type === "clear") {
    const current = confirmations[event.path];
    if (!current || (event.action && current.action !== event.action)) return confirmations;
    const next = { ...confirmations };
    delete next[event.path];
    return next;
  }

  const busyConfirmations = Object.fromEntries(
    Object.entries(confirmations).filter(([, confirmation]) => confirmation.busy),
  );
  return Object.keys(busyConfirmations).length === Object.keys(confirmations).length
    ? confirmations
    : busyConfirmations;
}

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
