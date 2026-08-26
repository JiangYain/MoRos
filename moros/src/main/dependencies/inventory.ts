import type {
  DependencyResource,
  RuntimePrerequisites,
} from "../../shared/types.ts";
import { dirname } from "node:path";
import { DEPENDENCY_CATALOG, type DependencyCatalogItem } from "./catalog.ts";
import { inspectRuntimeCommands } from "./process.ts";

function installedResource(
  item: DependencyCatalogItem,
  installedVersion?: string,
  installedPath?: string,
): DependencyResource {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    vendor: item.vendor,
    availability: "installed",
    installKind: item.installKind,
    required: item.required,
    recommendedVersion: item.recommendedVersion,
    installedVersion,
    installedPath,
    sourceUrl: item.sourceUrl,
    documentationUrl: item.documentationUrl,
  };
}

function unavailableResource(item: DependencyCatalogItem): DependencyResource {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    vendor: item.vendor,
    availability: process.platform !== "win32" && item.installKind === "winget"
      ? "unsupported"
      : "missing",
    installKind: item.installKind,
    required: item.required,
    recommendedVersion: item.recommendedVersion,
    sourceUrl: item.sourceUrl,
    documentationUrl: item.documentationUrl,
  };
}

export async function inspectDependencyResources(
  prerequisites: RuntimePrerequisites,
): Promise<DependencyResource[]> {
  const runtime = await inspectRuntimeCommands(prerequisites);
  return DEPENDENCY_CATALOG.map((item) => {
    const command = item.id === "git" ? runtime.git : runtime.bash;
    return command.path
      ? installedResource(item, command.version, dirname(command.path))
      : unavailableResource(item);
  });
}
