import type {
  DependencyExecutableCandidate,
  DependencyExecutableSelection,
  DependencyId,
  DependencyInstallProgress,
  DependencyResource,
  DependencySnapshot,
  RuntimePrerequisites,
} from "../shared/types.ts";
import { createWriteStream } from "node:fs";
import { access, mkdir, readdir, rm } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

interface DependencyCatalogItem {
  id: DependencyId;
  category: DependencyResource["category"];
  installKind: DependencyResource["installKind"];
  name: string;
  vendor: string;
  required: boolean;
  recommendedVersion?: string;
  sourceUrl: string;
  documentationUrl: string;
  fileName?: string;
  programMatchers?: RegExp[];
  installerTokens?: string[];
}

export interface InstalledProgramRecord {
  displayName: string;
  displayVersion?: string;
  installLocation?: string;
  displayIcon?: string;
}

interface WindowsInventory {
  programs: InstalledProgramRecord[];
  targetExecutables: DependencyExecutableCandidate[];
  noahDevice?: {
    friendlyName?: string;
    status?: string;
    instanceId?: string;
  };
}

interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface DependencyManagerOptions {
  rootDir: string;
  openPath: (path: string) => Promise<string>;
  openExternal: (url: string) => Promise<void>;
  onProgress: (progress: DependencyInstallProgress) => void;
  getExecutablePath: (dependencyId: DependencyId) => string | undefined;
  setExecutablePath: (dependencyId: DependencyId, path?: string) => void;
}

export interface DependencySnapshotOptions {
  force?: boolean;
  /** Reuse an existing inventory after its normal refresh interval has elapsed. */
  allowStale?: boolean;
}

const CATALOG: readonly DependencyCatalogItem[] = [
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
    installKind: "archive",
    name: "Phonak Target",
    vendor: "Phonak",
    required: false,
    recommendedVersion: "11.1.0.3472",
    sourceUrl: "https://pub-7d7bca9bac3247e9a10fa5dec4817657.r2.dev/PhonakTargetCustomer11.1.0.3472.zip",
    documentationUrl: "https://www.phonak.com/en-int/professionals/innovations/target",
    fileName: "PhonakTargetCustomer11.1.0.3472.zip",
    programMatchers: [/phonak\s+target/i],
    installerTokens: ["phonak", "target"],
  },
  {
    id: "signia-connexx",
    category: "fitting-software",
    installKind: "archive",
    name: "Signia Connexx",
    vendor: "Signia",
    required: false,
    recommendedVersion: "9.14.7",
    sourceUrl: "https://www.signia.com.cn/user-contents/signia/2026/downloads/Master-9.14.7.569.Sifit_Fitting-9.14.7.344_HIDB-9.14.5.635_Release.zip",
    documentationUrl: "https://www.signia.com.cn/services-download-area/",
    fileName: "Connexx-9.14.7.zip",
    programMatchers: [/connexx/i, /sifit/i, /signia.*fitting/i],
    installerTokens: ["connexx", "sifit", "signia"],
  },
  {
    id: "widex-compass-gps",
    category: "fitting-software",
    installKind: "archive",
    name: "Widex COMPASS GPS",
    vendor: "Widex",
    required: false,
    recommendedVersion: "4.9.6365",
    sourceUrl: "https://wsa.showpad.com/catalog/share/up33oADXZC9sdXKCvGMvs/page/939269b6e00bd9e578a95ff795e3b8fa/download/6c3cf6e75137e762073349864e7bf55d/4deb7852cafb1612568c63ffbb1fbcd82915917db78696dd180298cd387b482a/unprocessed?filename=%E9%AA%8C%E9%85%8D%E8%BD%AF%E4%BB%B6_Compass_GPS_4.9.6365.zip",
    documentationUrl: "https://www.widexpro.com/en-gb/business-support/compass/",
    fileName: "Compass-GPS-4.9.6365.zip",
    programMatchers: [/compass\s*gps/i, /widex.*compass/i],
    installerTokens: ["compass", "gps", "widex"],
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
    fileName: "Driver_NLW_V.1.1.0.0.exe",
    programMatchers: [/noahlink\s+wireless/i, /himsa.*wireless/i],
  },
] as const;

