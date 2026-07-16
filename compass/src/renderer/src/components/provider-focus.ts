/**
 * Focus restoration helper for the Provider API key editor.
 *
 * When the inline editor closes (save / cancel / Escape), focus must return to
 * the button that opened it so keyboard users are not stranded. This module
 * keeps that decision pure and testable: it picks the element to focus next
 * given the close reason and the available anchors.
 */

export type EditorCloseReason = "save" | "cancel" | "escape" | "blur";

export interface FocusRestoreTargets {
  /** The button that opened the editor. */
  triggerButton: HTMLElement | null;
  /** The editor input itself (used as a last-resort fallback). */
  editorInput: HTMLElement | null;
}

/**
 * Pick the element that should receive focus after the editor closes.
 *
 * - For any explicit close (save, cancel, escape), return the trigger button
 *   so the user lands back on the row they were editing.
 * - If the trigger button is gone (e.g. the list re-rendered), fall back to the
 *   editor input so focus is not lost entirely; callers can then move it.
 */
export function pickFocusRestoreTarget(
  reason: EditorCloseReason,
  targets: FocusRestoreTargets,
): HTMLElement | null {
  void reason; // all explicit reasons restore to the trigger
  return targets.triggerButton ?? targets.editorInput;
}
