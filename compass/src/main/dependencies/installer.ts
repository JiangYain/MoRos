import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readdir, rename, rm, type FileHandle } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import type { DependencyArtifactManifest, DependencyCatalogItem } from "./catalog.ts";
import { dependencyAbortError, encodePowerShellCommand, runProcess } from "./process.ts";
import { validateZipArchive } from "./zip-validator.ts";

export interface InstallerPreparationUpdate {
  phase: "downloading" | "extracting";
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  artifactPath?: string;
}

export interface DependencyDownloadBody {
  stream: Readable;
  totalBytes?: number;
}

export type DependencyDownloadOpener = (
  sourceUrl: string,
  signal: AbortSignal,
) => Promise<DependencyDownloadBody>;

export interface VerifiedDownloadOptions {
  openDownload?: DependencyDownloadOpener;
  temporaryPath?: (destination: string) => string;
}

export interface DependencyInstallerOptions {
  download?: VerifiedDownloadOptions;
}

function parseContentLength(value: string | string[] | undefined): number | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === undefined) return undefined;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

async function openHttpsDownload(
  sourceUrl: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<DependencyDownloadBody> {
  if (redirects > 8) throw new Error("Too many download redirects.");
  if (signal.aborted) throw dependencyAbortError();
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("Dependency downloads require HTTPS.");
  }
  return new Promise<DependencyDownloadBody>((resolveDownload, rejectDownload) => {
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
        void openHttpsDownload(redirected, signal, redirects + 1)
          .then(resolveDownload, rejectDownload);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        rejectDownload(new Error(`Download failed with HTTP ${status}.`));
        return;
      }
      resolveDownload({
        stream: response,
        totalBytes: parseContentLength(response.headers["content-length"]),
      });
    });
    const onAbort = (): void => {
      req.destroy(dependencyAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    req.setTimeout(30_000, () => req.destroy(new Error("Dependency download timed out.")));
    req.once("error", rejectDownload);
    req.once("close", () => signal.removeEventListener("abort", onAbort));
    req.end();
  });
}

function validateArtifactManifest(manifest: DependencyArtifactManifest): void {
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
    throw new Error(`Invalid SHA-256 manifest for ${manifest.fileName}.`);
  }
  if (!Number.isSafeInteger(manifest.byteLength) || manifest.byteLength < 1
    || !Number.isSafeInteger(manifest.maxDownloadBytes)
    || manifest.maxDownloadBytes < manifest.byteLength) {
    throw new Error(`Invalid download limits for ${manifest.fileName}.`);
  }
}

async function writeAll(handle: FileHandle, chunk: Buffer): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
    if (bytesWritten <= 0) throw new Error("Could not write the downloaded dependency artifact.");
    offset += bytesWritten;
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function downloadVerifiedArtifact(
  sourceUrl: string,
  destination: string,
  manifest: DependencyArtifactManifest,
  signal: AbortSignal,
  onProgress: (downloadedBytes: number, totalBytes?: number) => void,
  options: VerifiedDownloadOptions = {},
): Promise<void> {
  validateArtifactManifest(manifest);
  const destinationDirectory = dirname(destination);
  const temporaryPath = options.temporaryPath?.(destination)
    ?? join(destinationDirectory, `.${basename(destination)}.${randomUUID()}.part`);
  if (relative(resolve(destinationDirectory), resolve(dirname(temporaryPath))) !== ""
    || resolve(temporaryPath) === resolve(destination)
    || !basename(temporaryPath).endsWith(".part")) {
    throw new Error("The dependency temporary file must be a distinct .part file in the destination directory.");
  }

  let body: DependencyDownloadBody | undefined;
  let handle: FileHandle | undefined;
  let temporaryCreated = false;
  let committed = false;
  let primaryError: unknown;
  let abortBody: (() => void) | undefined;
  try {
    body = await (options.openDownload ?? openHttpsDownload)(sourceUrl, signal);
    if (signal.aborted) throw dependencyAbortError();
    abortBody = () => body?.stream.destroy(dependencyAbortError());
    signal.addEventListener("abort", abortBody, { once: true });
    if (body.totalBytes !== undefined && body.totalBytes > manifest.maxDownloadBytes) {
      throw new Error(`Dependency download exceeds ${manifest.maxDownloadBytes} bytes.`);
    }
    if (body.totalBytes !== undefined && body.totalBytes !== manifest.byteLength) {
      throw new Error(
        `Dependency download size mismatch: expected ${manifest.byteLength}, received ${body.totalBytes}.`,
      );
    }
    handle = await open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    const hash = createHash("sha256");
    let downloadedBytes = 0;
    let lastProgressEmit = 0;
    for await (const rawChunk of body.stream) {
      if (signal.aborted) throw dependencyAbortError();
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      if (chunk.length > manifest.maxDownloadBytes - downloadedBytes) {
        throw new Error(`Dependency download exceeds ${manifest.maxDownloadBytes} bytes.`);
      }
      await writeAll(handle, chunk);
      hash.update(chunk);
      downloadedBytes += chunk.length;
      const now = Date.now();
      if (now - lastProgressEmit >= 120 || downloadedBytes === body.totalBytes) {
        lastProgressEmit = now;
        onProgress(downloadedBytes, body.totalBytes);
      }
    }
    if (signal.aborted) throw dependencyAbortError();
    if (downloadedBytes !== manifest.byteLength) {
      throw new Error(
        `Dependency download size mismatch: expected ${manifest.byteLength}, received ${downloadedBytes}.`,
      );
    }
    const actualHash = hash.digest("hex");
    if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
      throw new Error(
        `Dependency integrity check failed: expected ${manifest.sha256}, received ${actualHash}.`,
      );
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (signal.aborted) throw dependencyAbortError();
    await rename(temporaryPath, destination);
    committed = true;
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors: Error[] = [];
  if (abortBody) signal.removeEventListener("abort", abortBody);
  if (body && !body.stream.destroyed) {
    try {
      body.stream.destroy();
    } catch (error) {
      cleanupErrors.push(asError(error));
    }
  }
  if (handle) {
    try {
      await handle.close();
    } catch (error) {
      cleanupErrors.push(asError(error));
    }
  }
  if (temporaryCreated && !committed) {
    try {
      await rm(temporaryPath, { force: true });
    } catch (error) {
      cleanupErrors.push(asError(error));
    }
  }
  if (primaryError !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [asError(primaryError), ...cleanupErrors],
        "Dependency download failed and its temporary artifact could not be fully cleaned up.",
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Dependency download cleanup failed.");
  }
}

async function extractArchive(
  archivePath: string,
  destination: string,
  limits: NonNullable<DependencyArtifactManifest["archive"]>,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw dependencyAbortError();
  await validateZipArchive(archivePath, destination, limits);
  if (signal.aborted) throw dependencyAbortError();
  const tar = await runProcess("tar.exe", ["-xf", archivePath, "-C", destination], { signal });
  if (tar.code === 0) return;
  const script = `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`;
  const powershell = await runProcess(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodePowerShellCommand(script)],
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

/** Internal pure seam used by archive discovery and its focused tests. */
export function selectInstallerCandidate(
  directory: string,
  candidates: readonly string[],
  tokens: readonly string[],
): string {
  const selected = candidates
    .map((path) => ({ path, score: installerScore(path, tokens) }))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))[0];
  if (!selected) throw new Error("No Windows installer was found in the downloaded archive.");
  const root = resolve(directory);
  const resolved = resolve(selected.path);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error("The selected installer is outside the extracted download directory.");
  }
  return resolved;
}

