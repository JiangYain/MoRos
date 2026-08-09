const REPORTED_COMMAND_FAILURE = Symbol("reported-command-failure");

interface ReportedCommandError extends Error {
  [REPORTED_COMMAND_FAILURE]: true;
}

export interface StoreCommandRunnerOptions {
  reportError(message: string): void;
  sanitizeError(error: unknown): string;
}

export type StoreCommandRunner = <T>(command: () => Promise<T>) => Promise<T>;

function isReportedCommandError(error: unknown): error is ReportedCommandError {
  return error instanceof Error
    && REPORTED_COMMAND_FAILURE in error
    && error[REPORTED_COMMAND_FAILURE] === true;
}

function reportedCommandError(error: unknown, sanitizeError: (error: unknown) => string): ReportedCommandError {
  const reported = new Error(sanitizeError(error)) as ReportedCommandError;
  Object.defineProperty(reported, REPORTED_COMMAND_FAILURE, { value: true });
  return reported;
}

/**
 * Run a user-observable store command.
 *
 * Failures update the store exactly once and remain rejected so an awaiting UI
 * can keep editors open, roll back optimistic state, or otherwise react to the
 * failure. Nested commands preserve the already-reported error.
 */
export function createStoreCommandRunner(options: StoreCommandRunnerOptions): StoreCommandRunner {
  return async <T>(command: () => Promise<T>): Promise<T> => {
    try {
      return await command();
    } catch (error) {
      if (isReportedCommandError(error)) throw error;
      const reported = reportedCommandError(error, options.sanitizeError);
      options.reportError(reported.message);
      throw reported;
    }
  };
}

/**
 * Mark an intentionally best-effort command invocation. The command itself is
 * responsible for reporting its error to the store; this only prevents a
 * fire-and-forget event handler from creating an unhandled rejection.
 */
export function ignoreCommandFailure(command: Promise<unknown>): void {
  void command.catch(() => undefined);
}

export function requireCommandSuccess(
  result: { ok: boolean; error?: string },
  fallbackMessage: string,
): void {
  if (!result.ok) throw new Error(result.error || fallbackMessage);
}
