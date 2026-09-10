import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function insideDirectory(root: string, target: string): boolean {
  const offset = relative(root, target);
  return !offset || (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset));
}

export async function workspaceRoot(workspaceDir: string): Promise<string> {
  if (!workspaceDir) throw new Error("WB_NO_WORKSPACE");
  const root = await realpath(workspaceDir);
  if (!(await stat(root)).isDirectory()) throw new Error("WB_NO_WORKSPACE");
  return root;
}

export async function resolveWorkbenchFile(root: string, path: string, grantedFiles: ReadonlySet<string> = new Set()): Promise<string> {
  if (!path || path.includes("\0")) throw new Error("WB_INVALID_PATH");
  const target = await realpath(resolve(root, path));
  if (!insideDirectory(root, target) && !grantedFiles.has(target)) throw new Error("WB_OUTSIDE_WORKSPACE");
  if (!(await stat(target)).isFile()) throw new Error("WB_NOT_FILE");
  return target;
}

export function safeBrowserUrl(value: string): string {
  const trimmed = value.trim();
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed);
  const url = new URL(local ? `http://${trimmed}` : /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) throw new Error("WB_UNSAFE_URL");
  return url.href;
}

export interface BrowserArtifactPolicy {
  readonly restricted: boolean;
  allows(url: string): boolean;
  observe(url: string): void;
}

/** Once a tab loads a capability URL it must never become an unrestricted browser. */
export function createBrowserArtifactPolicy(
  initialUrl: string,
  isArtifactAllowed: (url: string) => boolean,
): BrowserArtifactPolicy {
  let restricted = Boolean(initialUrl && isArtifactAllowed(initialUrl));
  return {
    get restricted() { return restricted; },
    allows: (url) => !restricted || isArtifactAllowed(url),
    observe: (url) => { restricted ||= Boolean(url && isArtifactAllowed(url)); },
  };
}
