import { open, stat, type FileHandle } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { DependencyArtifactManifest } from "./catalog.ts";

type ArchiveLimits = NonNullable<DependencyArtifactManifest["archive"]>;

export interface ZipValidationSummary {
  entries: number;
  uncompressedBytes: number;
}

interface ZipDirectory {
  entries: number;
  offset: number;
  size: number;
}

interface Zip64Fields {
  uncompressedSize?: number;
  compressedSize?: number;
  localHeaderOffset?: number;
  diskStart?: number;
}

interface CentralEntry {
  compressedSize: number;
  localHeaderOffset: number;
  name: Buffer;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const ZIP64_EXTRA_FIELD = 0x0001;
const MAX_EOCD_BYTES = 65_557;
const MAX_CENTRAL_DIRECTORY_BYTES = 256 * 1024 * 1024;

function archiveError(message: string): Error {
  return new Error(`Unsafe dependency archive: ${message}`);
}

function safeNumber(value: bigint, label: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw archiveError(`${label} is outside the supported range.`);
  }
  return Number(value);
}

async function readExactly(handle: FileHandle, length: number, position: number): Promise<Buffer> {
  if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(position) || position < 0) {
    throw archiveError("contains an invalid file offset.");
  }
  const buffer = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) throw archiveError("ended before its metadata was complete.");
    offset += bytesRead;
  }
  return buffer;
}

function findSignature(buffer: Buffer, signature: number, before = buffer.length): number {
  const needle = Buffer.allocUnsafe(4);
  needle.writeUInt32LE(signature);
  return buffer.lastIndexOf(needle, before - 1);
}

async function readZip64Directory(
  handle: FileHandle,
  eocdAbsoluteOffset: number,
): Promise<ZipDirectory> {
  const locatorWindowStart = Math.max(0, eocdAbsoluteOffset - 1_024);
  const locatorWindow = await readExactly(
    handle,
    eocdAbsoluteOffset - locatorWindowStart,
    locatorWindowStart,
  );
  const locatorOffset = findSignature(locatorWindow, ZIP64_END_LOCATOR);
  if (locatorOffset < 0 || locatorOffset + 20 > locatorWindow.length) {
    throw archiveError("is missing its ZIP64 end locator.");
  }
  if (locatorWindow.readUInt32LE(locatorOffset + 4) !== 0
    || locatorWindow.readUInt32LE(locatorOffset + 16) !== 1) {
    throw archiveError("multi-disk ZIP files are not supported.");
  }
  const recordOffset = safeNumber(locatorWindow.readBigUInt64LE(locatorOffset + 8), "ZIP64 record offset");
  const record = await readExactly(handle, 56, recordOffset);
  if (record.readUInt32LE(0) !== ZIP64_END_OF_CENTRAL_DIRECTORY) {
    throw archiveError("has an invalid ZIP64 end record.");
  }
  if (record.readBigUInt64LE(4) < 44n) {
    throw archiveError("has a truncated ZIP64 end record.");
  }
  if (record.readUInt32LE(16) !== 0 || record.readUInt32LE(20) !== 0) {
    throw archiveError("multi-disk ZIP files are not supported.");
  }
  const entriesOnDisk = record.readBigUInt64LE(24);
  const entries = record.readBigUInt64LE(32);
  if (entriesOnDisk !== entries) throw archiveError("multi-disk ZIP files are not supported.");
  return {
    entries: safeNumber(entries, "entry count"),
    size: safeNumber(record.readBigUInt64LE(40), "central directory size"),
    offset: safeNumber(record.readBigUInt64LE(48), "central directory offset"),
  };
}

