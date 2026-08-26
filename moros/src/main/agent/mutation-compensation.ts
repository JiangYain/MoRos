function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Preserves both the initiating failure and every failed compensation. This is
 * deliberately an AggregateError so diagnostics retain the original causes,
 * while the message remains useful at RPC boundaries that only expose text.
 */
export function compensatedMutationError(
  context: string,
  cause: unknown,
  compensationFailures: readonly unknown[],
): unknown {
  if (compensationFailures.length === 0) return cause;
  return new AggregateError(
    [cause, ...compensationFailures],
    `${context} failed: ${describeFailure(cause)}; compensation failed: ${compensationFailures
      .map(describeFailure)
      .join("; ")}`,
    { cause },
  );
}
