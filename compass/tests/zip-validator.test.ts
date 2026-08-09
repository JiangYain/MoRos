import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateZipArchive } from "../src/main/dependencies/zip-validator.ts";

interface ZipEntryFixture {
  centralName: string;
  localName?: string;
  data?: Buffer;
  declaredUncompressedBytes?: number;
  flags?: number;
  versionMadeBy?: number;
  externalAttributes?: number;
}

function buildStoredZip(entries: readonly ZipEntryFixture[]): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const flags = entry.flags ?? 0x0800;
    const data = entry.data ?? Buffer.alloc(0);
    const localName = Buffer.from(entry.localName ?? entry.centralName, "utf8");
    const centralName = Buffer.from(entry.centralName, "utf8");
    const uncompressedBytes = entry.declaredUncompressedBytes ?? data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(uncompressedBytes, 22);
    localHeader.writeUInt16LE(localName.length, 26);
    const localRecord = Buffer.concat([localHeader, localName, data]);
    localRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(entry.versionMadeBy ?? 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(uncompressedBytes, 24);
    centralHeader.writeUInt16LE(centralName.length, 28);
    centralHeader.writeUInt32LE(entry.externalAttributes ?? 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([centralHeader, centralName]));
    localOffset += localRecord.length;
  }

  const localPayload = Buffer.concat(localRecords);
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localPayload.length, 16);
  return Buffer.concat([localPayload, centralDirectory, end]);
}

async function withZip(
  entries: readonly ZipEntryFixture[],
  run: (archivePath: string, destination: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "compass-zip-validator-test-"));
  try {
    const archivePath = join(directory, "fixture.zip");
    const destination = join(directory, "extracted");
    await writeFile(archivePath, buildStoredZip(entries));
    await run(archivePath, destination);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("ZIP validation accepts bounded entries and reports expanded bytes", async () => {
  await withZip([
    { centralName: "payload/setup.exe", data: Buffer.from("setup") },
    { centralName: "payload/readme.txt", data: Buffer.from("readme") },
  ], async (archivePath, destination) => {
    assert.deepEqual(
      await validateZipArchive(archivePath, destination, {
        maxEntries: 2,
        maxExtractedBytes: 11,
      }),
      { entries: 2, uncompressedBytes: 11 },
    );
  });
});

test("ZIP validation rejects traversal in central and local entry metadata", async (t) => {
  await t.test("central directory traversal", async () => {
    await withZip([
      { centralName: "../outside.exe", data: Buffer.from("unsafe") },
    ], async (archivePath, destination) => {
      await assert.rejects(
        validateZipArchive(archivePath, destination, {
          maxEntries: 10,
          maxExtractedBytes: 1_024,
        }),
        /entry escapes the download directory/,
      );
    });
  });

  await t.test("local header disagrees with safe central name", async () => {
    await withZip([
      {
        centralName: "payload/setup.exe",
        localName: "../outside.exe",
        data: Buffer.from("unsafe"),
      },
    ], async (archivePath, destination) => {
      await assert.rejects(
        validateZipArchive(archivePath, destination, {
          maxEntries: 10,
          maxExtractedBytes: 1_024,
        }),
        /mismatched local and central entry names/,
      );
    });
  });
});

test("ZIP validation enforces entry-count and expanded-byte budgets", async (t) => {
  await t.test("entry-count limit", async () => {
    await withZip([
      { centralName: "one.txt" },
      { centralName: "two.txt" },
    ], async (archivePath, destination) => {
      await assert.rejects(
        validateZipArchive(archivePath, destination, {
          maxEntries: 1,
          maxExtractedBytes: 1_024,
        }),
        /contains 2 entries; the limit is 1/,
      );
    });
  });

  await t.test("expanded-byte limit", async () => {
    await withZip([
      { centralName: "large.bin", declaredUncompressedBytes: 2_048 },
    ], async (archivePath, destination) => {
      await assert.rejects(
        validateZipArchive(archivePath, destination, {
          maxEntries: 10,
          maxExtractedBytes: 1_024,
        }),
        /expanded data exceeds 1024 bytes/,
      );
    });
  });
});

test("ZIP validation rejects symbolic-link entries before extraction", async () => {
  await withZip([
    {
      centralName: "payload/link",
      versionMadeBy: (3 << 8) | 20,
      externalAttributes: (0xa000 << 16) >>> 0,
    },
  ], async (archivePath, destination) => {
    await assert.rejects(
      validateZipArchive(archivePath, destination, {
        maxEntries: 10,
        maxExtractedBytes: 1_024,
      }),
      /contains a symbolic link/,
    );
  });
});