async function selectInstaller(directory: string, tokens: readonly string[]): Promise<string> {
  return selectInstallerCandidate(directory, await collectInstallers(directory), tokens);
}

export async function prepareDependencyInstaller(
  item: DependencyCatalogItem,
  rootDir: string,
  signal: AbortSignal,
  onProgress: (progress: InstallerPreparationUpdate) => void,
  options: DependencyInstallerOptions = {},
): Promise<string> {
  const manifest = item.artifact;
  if (!manifest) throw new Error(`No download artifact is configured for ${item.name}.`);
  if (basename(manifest.fileName) !== manifest.fileName) {
    throw new Error(`Invalid download artifact filename for ${item.name}.`);
  }
  if (item.installKind === "archive" && !manifest.archive) {
    throw new Error(`No archive limits are configured for ${item.name}.`);
  }
  const resolvedRoot = resolve(rootDir);
  const itemDir = resolve(resolvedRoot, item.id);
  if (itemDir !== resolvedRoot && !itemDir.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("Invalid dependency download directory.");
  }
  await rm(itemDir, { recursive: true, force: true });
  await mkdir(itemDir, { recursive: true });
  const artifactPath = join(itemDir, manifest.fileName);
  try {
    onProgress({
      phase: "downloading",
      progress: 0,
      downloadedBytes: 0,
    });
    await downloadVerifiedArtifact(
      item.sourceUrl,
      artifactPath,
      manifest,
      signal,
      (downloadedBytes, totalBytes) => onProgress({
        phase: "downloading",
        progress: totalBytes ? Math.min(1, downloadedBytes / totalBytes) : undefined,
        downloadedBytes,
        totalBytes,
      }),
      options.download,
    );
    if (signal.aborted) throw dependencyAbortError();
    if (item.installKind !== "archive") return artifactPath;

    const extractDir = join(itemDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    onProgress({
      phase: "extracting",
      progress: 1,
      artifactPath,
    });
    await extractArchive(artifactPath, extractDir, item.artifact.archive, signal);
    return await selectInstaller(extractDir, item.installerTokens ?? []);
  } catch (error) {
    try {
      await rm(itemDir, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [asError(error), asError(cleanupError)],
        `Could not prepare or clean up the installer for ${item.name}.`,
      );
    }
    throw error;
  }
}

export async function installGitWithWinget(signal: AbortSignal): Promise<"installed" | "unavailable"> {
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
  if (result.code === -1 && /ENOENT|not found/i.test(result.stderr)) return "unavailable";
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `winget exited with code ${result.code}.`);
  }
  return "installed";
}
