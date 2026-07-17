import { clientRegistryKey, type ClientRegistry } from "../../shared/client-registry.ts";
import type { DependencyId, DependencyInstallProgress, DependencySnapshot } from "../../shared/types.ts";

export function dependencyPromptKey(sessionId: string, dependencyId: DependencyId): string {
  return `${sessionId}:${dependencyId}`;
}

export function sessionNeedsPhonakTarget(
  sessionId: string | undefined,
  clientRegistry: ClientRegistry,
  dependencies: DependencySnapshot,
  dismissedPrompts: Readonly<Record<string, true>> = {},
): boolean {
  if (!sessionId || dismissedPrompts[dependencyPromptKey(sessionId, "phonak-target")]) return false;
  const assignedClient = clientRegistry.assignments[sessionId];
  if (!assignedClient) return false;
  const profile = clientRegistry.profiles[clientRegistryKey(assignedClient)];
  if (!profile?.hearingAidBrands.includes("phonak")) return false;
  const target = dependencies.items.find((item) => item.id === "phonak-target");
  return target?.availability === "missing";
}

export function sessionDependencyInstall(
  sessionId: string | undefined,
  dependencies: DependencySnapshot,
  dependencyId: DependencyId,
): DependencyInstallProgress | undefined {
  if (!sessionId) return undefined;
  return dependencies.installs.find(
    (progress) => progress.dependencyId === dependencyId && progress.sessionId === sessionId,
  );
}
