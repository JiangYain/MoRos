import { useCallback, useState } from "react";
import {
  isWorkspaceAppearance,
  type WorkspaceAppearance,
} from "./workspace-appearance.ts";

export const PINNED_WORKSPACES_STORAGE_KEY = "moros.pinned-workspaces.v1";
export const WORKSPACE_APPEARANCE_STORAGE_KEY = "moros.workspace-appearance.v1";

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WorkspacePreferencesSnapshot {
  appearances: Record<string, WorkspaceAppearance>;
  pinned: Record<string, boolean>;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function parsePinnedWorkspaces(raw: string | null): Record<string, boolean> {
  const parsed = parseJson(raw);
  const keys = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed)
        .filter(([, pinned]) => pinned === true)
        .map(([key]) => key)
      : [];
  return Object.fromEntries(
    keys
      .filter((key): key is string => typeof key === "string" && key.length > 0)
      .map((key) => [key, true]),
  );
}

export function parseWorkspaceAppearances(
  raw: string | null,
): Record<string, WorkspaceAppearance> {
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, WorkspaceAppearance] => isWorkspaceAppearance(entry[1]),
    ),
  );
}

function browserStorage(): StorageAdapter | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function readWorkspacePreferences(
  storage: StorageAdapter | undefined = browserStorage(),
): WorkspacePreferencesSnapshot {
  if (!storage) return { appearances: {}, pinned: {} };
  try {
    return {
      appearances: parseWorkspaceAppearances(
        storage.getItem(WORKSPACE_APPEARANCE_STORAGE_KEY),
      ),
      pinned: parsePinnedWorkspaces(storage.getItem(PINNED_WORKSPACES_STORAGE_KEY)),
    };
  } catch {
    return { appearances: {}, pinned: {} };
  }
}

function persist(
  storage: StorageAdapter | undefined,
  key: string,
  value: unknown,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // In-memory workspace preferences remain usable when storage is blocked.
  }
}

export function useWorkspacePreferences(): {
  appearances: Record<string, WorkspaceAppearance>;
  pinned: Record<string, boolean>;
  setAppearance(key: string, appearance: WorkspaceAppearance): void;
  togglePinned(key: string): void;
} {
  const storage = browserStorage();
  const [snapshot, setSnapshot] = useState<WorkspacePreferencesSnapshot>(() => (
    readWorkspacePreferences(storage)
  ));

  const togglePinned = useCallback((key: string): void => {
    setSnapshot((current) => {
      const pinned = { ...current.pinned };
      if (pinned[key]) delete pinned[key];
      else pinned[key] = true;
      persist(storage, PINNED_WORKSPACES_STORAGE_KEY, Object.keys(pinned));
      return { ...current, pinned };
    });
  }, [storage]);

  const setAppearance = useCallback((key: string, appearance: WorkspaceAppearance): void => {
    setSnapshot((current) => {
      const appearances = { ...current.appearances, [key]: appearance };
      persist(storage, WORKSPACE_APPEARANCE_STORAGE_KEY, appearances);
      return { ...current, appearances };
    });
  }, [storage]);

  return {
    appearances: snapshot.appearances,
    pinned: snapshot.pinned,
    setAppearance,
    togglePinned,
  };
}
