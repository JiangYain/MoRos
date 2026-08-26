import type { UiSessionInfo } from "@shared/types";

export interface WorkspaceSessionGroup {
  key: string;
  workspacePath: string | null;
  workspaceName: string;
  isCurrent: boolean;
  isPinned: boolean;
  sessions: UiSessionInfo[];
  latestModifiedAt: number;
}

interface WorkspaceGroupOptions {
  currentWorkspaceDir: string;
  legacyWorkspaceName: string;
  pinned: Readonly<Record<string, boolean>>;
  sessions: readonly UiSessionInfo[];
}

function trimTrailingSeparators(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  return trimmed || path.trim();
}

function comparablePath(path: string): string {
  const normalized = trimTrailingSeparators(path).replace(/\\/g, "/");
  return /^[a-z]:\//i.test(normalized) ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function workspaceKeyForPath(path: string): string {
  return `path:${comparablePath(path)}`;
}

function legacyWorkspaceKey(sessionPath: string): string {
  const normalized = sessionPath.replace(/\\/g, "/");
  const separator = normalized.lastIndexOf("/");
  const directory = separator >= 0 ? normalized.slice(0, separator) : normalized;
  return `legacy:${directory.toLocaleLowerCase("en-US")}`;
}

function workspaceName(path: string): string {
  const parts = trimTrailingSeparators(path).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function buildWorkspaceSessionGroups({
  currentWorkspaceDir,
  legacyWorkspaceName,
  pinned,
  sessions,
}: WorkspaceGroupOptions): WorkspaceSessionGroup[] {
  const groups = new Map<string, WorkspaceSessionGroup>();
  const currentKey = currentWorkspaceDir ? workspaceKeyForPath(currentWorkspaceDir) : undefined;

  for (const session of sessions) {
    const path = session.cwd?.trim() || null;
    const key = path ? workspaceKeyForPath(path) : legacyWorkspaceKey(session.path);
    const existing = groups.get(key);
    if (existing) {
      existing.sessions.push(session);
      existing.latestModifiedAt = Math.max(existing.latestModifiedAt, session.modifiedAt);
      continue;
    }
    groups.set(key, {
      key,
      workspacePath: path,
      workspaceName: path ? workspaceName(path) : legacyWorkspaceName,
      isCurrent: key === currentKey,
      isPinned: Boolean(pinned[key]),
      sessions: [session],
      latestModifiedAt: session.modifiedAt,
    });
  }

  if (currentWorkspaceDir && currentKey && !groups.has(currentKey)) {
    groups.set(currentKey, {
      key: currentKey,
      workspacePath: currentWorkspaceDir,
      workspaceName: workspaceName(currentWorkspaceDir),
      isCurrent: true,
      isPinned: Boolean(pinned[currentKey]),
      sessions: [],
      latestModifiedAt: 0,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((left, right) => right.modifiedAt - left.modifiedAt),
    }))
    .sort((left, right) => {
      if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
      if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
      if (left.latestModifiedAt !== right.latestModifiedAt) {
        return right.latestModifiedAt - left.latestModifiedAt;
      }
      return left.workspaceName.localeCompare(right.workspaceName);
    });
}
