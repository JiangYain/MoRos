import type { ThreadConfirmationState } from "../thread-confirmation.ts";

export interface SessionConfirmationCommands {
  archive(path: string): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface SessionConfirmationLifecycle {
  clear(confirmation: ThreadConfirmationState): void;
  fail(confirmation: ThreadConfirmationState): void;
  start(confirmation: ThreadConfirmationState): void;
}

export async function runSessionConfirmationCommand(
  confirmation: ThreadConfirmationState,
  commands: SessionConfirmationCommands,
  lifecycle: SessionConfirmationLifecycle,
): Promise<void> {
  if (confirmation.busy) return;

  lifecycle.start(confirmation);
  try {
    await commands[confirmation.action](confirmation.path);
  } catch (error) {
    lifecycle.fail(confirmation);
    throw error;
  }
  lifecycle.clear(confirmation);
}
