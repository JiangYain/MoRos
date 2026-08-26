/**
 * Workspace path display helpers.
 *
 * Paths can be long; the settings surface elides the middle for compact
 * display but exposes the full path for copying and a hover/expand affordance.
 */

/**
 * Elide a filesystem path in the middle so the start and end remain visible.
 * Returns the input unchanged when it already fits or is too short to elide.
 *
 * @param path    The full path to elide.
 * @param maxChars Maximum number of characters to keep. Must be >= 5.
 */
export function elideWorkspacePath(path: string, maxChars: number): string {
  const value = path ?? "";
  if (maxChars < 5) return value;
  if (value.length <= maxChars) return value;
  const headChars = Math.max(1, Math.ceil((maxChars - 1) / 2));
  const tailChars = Math.max(1, Math.floor((maxChars - 1) / 2));
  const head = value.slice(0, headChars);
  const tail = value.slice(value.length - tailChars);
  return `${head}…${tail}`;
}

/**
 * Whether the path is long enough to benefit from elision at the given width.
 */
export function isWorkspacePathLong(path: string, maxChars: number): boolean {
  return (path ?? "").length > maxChars;
}