async function readDirectory(
  handle: FileHandle,
  fileSize: number,
): Promise<ZipDirectory> {
  const tailLength = Math.min(fileSize, MAX_EOCD_BYTES);
  const tailStart = fileSize - tailLength;
  const tail = await readExactly(handle, tailLength, tailStart);
  const eocdOffset = findSignature(tail, END_OF_CENTRAL_DIRECTORY);
  if (eocdOffset < 0 || eocdOffset + 22 > tail.length) {
    throw archiveError("is missing its end-of-central-directory record.");
  }
  const commentLength = tail.readUInt16LE(eocdOffset + 20);
  if (eocdOffset + 22 + commentLength !== tail.length) {
    throw archiveError("has trailing or truncated end metadata.");
  }
  const eocdAbsoluteOffset = tailStart + eocdOffset;
  const disk = tail.readUInt16LE(eocdOffset + 4);
  const directoryDisk = tail.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = tail.readUInt16LE(eocdOffset + 8);
  const entries = tail.readUInt16LE(eocdOffset + 10);
  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entries) {
    throw archiveError("multi-disk ZIP files are not supported.");
  }
  if (entries === 0xffff
    || tail.readUInt32LE(eocdOffset + 12) === 0xffffffff
    || tail.readUInt32LE(eocdOffset + 16) === 0xffffffff) {
    return readZip64Directory(handle, eocdAbsoluteOffset);
  }
  return {
    entries,
    size: tail.readUInt32LE(eocdOffset + 12),
    offset: tail.readUInt32LE(eocdOffset + 16),
  };
}

function parseZip64Extra(
  extra: Buffer,
  required: {
    uncompressedSize: boolean;
    compressedSize: boolean;
    localHeaderOffset: boolean;
    diskStart: boolean;
  },
): Zip64Fields {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    const end = cursor + 4 + size;
    if (end > extra.length) throw archiveError("contains a truncated extra field.");
    if (id === ZIP64_EXTRA_FIELD) {
      let valueOffset = cursor + 4;
      const result: Zip64Fields = {};
      const read64 = (label: string): number => {
        if (valueOffset + 8 > end) throw archiveError(`is missing ZIP64 ${label}.`);
        const value = safeNumber(extra.readBigUInt64LE(valueOffset), label);
        valueOffset += 8;
        return value;
      };
      if (required.uncompressedSize) result.uncompressedSize = read64("uncompressed size");
      if (required.compressedSize) result.compressedSize = read64("compressed size");
      if (required.localHeaderOffset) result.localHeaderOffset = read64("local header offset");
      if (required.diskStart) {
        if (valueOffset + 4 > end) throw archiveError("is missing ZIP64 disk metadata.");
        result.diskStart = extra.readUInt32LE(valueOffset);
      }
      return result;
    }
    cursor = end;
  }
  if (Object.values(required).some(Boolean)) throw archiveError("is missing required ZIP64 metadata.");
  return {};
}

function decodeEntryName(name: Buffer, flags: number): string {
  if ((flags & 0x0800) === 0) return name.toString("latin1");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(name);
  } catch {
    throw archiveError("contains an invalid UTF-8 entry name.");
  }
}

function validateEntryName(
  rawName: Buffer,
  flags: number,
  destination: string,
  seen: Set<string>,
): void {
  const name = decodeEntryName(rawName, flags).replaceAll("\\", "/");
  if (!name.trim() || name.includes("\0") || name.startsWith("/") || name.includes(":")) {
    throw archiveError(`contains an invalid entry name: ${JSON.stringify(name)}.`);
  }
  const components = name.split("/");
  if (components.some((component) => component === "..")) {
    throw archiveError(`entry escapes the download directory: ${name}.`);
  }
  const root = resolve(destination);
  const target = resolve(root, ...components);
  if (target !== root && !target.toLowerCase().startsWith(`${root.toLowerCase()}${sep}`)) {
    throw archiveError(`entry escapes the download directory: ${name}.`);
  }
  const key = name.replace(/\/+$/, "").toLowerCase();
  if (!key || seen.has(key)) throw archiveError(`contains a duplicate entry: ${name}.`);
  seen.add(key);
}

function isSymbolicLink(versionMadeBy: number, externalAttributes: number): boolean {
  const origin = versionMadeBy >>> 8;
  const unixFileType = (externalAttributes >>> 16) & 0xf000;
  return (origin === 3 || origin === 19) && unixFileType === 0xa000;
}

