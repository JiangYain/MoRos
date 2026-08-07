import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function getMediaQuery(): MediaQueryList | undefined {
  return typeof window === "undefined" ? undefined : window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const media = getMediaQuery();
  if (!media) return () => undefined;
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return getMediaQuery()?.matches ?? false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