const CATALOG_BY_ID = new Map(CATALOG.map((item) => [item.id, item]));
const INVENTORY_CACHE_MS = 10_000;

export function shouldRefreshDependencyInventory(
  hasCachedItems: boolean,
  cachedAt: number,
  now: number,
  options: DependencySnapshotOptions = {},
): boolean {
  if (options.force || !hasCachedItems) return true;
  return !options.allowStale && now - cachedAt > INVENTORY_CACHE_MS;
}

function abortError(): Error {
  const error = new Error("Installation cancelled.");
  error.name = "AbortError";
  return error;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 600);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function encodedPowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
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
  return [".exe", ".msi"].includes(extname(displayIcon).toLowerCase())
    ? dirname(displayIcon)
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

function samePath(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

export function resolveDependencyExecutableSelection(
  candidates: readonly DependencyExecutableCandidate[],
  configuredPath?: string,
): DependencyExecutableSelection {
  const unique = new Map<string, DependencyExecutableCandidate>();
  for (const candidate of candidates) {
    const path = candidate.path.trim();
    if (!path) continue;
    const key = resolve(path).toLowerCase();
    if (!unique.has(key)) unique.set(key, { ...candidate, path });
  }
  const sorted = [...unique.values()].sort((left, right) =>
    compareVersions(right.version ?? right.fileVersion, left.version ?? left.fileVersion)
      || left.path.localeCompare(right.path),
  );
  const configured = configuredPath?.trim();
  const configuredCandidate = configured
    ? sorted.find((candidate) => samePath(candidate.path, configured))
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
  const matchers = CATALOG_BY_ID.get(dependencyId)?.programMatchers ?? [];
  return programs.find((program) => matchers.some((matcher) => matcher.test(program.displayName)));
}

export function resolvePhonakTargetInstallation(
  selection: DependencyExecutableSelection,
  programs: readonly InstalledProgramRecord[],
): { installedVersion?: string; installedPath?: string } | undefined {
  const selectedCandidate = selection.selectedPath
    ? selection.candidates.find((candidate) => samePath(candidate.path, selection.selectedPath!))
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
    return Boolean(location && resolve(selectedCandidate.path).toLowerCase().startsWith(
      `${resolve(location).toLowerCase().replace(/[\\/]+$/, "")}${sep}`,
    ));
  });
  return {
    installedVersion: selectedCandidate.version ?? selectedCandidate.fileVersion ?? selectedProgram?.displayVersion,
    installedPath: dirname(selectedCandidate.path),
  };
}

async function runProcess(
  command: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  if (options.signal?.aborted) throw abortError();
  return new Promise((resolveProcess, rejectProcess) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const finish = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      resolveProcess(result);
    };
    const onAbort = (): void => {
      child.kill();
      if (!settled) {
        settled = true;
        if (timeout) clearTimeout(timeout);
        rejectProcess(abortError());
      }
    };
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          finish({ code: -1, stdout, stderr: `${stderr}\nProcess timed out.`.trim() });
        }, options.timeoutMs)
      : undefined;
    timeout?.unref();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => finish({ code: -1, stdout, stderr: error.message }));
    child.once("close", (code) => finish({ code: code ?? -1, stdout, stderr }));
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function firstExistingPath(candidates: Array<string | undefined>): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (candidate && await fileExists(candidate)) return candidate;
  }
  return undefined;
}

async function commandPath(command: string): Promise<string | undefined> {
  const result = await runProcess(process.platform === "win32" ? "where.exe" : "which", [command], {
    timeoutMs: 5_000,
  });
  return result.code === 0 ? result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) : undefined;
}