async function validateLocalHeader(
  handle: FileHandle,
  entry: CentralEntry,
  centralDirectoryOffset: number,
): Promise<void> {
  const header = await readExactly(handle, 30, entry.localHeaderOffset);
  if (header.readUInt32LE(0) !== LOCAL_FILE_HEADER) {
    throw archiveError("contains an invalid local file header.");
  }
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  if (dataOffset + entry.compressedSize > centralDirectoryOffset) {
    throw archiveError("contains file data outside the archive payload.");
  }
  const localName = await readExactly(handle, nameLength, entry.localHeaderOffset + 30);
  if (!localName.equals(entry.name)) {
    throw archiveError("contains mismatched local and central entry names.");
  }
}

export async function validateZipArchive(
  archivePath: string,
  destination: string,
  limits: ArchiveLimits,
): Promise<ZipValidationSummary> {
  if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1
    || !Number.isSafeInteger(limits.maxExtractedBytes) || limits.maxExtractedBytes < 1) {
    throw new Error("Archive limits must be positive safe integers.");
  }
  const fileSize = (await stat(archivePath)).size;
  const handle = await open(archivePath, "r");
  try {
    const directory = await readDirectory(handle, fileSize);
    if (directory.entries > limits.maxEntries) {
      throw archiveError(`contains ${directory.entries} entries; the limit is ${limits.maxEntries}.`);
    }
    if (directory.size > MAX_CENTRAL_DIRECTORY_BYTES) {
      throw archiveError("central directory exceeds the metadata limit.");
    }
    if (directory.offset < 0 || directory.size < 0
      || directory.offset + directory.size > fileSize) {
      throw archiveError("central directory is outside the archive.");
    }

    const central = await readExactly(handle, directory.size, directory.offset);
    const seen = new Set<string>();
    const entries: CentralEntry[] = [];
    let cursor = 0;
    let uncompressedBytes = 0;
    for (let index = 0; index < directory.entries; index += 1) {
      if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY) {
        throw archiveError("contains a malformed central directory entry.");
      }
      const versionMadeBy = central.readUInt16LE(cursor + 4);
      const flags = central.readUInt16LE(cursor + 8);
      if ((flags & 0x0001) !== 0) throw archiveError("encrypted entries are not supported.");
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
      if (recordEnd > central.length) throw archiveError("contains truncated entry metadata.");
      const name = central.subarray(cursor + 46, cursor + 46 + nameLength);
      const extra = central.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
      const size32 = central.readUInt32LE(cursor + 24);
      const compressed32 = central.readUInt32LE(cursor + 20);
      const offset32 = central.readUInt32LE(cursor + 42);
      const disk32 = central.readUInt16LE(cursor + 34);
      const zip64 = parseZip64Extra(extra, {
        uncompressedSize: size32 === 0xffffffff,
        compressedSize: compressed32 === 0xffffffff,
        localHeaderOffset: offset32 === 0xffffffff,
        diskStart: disk32 === 0xffff,
      });
      const entryBytes = zip64.uncompressedSize ?? size32;
      const compressedSize = zip64.compressedSize ?? compressed32;
      const localHeaderOffset = zip64.localHeaderOffset ?? offset32;
      const diskStart = zip64.diskStart ?? disk32;
      if (diskStart !== 0) throw archiveError("multi-disk ZIP files are not supported.");
      if (isSymbolicLink(versionMadeBy, central.readUInt32LE(cursor + 38))) {
        throw archiveError(`contains a symbolic link: ${decodeEntryName(name, flags)}.`);
      }
      validateEntryName(name, flags, destination, seen);
      if (entryBytes > limits.maxExtractedBytes - uncompressedBytes) {
        throw archiveError(`expanded data exceeds ${limits.maxExtractedBytes} bytes.`);
      }
      uncompressedBytes += entryBytes;
      entries.push({ compressedSize, localHeaderOffset, name: Buffer.from(name) });
      cursor = recordEnd;
    }
    if (cursor !== central.length) {
      throw archiveError("central directory contains unexpected trailing records.");
    }
    for (const entry of entries) {
      await validateLocalHeader(handle, entry, directory.offset);
    }
    return { entries: directory.entries, uncompressedBytes };
  } finally {
    await handle.close();
  }
}
