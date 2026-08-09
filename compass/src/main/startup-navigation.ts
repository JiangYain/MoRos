/**
 * Electron rejects an in-flight `loadURL` with ERR_ABORTED when the renderer
 * replaces that navigation (for example, an early reload). That is not a
 * startup failure and must not tear down an otherwise healthy window.
 */
export function isSupersededNavigation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "ERR_ABORTED"
    || (typeof candidate.message === "string" && /\bERR_ABORTED\b/.test(candidate.message));
}

export async function observeInitialNavigation(
  navigation: Promise<unknown>,
  onFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await navigation;
  } catch (error) {
    if (!isSupersededNavigation(error)) onFailure(error);
  }
}

export function shouldShowStartupErrorDialog(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return !environment.CI && environment.COMPASS_HEADLESS !== "1";
}