async function detectGit(): Promise<{ version?: string; path?: string }> {
  const path = await firstExistingPath([
    await commandPath(process.platform === "win32" ? "git.exe" : "git"),
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Git", "cmd", "git.exe") : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Git", "cmd", "git.exe") : undefined,
  ]);
  if (!path) return {};
  const result = await runProcess(path, ["--version"], { timeoutMs: 5_000 });
  const version = result.code === 0
    ? result.stdout.match(/git version\s+([^\s]+)/i)?.[1]
    : undefined;
  return { path, version };
}

async function detectBash(
  prerequisites: RuntimePrerequisites,
): Promise<{ version?: string; path?: string }> {
  const path = await firstExistingPath([
    prerequisites.shell.ok ? prerequisites.shell.shellPath : undefined,
    await commandPath(process.platform === "win32" ? "bash.exe" : "bash"),
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : undefined,
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe")
      : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe") : undefined,
  ]);
  if (!path) return {};
  const result = await runProcess(path, ["--version"], { timeoutMs: 5_000 });
  const version = result.code === 0
    ? result.stdout.match(/version\s+([\d.]+)/i)?.[1]
    : undefined;
  return { path, version };
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
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedPowerShell(script)],
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
    const executablePath = resolve(candidate.path).toLowerCase();
    const program = targetPrograms.find((entry) => {
      const location = programLocation(entry);
      if (!location) return false;
      const normalizedLocation = resolve(location).toLowerCase().replace(/[\\/]+$/, "");
      return executablePath === normalizedLocation || executablePath.startsWith(`${normalizedLocation}${sep}`);
    });
    return {
      ...candidate,
      version: program ? targetProgramVersion(program) : undefined,
    };
  });
}

