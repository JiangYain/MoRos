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

const MIB = 1024 * 1024;

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
  {
    id: "phonak-target",
    category: "fitting-software",
    installKind: "external",
    name: "Phonak Target",
    vendor: "Phonak",
    required: false,
    recommendedVersion: "11.1.0.3472",
    sourceUrl: "https://www.phonak.com/en-int/professionals/innovations/target",
    documentationUrl: "https://www.phonak.com/en-int/professionals/innovations/target",
    programMatchers: [/phonak\s+target/i],
  },
  {
    id: "signia-connexx",
    category: "fitting-software",
    installKind: "external",
    name: "Signia Connexx",
    vendor: "Signia",
    required: false,
    recommendedVersion: "9.14.7",
    sourceUrl: "https://www.signia.com.cn/services-download-area/",
    documentationUrl: "https://www.signia.com.cn/services-download-area/",
    programMatchers: [/connexx/i, /sifit/i, /signia.*fitting/i],
  },
  {
    id: "widex-compass-gps",
    category: "fitting-software",
    installKind: "external",
    name: "Widex COMPASS GPS",
    vendor: "Widex",
    required: false,
    recommendedVersion: "4.9.6365",
    sourceUrl: "https://www.widexpro.com/en-gb/business-support/compass/",
    documentationUrl: "https://www.widexpro.com/en-gb/business-support/compass/",
    programMatchers: [/compass\s*gps/i, /widex.*compass/i],
  },
  {
    id: "noahlink-wireless-driver",
    category: "driver",
    installKind: "executable",
    name: "Noahlink Wireless Driver",
    vendor: "HIMSA",
    required: false,
    recommendedVersion: "1.1.0.0",
    sourceUrl: "https://himsafiles.com/NoahlinkWireless/Driver_NLW_V.1.1.0.0.exe",
    documentationUrl: "https://www.himsa.com/himsa_download/noahlink-wireless-downloads/",
    artifact: {
      fileName: "Driver_NLW_V.1.1.0.0.exe",
      byteLength: 15_888_192,
      sha256: "16396ad8447271699759c28448b47990caf58bd1d8044d526fc7c5f5d1c1bb01",
      maxDownloadBytes: 32 * MIB,
    },
    programMatchers: [/noahlink\s+wireless/i, /himsa.*wireless/i],
  },
] as const;

const CATALOG_BY_ID = new Map(DEPENDENCY_CATALOG.map((item) => [item.id, item]));

export function getDependencyCatalogItem(
  dependencyId: DependencyId,
): DependencyCatalogItem | undefined {
  return CATALOG_BY_ID.get(dependencyId);
}
