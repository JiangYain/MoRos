import { CLIENT_REGISTRY_STORAGE_KEY } from "../../../shared/client-registry.ts";
import { normalizeProfileHandle, normalizeProfileName } from "../../../shared/profile.ts";

const PROFILE_AVATAR_STORAGE_KEY = "compass.profile.avatar.v1";
const PROFILE_IDENTITY_STORAGE_KEY = "compass.profile.identity.v1";

export interface StoreStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface StoredProfileIdentity {
  name?: unknown;
  handle?: unknown;
}

function browserStorage(): StoreStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadProfileAvatar(storage = browserStorage()): string | null {
  if (!storage) return null;
  try {
    const avatar = storage.getItem(PROFILE_AVATAR_STORAGE_KEY);
    return avatar?.startsWith("data:image/") ? avatar : null;
  } catch {
    return null;
  }
}

export function persistProfileAvatar(
  profileAvatar: string | null,
  storage = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    if (profileAvatar) storage.setItem(PROFILE_AVATAR_STORAGE_KEY, profileAvatar);
    else storage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadProfileIdentity(storage = browserStorage()): { name: string; handle: string } {
  if (!storage) return { name: "", handle: "" };
  try {
    const raw = storage.getItem(PROFILE_IDENTITY_STORAGE_KEY);
    if (!raw) return { name: "", handle: "" };
    const parsed = JSON.parse(raw) as StoredProfileIdentity;
    return {
      name: normalizeProfileName(parsed.name),
      handle: normalizeProfileHandle(parsed.handle),
    };
  } catch {
    return { name: "", handle: "" };
  }
}

export function persistProfileIdentity(
  name: string,
  handle: string,
  storage = browserStorage(),
): { name: string; handle: string } | undefined {
  const identity = {
    name: normalizeProfileName(name),
    handle: normalizeProfileHandle(handle),
  };
  if (!storage) return undefined;
  try {
    storage.setItem(PROFILE_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
    return identity;
  } catch {
    return undefined;
  }
}

export function loadLegacyClientRegistry(storage = browserStorage()): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(CLIENT_REGISTRY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearLegacyClientRegistry(storage = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(CLIENT_REGISTRY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
