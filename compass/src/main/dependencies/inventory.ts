import type {
  DependencyExecutableCandidate,
  DependencyExecutableSelection,
  DependencyId,
  DependencyResource,
  RuntimePrerequisites,
} from "../../shared/types.ts";
import { dirname, win32 } from "node:path";
import { DEPENDENCY_CATALOG, getDependencyCatalogItem, type DependencyCatalogItem } from "./catalog.ts";
import {
  encodePowerShellCommand,
  fileExists,
  inspectRuntimeCommands,
  runProcess,
} from "./process.ts";

export interface InstalledProgramRecord {
  displayName: string;
  displayVersion?: string;
  installLocation?: string;
  displayIcon?: string;
}

export interface WindowsInventory {
  programs: InstalledProgramRecord[];
  targetExecutables: DependencyExecutableCandidate[];
  noahDevice?: {
    friendlyName?: string;
    status?: string;
    instanceId?: string;
  };
}

function cleanInstalledPath(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const withoutIndex = trimmed.replace(/,\s*-?\d+\s*$/, "").trim();
  return withoutIndex.replace(/^"|"$/g, "") || undefined;
}

function programLocation(program: InstalledProgramRecord): string | undefined {
  const installLocation = cleanInstalledPath(program.installLocation);
  if (installLocation) return installLocation;
  const displayIcon = cleanInstalledPath(program.displayIcon);
  if (!displayIcon) return undefined;
  return [".exe", ".msi"].includes(win32.extname(displayIcon).toLowerCase())
    ? win32.dirname(displayIcon)
    : displayIcon;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseWindowsInventory(serialized: string): WindowsInventory {
  const parsed = asRecord(JSON.parse(serialized));
  if (!parsed) return { programs: [], targetExecutables: [] };
  const rawPrograms = Array.isArray(parsed.programs)
    ? parsed.programs
    : parsed.programs
      ? [parsed.programs]
      : [];
  const programs = rawPrograms.flatMap((candidate): InstalledProgramRecord[] => {
    const record = asRecord(candidate);
    const displayName = optionalString(record?.DisplayName ?? record?.displayName);
    if (!record || !displayName) return [];
    return [{
      displayName,
      displayVersion: optionalString(record.DisplayVersion ?? record.displayVersion),
      installLocation: optionalString(record.InstallLocation ?? record.installLocation),
      displayIcon: optionalString(record.DisplayIcon ?? record.displayIcon),
    }];
  });
  const rawTargetExecutables = Array.isArray(parsed.targetExecutables)
    ? parsed.targetExecutables
    : parsed.targetExecutables
      ? [parsed.targetExecutables]
      : [];
  const targetExecutables = rawTargetExecutables.flatMap((candidate): DependencyExecutableCandidate[] => {
    const record = asRecord(candidate);
    const path = optionalString(record?.Path ?? record?.path);
    if (!record || !path) return [];
    return [{
      path,
      fileVersion: optionalString(record.FileVersion ?? record.fileVersion),
    }];
  });
  const rawDevice = asRecord(parsed.noahDevice);
  return {
    programs,
    targetExecutables,
    ...(rawDevice
      ? {
          noahDevice: {
            friendlyName: optionalString(rawDevice.FriendlyName ?? rawDevice.friendlyName),
            status: optionalString(rawDevice.Status ?? rawDevice.status),
            instanceId: optionalString(rawDevice.InstanceId ?? rawDevice.instanceId),
          },
        }
      : {}),
  };
}

function versionParts(value?: string): number[] {
  return value?.match(/\d+/g)?.map(Number) ?? [];
}

function compareVersions(left?: string, right?: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function normalizedWindowsPath(path: string): string {
  return win32.resolve(path).toLowerCase();
}

function sameWindowsPath(left: string, right: string): boolean {
  return normalizedWindowsPath(left) === normalizedWindowsPath(right);
}

function isWithinWindowsDirectory(path: string, directory: string): boolean {
  const relative = win32.relative(
    normalizedWindowsPath(directory),
    normalizedWindowsPath(path),
  );
  return relative === ""
    || (!relative.startsWith(`..${win32.sep}`)
      && relative !== ".."
      && !win32.isAbsolute(relative));
}

export function resolveDependencyExecutableSelection(
  candidates: readonly DependencyExecutableCandidate[],
  configuredPath?: string,
): DependencyExecutableSelection {
  const unique = new Map<string, DependencyExecutableCandidate>();
  for (const candidate of candidates) {
    const path = candidate.path.trim();
    if (!path) continue;
    const key = normalizedWindowsPath(path);
    if (!unique.has(key)) unique.set(key, { ...candidate, path });
  }
  const sorted = [...unique.values()].sort((left, right) =>
    compareVersions(right.version ?? right.fileVersion, left.version ?? left.fileVersion)
      || left.path.localeCompare(right.path),
  );
  const configured = configuredPath?.trim();
  const configuredCandidate = configured
    ? sorted.find((candidate) => sameWindowsPath(candidate.path, configured))
    : undefined;
  const selected = configured ? configuredCandidate : sorted[0];
  return {
    candidates: sorted,
    ...(configured ? { configuredPath: configured } : {}),
    ...(selected ? { selectedPath: selected.path } : {}),
    ...(selected ? { source: configuredCandidate ? "user" as const : "automatic" as const } : {}),
    multipleDetected: sorted.length > 1,
  };
}

export function matchInstalledProgram(
  programs: readonly InstalledProgramRecord[],
  dependencyId: DependencyId,
): InstalledProgramRecord | undefined {
  const matchers = getDependencyCatalogItem(dependencyId)?.programMatchers ?? [];
  return programs.find((program) => matchers.some((matcher) => matcher.test(program.displayName)));
}

export function resolvePhonakTargetInstallation(
  selection: DependencyExecutableSelection,
  programs: readonly InstalledProgramRecord[],
): { installedVersion?: string; installedPath?: string } | undefined {
  const selectedPath = selection.selectedPath;
  const selectedCandidate = selectedPath
    ? selection.candidates.find((candidate) => sameWindowsPath(candidate.path, selectedPath))
    : undefined;
  if (!selectedCandidate) {
    // A configured executable is authoritative. If it disappeared, reporting a
    // different registry installation as available would make the UI disagree
    // with the path injected into the agent process.
    if (selection.configuredPath) return undefined;
    const selectedProgram = matchInstalledProgram(programs, "phonak-target");
    return selectedProgram
      ? {
          installedVersion: selectedProgram.displayVersion,
          installedPath: programLocation(selectedProgram),
        }
      : undefined;
  }

  const selectedProgram = programs.find((program) => {
    const location = programLocation(program);
    return Boolean(location && isWithinWindowsDirectory(selectedCandidate.path, location));
  });
  return {
    installedVersion: selectedCandidate.version ?? selectedCandidate.fileVersion ?? selectedProgram?.displayVersion,
    installedPath: win32.dirname(selectedCandidate.path),
  };
}

async function readWindowsInventory(): Promise<WindowsInventory> {
  if (process.platform !== "win32") return { programs: [], targetExecutables: [] };
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$paths = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$programs = Get-ItemProperty -Path $paths |
  Where-Object { $_.DisplayName } |
  Select-Object DisplayName, DisplayVersion, InstallLocation, DisplayIcon
$noahDevice = Get-PnpDevice -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -match 'Noahlink\s+Wireless' } |
  Select-Object -First 1 FriendlyName, Status, InstanceId
$targetRoot = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Phonak'
$targetExecutables = if (Test-Path -LiteralPath $targetRoot -PathType Container) {
  Get-ChildItem -LiteralPath $targetRoot -Filter 'Target.exe' -File -Recurse -Force |
    ForEach-Object {
      [pscustomobject]@{
        Path = $_.FullName
        FileVersion = $_.VersionInfo.FileVersion
      }
    }
} else { @() }
[ordered]@{
  programs = @($programs)
  noahDevice = $noahDevice
  targetExecutables = @($targetExecutables)
} |
  ConvertTo-Json -Depth 4 -Compress
`;
  const result = await runProcess(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(script)],
    { timeoutMs: 20_000 },
  );
  if (result.code !== 0 || !result.stdout.trim()) return { programs: [], targetExecutables: [] };
  try {
    return parseWindowsInventory(result.stdout.trim());
  } catch {
    return { programs: [], targetExecutables: [] };
  }
}

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
  const windowsOnly = item.category !== "runtime" || item.installKind === "winget";
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    vendor: item.vendor,
    availability: process.platform !== "win32" && windowsOnly ? "unsupported" : "missing",
    installKind: item.installKind,
    required: item.required,
    recommendedVersion: item.recommendedVersion,
    sourceUrl: item.sourceUrl,
    documentationUrl: item.documentationUrl,
  };
}

function targetProgramVersion(program: InstalledProgramRecord): string | undefined {
  const nameVersion = program.displayName.match(/phonak\s+target(?:\s+\[internal\])?\s+(\d+(?:\.\d+)+)/i)?.[1];
  if (nameVersion) return nameVersion;
  return program.displayVersion && program.displayVersion !== "1.000.00000"
    ? program.displayVersion
    : undefined;
}

function enrichTargetExecutableCandidates(
  candidates: readonly DependencyExecutableCandidate[],
  programs: readonly InstalledProgramRecord[],
): DependencyExecutableCandidate[] {
  const targetPrograms = programs.filter((program) => /phonak\s+target/i.test(program.displayName));
  return candidates.map((candidate) => {
    const program = targetPrograms.find((entry) => {
      const location = programLocation(entry);
      return Boolean(location && isWithinWindowsDirectory(candidate.path, location));
    });
    return {
      ...candidate,
      version: program ? targetProgramVersion(program) : undefined,
    };
  });
}

export async function inspectDependencyResources(
  prerequisites: RuntimePrerequisites,
  configuredTargetPath?: string,
): Promise<DependencyResource[]> {
  const [inventory, runtime] = await Promise.all([
    readWindowsInventory(),
    inspectRuntimeCommands(prerequisites),
  ]);
  const configuredTargetCandidate = configuredTargetPath
    && win32.basename(configuredTargetPath).toLowerCase() === "target.exe"
    && await fileExists(configuredTargetPath)
    ? [{ path: win32.resolve(configuredTargetPath) }]
    : [];
  const targetSelection = resolveDependencyExecutableSelection(
    enrichTargetExecutableCandidates(
      [...inventory.targetExecutables, ...configuredTargetCandidate],
      inventory.programs,
    ),
    configuredTargetPath,
  );
  return DEPENDENCY_CATALOG.map((item) => {
    if (item.id === "git") {
      return runtime.git.path
        ? installedResource(item, runtime.git.version, dirname(runtime.git.path))
        : unavailableResource(item);
    }
    if (item.id === "bash") {
      return runtime.bash.path
        ? installedResource(item, runtime.bash.version, dirname(runtime.bash.path))
        : unavailableResource(item);
    }
    if (item.id === "noahlink-wireless-driver" && inventory.noahDevice) {
      return installedResource(item, item.recommendedVersion);
    }
    if (item.id === "phonak-target") {
      const installation = resolvePhonakTargetInstallation(targetSelection, inventory.programs);
      const resource = installation
        ? installedResource(
            item,
            installation.installedVersion,
            installation.installedPath,
          )
        : unavailableResource(item);
      return { ...resource, executableSelection: targetSelection };
    }
    const program = matchInstalledProgram(inventory.programs, item.id);
    if (!program) return unavailableResource(item);
    return installedResource(
      item,
      program.displayVersion,
      programLocation(program),
    );
  });
}