async function inspectResources(
  prerequisites: RuntimePrerequisites,
  configuredTargetPath?: string,
): Promise<DependencyResource[]> {
  const [inventory, git, bash] = await Promise.all([
    readWindowsInventory(),
    detectGit(),
    detectBash(prerequisites),
  ]);
  const configuredTargetCandidate = configuredTargetPath
    && basename(configuredTargetPath).toLowerCase() === "target.exe"
    && await fileExists(configuredTargetPath)
    ? [{ path: resolve(configuredTargetPath) }]
    : [];
  const targetSelection = resolveDependencyExecutableSelection(
    enrichTargetExecutableCandidates(
      [...inventory.targetExecutables, ...configuredTargetCandidate],
      inventory.programs,
    ),
    configuredTargetPath,
  );
  return CATALOG.map((item) => {
    if (item.id === "git") {
      return git.path ? installedResource(item, git.version, dirname(git.path)) : unavailableResource(item);
    }
    if (item.id === "bash") {
      return bash.path ? installedResource(item, bash.version, dirname(bash.path)) : unavailableResource(item);
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

async function downloadFile(
  sourceUrl: string,
  destination: string,
  signal: AbortSignal,
  onProgress: (downloadedBytes: number, totalBytes?: number) => void,
  redirects = 0,
): Promise<void> {
  if (redirects > 8) throw new Error("Too many download redirects.");
  if (signal.aborted) throw abortError();
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("Dependency downloads require HTTPS.");
  }
  await new Promise<void>((resolveDownload, rejectDownload) => {
    const req = httpsRequest(parsed, {
      headers: {
        Accept: "application/octet-stream,application/zip,*/*",
        "User-Agent": "Compass-Dependency-Manager/1.0",
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        const redirected = new URL(location, parsed).toString();
        void downloadFile(redirected, destination, signal, onProgress, redirects + 1)
          .then(resolveDownload, rejectDownload);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        rejectDownload(new Error(`Download failed with HTTP ${status}.`));
        return;
      }
      const header = response.headers["content-length"];
      const totalBytes = typeof header === "string" && Number.isFinite(Number(header))
        ? Number(header)
        : undefined;
      let downloadedBytes = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          downloadedBytes += chunk.length;
          onProgress(downloadedBytes, totalBytes);
          callback(null, chunk);
        },
      });
      void pipeline(response, meter, createWriteStream(destination), { signal })
        .then(() => resolveDownload(), (error: unknown) => rejectDownload(error));
    });
    const onAbort = (): void => {
      req.destroy(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    req.once("error", rejectDownload);
    req.once("close", () => signal.removeEventListener("abort", onAbort));
    req.end();
  });
}

async function extractArchive(archivePath: string, destination: string, signal: AbortSignal): Promise<void> {
  const validationScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = '${archivePath.replaceAll("'", "''")}'
$destination = [System.IO.Path]::GetFullPath('${destination.replaceAll("'", "''")}')
$prefix = $destination.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($entry in $archive.Entries) {
    $name = $entry.FullName.Replace('\', '/')
    if (
      [string]::IsNullOrWhiteSpace($name) -or
      [System.IO.Path]::IsPathRooted($name) -or
      $name.Contains(':') -or
      $name -match '(^|/)\.\.(/|$)'
    ) {
      throw "Unsafe archive entry: $name"
    }
    $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($destination, $name))
    if ($target -ne $destination -and -not $target.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Archive entry escapes the download directory: $name"
    }
  }
} finally {
  $archive.Dispose()
}
`;
  const validation = await runProcess(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedPowerShell(validationScript)],
    { signal },
  );
  if (validation.code !== 0) {
    throw new Error(validation.stderr.trim() || validation.stdout.trim() || "The downloaded archive is not safe to extract.");
  }
  const tar = await runProcess("tar.exe", ["-xf", archivePath, "-C", destination], { signal });
  if (tar.code === 0) return;
  const script = `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`;
  const powershell = await runProcess(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodedPowerShell(script)],
    { signal },
  );
  if (powershell.code !== 0) {
    throw new Error(powershell.stderr.trim() || tar.stderr.trim() || "Could not extract the downloaded archive.");
  }
}

async function collectInstallers(directory: string, depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectInstallers(path, depth + 1);
    if (!entry.isFile() || ![".exe", ".msi"].includes(extname(entry.name).toLowerCase())) return [];
    return [path];
  }));
  return nested.flat();
}

function installerScore(path: string, tokens: readonly string[]): number {
  const name = basename(path).toLowerCase();
  const normalized = path.toLowerCase();
  let score = 0;
  if (name === "setup.exe" || name === "setup.msi") score += 120;
  if (/(^|[-_. ])setup([-_. ]|$)/.test(name)) score += 75;
  if (/(^|[-_. ])install(er)?([-_. ]|$)/.test(name)) score += 60;
  for (const token of tokens) if (normalized.includes(token)) score += 24;
  if (/unins|uninstall|updater|update-only|vc_redist|dotnet|prereq|bootstrapper/.test(normalized)) score -= 130;
  score -= normalized.split(/[\\/]/).length;
  return score;
}

async function selectInstaller(directory: string, tokens: readonly string[]): Promise<string> {
  const candidates = await collectInstallers(directory);
  const selected = candidates
    .map((path) => ({ path, score: installerScore(path, tokens) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))[0];
  if (!selected) throw new Error("No Windows installer was found in the downloaded archive.");
  const root = resolve(directory);
  const resolved = resolve(selected.path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error("The selected installer is outside the extracted download directory.");
  }
  return resolved;
}

export class DependencyManager {
  private readonly rootDir: string;
  private readonly openPath: DependencyManagerOptions["openPath"];
  private readonly openExternal: DependencyManagerOptions["openExternal"];
  private readonly onProgress: DependencyManagerOptions["onProgress"];
  private readonly getExecutablePath: DependencyManagerOptions["getExecutablePath"];
  private readonly persistExecutablePath: DependencyManagerOptions["setExecutablePath"];
  private readonly installs = new Map<DependencyId, DependencyInstallProgress>();
  private readonly tasks = new Map<DependencyId, AbortController>();
  private cachedItems?: DependencyResource[];
  private cachedAt = 0;

  constructor(options: DependencyManagerOptions) {
    this.rootDir = resolve(options.rootDir);
    this.openPath = options.openPath;
    this.openExternal = options.openExternal;
    this.onProgress = options.onProgress;
    this.getExecutablePath = options.getExecutablePath;
    this.persistExecutablePath = options.setExecutablePath;
  }

  private updateProgress(
    dependencyId: DependencyId,
    progress: Omit<DependencyInstallProgress, "dependencyId" | "updatedAt">,
  ): DependencyInstallProgress {
    const next: DependencyInstallProgress = {
      dependencyId,
      ...progress,
      updatedAt: Date.now(),
    };
    this.installs.set(dependencyId, next);
    this.onProgress(next);
    return next;
  }

  private invalidateInventory(): void {
    this.cachedItems = undefined;
    this.cachedAt = 0;
  }

  async snapshot(
    prerequisites: RuntimePrerequisites,
    options: DependencySnapshotOptions = {},
  ): Promise<DependencySnapshot> {
    if (shouldRefreshDependencyInventory(Boolean(this.cachedItems), this.cachedAt, Date.now(), options)) {
      this.cachedItems = await inspectResources(
        prerequisites,
        this.getExecutablePath("phonak-target"),
      );
      this.cachedAt = Date.now();
      for (const item of this.cachedItems) {
        const progress = this.installs.get(item.id);
        if (
          item.availability === "installed"
          && progress
          && ["awaiting-user", "installing", "launching"].includes(progress.phase)
        ) {
          this.updateProgress(item.id, {
            phase: "completed",
            progress: 1,
            sessionId: progress.sessionId,
            artifactPath: progress.artifactPath,
          });
        }
      }
    }
    const cachedItems = this.cachedItems;
    if (!cachedItems) throw new Error("Dependency inventory is unavailable.");
    return {
      items: cachedItems.map((item) => ({
        ...item,
        ...(item.executableSelection
          ? {
              executableSelection: {
                ...item.executableSelection,
                candidates: item.executableSelection.candidates.map((candidate) => ({ ...candidate })),
              },
            }
          : {}),
      })),
      installs: Array.from(this.installs.values(), (progress) => ({ ...progress })),
      checkedAt: this.cachedAt || Date.now(),
    };
  }

  async openSource(dependencyId: DependencyId): Promise<void> {
    const item = CATALOG_BY_ID.get(dependencyId);
    if (!item) throw new Error(`Unknown dependency: ${dependencyId}`);
    await this.openExternal(item.documentationUrl);
  }

  async setExecutable(dependencyId: DependencyId, path?: string): Promise<void> {
    if (dependencyId !== "phonak-target") {
      throw new Error(`Executable selection is not supported for ${dependencyId}.`);
    }
    if (!path) {
      this.persistExecutablePath(dependencyId, undefined);
      this.invalidateInventory();
      return;
    }
    const resolvedPath = resolve(path);
    if (basename(resolvedPath).toLowerCase() !== "target.exe") {
      throw new Error("Choose the Phonak Target executable named Target.exe.");
    }
    if (!await fileExists(resolvedPath)) {
      throw new Error("The selected Target.exe is no longer available.");
    }
    this.persistExecutablePath(dependencyId, resolvedPath);
    this.invalidateInventory();
  }

  startInstall(dependencyId: DependencyId, sessionId?: string): { ok: boolean; error?: string } {
    const item = CATALOG_BY_ID.get(dependencyId);
    if (!item) return { ok: false, error: `Unknown dependency: ${dependencyId}` };
    if (this.tasks.has(dependencyId)) return { ok: false, error: `${item.name} is already being installed.` };
    const controller = new AbortController();
    this.tasks.set(dependencyId, controller);
    this.updateProgress(dependencyId, { phase: "queued", progress: 0, sessionId });
    void this.runInstall(item, controller.signal, sessionId)
      .catch((error: unknown) => {
        this.updateProgress(dependencyId, isAbortError(error)
          ? { phase: "cancelled", sessionId }
          : { phase: "failed", sessionId, error: errorMessage(error) });
      })
      .finally(() => this.tasks.delete(dependencyId));
    return { ok: true };
  }

  cancelInstall(dependencyId: DependencyId): { ok: boolean; error?: string } {
    const controller = this.tasks.get(dependencyId);
    if (!controller) return { ok: false, error: "No active installation was found." };
    controller.abort();
    return { ok: true };
  }

  shutdown(): void {
    for (const controller of this.tasks.values()) controller.abort();
    this.tasks.clear();
  }

  private async runInstall(
    item: DependencyCatalogItem,
    signal: AbortSignal,
    sessionId?: string,
  ): Promise<void> {
    if (item.installKind === "winget") {
      await this.installGitForWindows(item, signal, sessionId);
      return;
    }
    if (process.platform !== "win32") {
      await this.openExternal(item.documentationUrl);
      this.updateProgress(item.id, { phase: "awaiting-user", sessionId });
      return;
    }
    if (!item.fileName) throw new Error(`No download artifact is configured for ${item.name}.`);
    const itemDir = resolve(this.rootDir, item.id);
    if (itemDir !== this.rootDir && !itemDir.startsWith(`${this.rootDir}${sep}`)) {
      throw new Error("Invalid dependency download directory.");
    }
    await rm(itemDir, { recursive: true, force: true });
    await mkdir(itemDir, { recursive: true });
    const artifactPath = join(itemDir, item.fileName);
    this.updateProgress(item.id, {
      phase: "downloading",
      progress: 0,
      downloadedBytes: 0,
      sessionId,
    });
    let lastProgressEmit = 0;
    await downloadFile(item.sourceUrl, artifactPath, signal, (downloadedBytes, totalBytes) => {
      const now = Date.now();
      if (now - lastProgressEmit < 120 && totalBytes !== downloadedBytes) return;
      lastProgressEmit = now;
      this.updateProgress(item.id, {
        phase: "downloading",
        progress: totalBytes ? Math.min(1, downloadedBytes / totalBytes) : undefined,
        downloadedBytes,
        totalBytes,
        sessionId,
      });
    });
    if (signal.aborted) throw abortError();
    let installerPath = artifactPath;
    if (item.installKind === "archive") {
      const extractDir = join(itemDir, "extracted");
      await mkdir(extractDir, { recursive: true });
      this.updateProgress(item.id, {
        phase: "extracting",
        progress: 1,
        sessionId,
        artifactPath,
      });
      await extractArchive(artifactPath, extractDir, signal);
      installerPath = await selectInstaller(extractDir, item.installerTokens ?? []);
    }
    if (signal.aborted) throw abortError();
    this.updateProgress(item.id, {
      phase: "launching",
      progress: 1,
      sessionId,
      artifactPath: installerPath,
    });
    const launchError = await this.openPath(installerPath);
    if (launchError) throw new Error(launchError);
    this.invalidateInventory();
    this.updateProgress(item.id, {
      phase: "awaiting-user",
      progress: 1,
      sessionId,
      artifactPath: installerPath,
    });
  }

  private async installGitForWindows(
    item: DependencyCatalogItem,
    signal: AbortSignal,
    sessionId?: string,
  ): Promise<void> {
    if (process.platform !== "win32") {
      await this.openExternal(item.documentationUrl);
      this.updateProgress(item.id, { phase: "awaiting-user", sessionId });
      return;
    }
    this.updateProgress(item.id, { phase: "installing", sessionId });
    const result = await runProcess(
      "winget.exe",
      [
        "install",
        "--id",
        "Git.Git",
        "--exact",
        "--source",
        "winget",
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
      ],
      { signal },
    );
    if (result.code === -1 && /ENOENT|not found/i.test(result.stderr)) {
      await this.openExternal(item.documentationUrl);
      this.updateProgress(item.id, { phase: "awaiting-user", sessionId });
      return;
    }
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || `winget exited with code ${result.code}.`);
    }
    this.invalidateInventory();
    this.updateProgress(item.id, { phase: "completed", progress: 1, sessionId });
  }
}
