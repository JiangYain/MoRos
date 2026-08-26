import type {
  DependencyId,
  DependencyResource,
} from "../../shared/types.ts";

interface DependencyCatalogBase {
  id: DependencyId;
  category: DependencyResource["category"];
  name: string;
  vendor: string;
  required: boolean;
  recommendedVersion?: string;
  sourceUrl: string;
  documentationUrl: string;
  programMatchers?: RegExp[];
}

export type DependencyCatalogItem = DependencyCatalogBase & (
  | {
      installKind: "winget" | "external";
      artifact?: never;
      installerTokens?: never;
    }
  | {
      installKind: "archive";
      artifact: DependencyArtifactManifest & {
        archive: NonNullable<DependencyArtifactManifest["archive"]>;
      };
      installerTokens?: string[];
    }
  | {
      installKind: "executable";
      artifact: DependencyArtifactManifest & { archive?: never };
      installerTokens?: never;
    }
);

export interface DependencyArtifactManifest {
  /** Final filename, created only after the downloaded bytes pass verification. */
  fileName: string;
  /** Expected bytes for this exact, version-pinned release artifact. */
  byteLength: number;
  /** SHA-256 of the complete release artifact. */
  sha256: string;
  /** Hard network/body limit, independent from an HTTP Content-Length header. */
  maxDownloadBytes: number;
  /** Limits applied to ZIP metadata before any entry is extracted. */
  archive?: {
    maxEntries: number;
    maxExtractedBytes: number;
  };
}

export const DEPENDENCY_CATALOG: readonly DependencyCatalogItem[] = [
  {
    id: "git",
    category: "runtime",
    installKind: "winget",
    name: "Git",
    vendor: "Git Project",
    required: true,
    sourceUrl: "https://git-scm.com/download/win",
    documentationUrl: "https://git-scm.com/download/win",
  },
  {
    id: "bash",
    category: "runtime",
    installKind: "winget",
    name: "Bash / Git Bash",
    vendor: "GNU / Git for Windows",
    required: true,
    sourceUrl: "https://gitforwindows.org/",
    documentationUrl: "https://gitforwindows.org/",
  },
] as const;

const CATALOG_BY_ID = new Map(DEPENDENCY_CATALOG.map((item) => [item.id, item]));

export function getDependencyCatalogItem(
  dependencyId: DependencyId,
): DependencyCatalogItem | undefined {
  return CATALOG_BY_ID.get(dependencyId);
}
