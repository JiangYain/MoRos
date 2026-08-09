import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";

export interface SettingsWritableFile {
  writeUtf8(contents: string): void;
  flush(): void;
  close(): void;
}

export interface SettingsFileSystem {
  readUtf8(filePath: string): string;
  ensureDirectory(directoryPath: string): void;
  createExclusive(filePath: string): SettingsWritableFile;
  replace(sourcePath: string, targetPath: string): void;
  remove(filePath: string): void;
}

export const nodeSettingsFileSystem: SettingsFileSystem = {
  readUtf8: (filePath) => readFileSync(filePath, "utf8"),
  ensureDirectory: (directoryPath) => mkdirSync(directoryPath, { recursive: true }),
  createExclusive: (filePath) => {
    let descriptor: number | undefined = openSync(filePath, "wx", 0o600);
    const useDescriptor = (): number => {
      if (descriptor === undefined) throw new Error(`Settings file is already closed: ${filePath}`);
      return descriptor;
    };
    return {
      writeUtf8: (contents) => writeFileSync(useDescriptor(), contents, "utf8"),
      flush: () => fsyncSync(useDescriptor()),
      close: () => {
        if (descriptor === undefined) return;
        const openDescriptor = descriptor;
        descriptor = undefined;
        closeSync(openDescriptor);
      },
    };
  },
  // Node maps this same-volume rename to the platform's replace operation.
  // In particular, it does not need the unsafe Windows fallback of deleting
  // the destination before moving the new file into place.
  replace: (sourcePath, targetPath) => renameSync(sourcePath, targetPath),
  remove: (filePath) => unlinkSync(filePath),
};

export interface SettingsPersistenceOptions {
  fileSystem?: SettingsFileSystem;
  temporaryPath?: (targetPath: string) => string;
}

export type JsonFileLoadResult<T> =
  | { kind: "missing" }
  | { kind: "loaded"; value: T }
  | {
    kind: "corrupt";
    error: Error;
    quarantinePath?: string;
    quarantineError?: Error;
  }
  | { kind: "read-error"; error: Error };

export class SettingsAtomicWriteError extends Error {
  readonly targetPath: string;
  readonly temporaryPath: string;
  readonly closeError?: Error;
  readonly cleanupError?: Error;

  constructor(
    targetPath: string,
    temporaryPath: string,
    cause: unknown,
    closeError?: unknown,
    cleanupError?: unknown,
  ) {
    super(`Could not atomically save settings to ${targetPath}`, { cause });
    this.name = "SettingsAtomicWriteError";
    this.targetPath = targetPath;
    this.temporaryPath = temporaryPath;
    this.closeError = closeError === undefined ? undefined : asError(closeError);
    this.cleanupError = cleanupError === undefined ? undefined : asError(cleanupError);
  }
}

class ExclusiveWriteError extends Error {
  readonly closeError?: Error;
  readonly cleanupError?: Error;

  constructor(
    filePath: string,
    cause: unknown,
    closeError?: unknown,
    cleanupError?: unknown,
  ) {
    super(`Could not durably write ${filePath}`, { cause });
    this.name = "ExclusiveWriteError";
    this.closeError = closeError === undefined ? undefined : asError(closeError);
    this.cleanupError = cleanupError === undefined ? undefined : asError(cleanupError);
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function hasErrorCode(value: unknown, code: string): boolean {
  return value instanceof Error
    && "code" in value
    && (value as NodeJS.ErrnoException).code === code;
}

function removeCreatedFile(fileSystem: SettingsFileSystem, filePath: string): Error | undefined {
  try {
    fileSystem.remove(filePath);
    return undefined;
  } catch (error) {
    return hasErrorCode(error, "ENOENT") ? undefined : asError(error);
  }
}

function writeExclusiveUtf8(
  fileSystem: SettingsFileSystem,
  filePath: string,
  contents: string,
): void {
  // A failure from createExclusive is returned unchanged so callers can still
  // distinguish EEXIST without risking deletion of a file they did not create.
  const writable = fileSystem.createExclusive(filePath);
  let primaryError: unknown;
  let closeError: unknown;

  try {
    writable.writeUtf8(contents);
    writable.flush();
  } catch (error) {
    primaryError = error;
  }

  try {
    writable.close();
  } catch (error) {
    if (primaryError === undefined) primaryError = error;
    else closeError = error;
  }

  if (primaryError !== undefined) {
    const cleanupError = removeCreatedFile(fileSystem, filePath);
    throw new ExclusiveWriteError(filePath, primaryError, closeError, cleanupError);
  }
}

function quarantinePath(targetPath: string, index: number): string {
  return `${targetPath}.corrupt${index === 0 ? "" : `.${index}`}`;
}

function preserveCorruptContents(
  fileSystem: SettingsFileSystem,
  targetPath: string,
  contents: string,
): string {
  for (let index = 0; index < 1_000; index += 1) {
    const candidate = quarantinePath(targetPath, index);
    try {
      const existing = fileSystem.readUtf8(candidate);
      if (existing === contents) return candidate;
      continue;
    } catch (error) {
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }

    try {
      writeExclusiveUtf8(fileSystem, candidate, contents);
      return candidate;
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) continue;
      throw error;
    }
  }
  throw new Error(`Too many preserved settings files for ${targetPath}`);
}

export function loadJsonFile<T>(
  targetPath: string,
  options: SettingsPersistenceOptions & { parse?: (contents: string) => T } = {},
): JsonFileLoadResult<T> {
  const fileSystem = options.fileSystem ?? nodeSettingsFileSystem;
  let contents: string;
  try {
    contents = fileSystem.readUtf8(targetPath);
  } catch (error) {
    return hasErrorCode(error, "ENOENT")
      ? { kind: "missing" }
      : { kind: "read-error", error: asError(error) };
  }

  try {
    const parse = options.parse ?? ((raw: string) => JSON.parse(raw) as T);
    return { kind: "loaded", value: parse(contents) };
  } catch (error) {
    try {
      return {
        kind: "corrupt",
        error: asError(error),
        quarantinePath: preserveCorruptContents(fileSystem, targetPath, contents),
      };
    } catch (quarantineError) {
      return {
        kind: "corrupt",
        error: asError(error),
        quarantineError: asError(quarantineError),
      };
    }
  }
}

export function saveJsonFileAtomic(
  targetPath: string,
  value: unknown,
  options: SettingsPersistenceOptions = {},
): void {
  const fileSystem = options.fileSystem ?? nodeSettingsFileSystem;
  const directoryPath = dirname(targetPath);
  const temporaryPath = options.temporaryPath?.(targetPath)
    ?? join(directoryPath, `.${basename(targetPath)}.${randomUUID()}.tmp`);

  if (relative(resolve(directoryPath), resolve(dirname(temporaryPath))) !== "") {
    throw new Error("The settings temporary file must be in the destination directory");
  }

  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new TypeError("Settings must be JSON-serializable");
  }

  fileSystem.ensureDirectory(directoryPath);
  let readyForReplace = false;
  try {
    writeExclusiveUtf8(fileSystem, temporaryPath, `${serialized}\n`);
    readyForReplace = true;
    fileSystem.replace(temporaryPath, targetPath);
  } catch (error) {
    const writeError = error instanceof ExclusiveWriteError ? error : undefined;
    const cleanupError = readyForReplace
      ? removeCreatedFile(fileSystem, temporaryPath)
      : writeError?.cleanupError;
    throw new SettingsAtomicWriteError(
      targetPath,
      temporaryPath,
      writeError?.cause ?? error,
      writeError?.closeError,
      cleanupError,
    );
  }
}
