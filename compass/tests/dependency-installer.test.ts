import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import type {
  DependencyArtifactManifest,
  DependencyCatalogItem,
} from "../src/main/dependencies/catalog.ts";
import {
  downloadVerifiedArtifact,
  prepareDependencyInstaller,
  type DependencyDownloadOpener,
} from "../src/main/dependencies/installer.ts";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function withTemporaryDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "compass-dependency-installer-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function artifactManifest(
  payload: Buffer,
  overrides: Partial<DependencyArtifactManifest> = {},
): DependencyArtifactManifest {
  return {
    fileName: "artifact.bin",
    byteLength: payload.length,
    sha256: createHash("sha256").update(payload).digest("hex"),
    maxDownloadBytes: payload.length,
    ...overrides,
  };
}

function body(payload: readonly Buffer[], totalBytes?: number): DependencyDownloadOpener {
  return async () => ({ stream: Readable.from(payload), totalBytes });
}

test("verified downloads commit only matching bytes from an exclusive same-directory part", async () => {
  await withTemporaryDirectory(async (directory) => {
    const payload = Buffer.from("verified dependency artifact");
    const destination = join(directory, "artifact.bin");
    const temporaryPath = join(directory, ".artifact-under-test.part");
    const progress: number[] = [];

    await downloadVerifiedArtifact(
      "https://example.test/artifact.bin",
      destination,
      artifactManifest(payload),
      new AbortController().signal,
      (downloadedBytes) => progress.push(downloadedBytes),
      {
        openDownload: body([payload.subarray(0, 8), payload.subarray(8)], payload.length),
        temporaryPath: () => temporaryPath,
      },
    );

    assert.deepEqual(await readFile(destination), payload);
    assert.equal(await pathExists(temporaryPath), false);
    assert.equal(progress.at(-1), payload.length);
  });
});

test("corrupt, truncated, oversized, and aborted downloads never publish a final artifact", async (t) => {
  const cases: Array<{
    name: string;
    payload: Buffer;
    manifest: DependencyArtifactManifest;
    totalBytes?: number;
    expected: RegExp | ((error: unknown) => boolean);
    abortOnProgress?: boolean;
  }> = [];
  const valid = Buffer.from("abcd");
  cases.push({
    name: "hash mismatch",
    payload: valid,
    manifest: artifactManifest(valid, { sha256: "0".repeat(64) }),
    totalBytes: valid.length,
    expected: /integrity check failed/,
  });
  cases.push({
    name: "declared truncation",
    payload: valid,
    manifest: artifactManifest(valid),
    totalBytes: valid.length - 1,
    expected: /size mismatch/,
  });
  const oversized = Buffer.from("abcdef");
  cases.push({
    name: "stream exceeds limit",
    payload: oversized,
    manifest: artifactManifest(valid),
    expected: /exceeds 4 bytes/,
  });
  cases.push({
    name: "mid-stream abort",
    payload: oversized,
    manifest: artifactManifest(oversized),
    totalBytes: oversized.length,
    abortOnProgress: true,
    expected: (error: unknown) => error instanceof Error && error.name === "AbortError",
  });

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      await withTemporaryDirectory(async (directory) => {
        const destination = join(directory, "artifact.bin");
        const temporaryPath = join(directory, ".failed-artifact.part");
        const controller = new AbortController();
        const chunks = testCase.abortOnProgress
          ? [testCase.payload.subarray(0, 3), testCase.payload.subarray(3)]
          : [testCase.payload];
        await assert.rejects(
          downloadVerifiedArtifact(
            "https://example.test/artifact.bin",
            destination,
            testCase.manifest,
            controller.signal,
            () => {
              if (testCase.abortOnProgress) controller.abort();
            },
            {
              openDownload: body(chunks, testCase.totalBytes),
              temporaryPath: () => temporaryPath,
            },
          ),
          testCase.expected,
        );
        assert.equal(await pathExists(destination), false);
        assert.equal(await pathExists(temporaryPath), false);
      });
    });
  }
});

test("an exclusive part collision is never deleted as download cleanup", async () => {
  await withTemporaryDirectory(async (directory) => {
    const payload = Buffer.from("payload");
    const destination = join(directory, "artifact.bin");
    const temporaryPath = join(directory, ".owned-by-another-writer.part");
    await writeFile(temporaryPath, "sentinel", "utf8");

    await assert.rejects(
      downloadVerifiedArtifact(
        "https://example.test/artifact.bin",
        destination,
        artifactManifest(payload),
        new AbortController().signal,
        () => undefined,
        {
          openDownload: body([payload], payload.length),
          temporaryPath: () => temporaryPath,
        },
      ),
      (error: unknown) => error instanceof Error
        && "code" in error
        && (error as NodeJS.ErrnoException).code === "EEXIST",
    );
    assert.equal(await readFile(temporaryPath, "utf8"), "sentinel");
    assert.equal(await pathExists(destination), false);
  });
});

test("cancellation destroys a stalled response body and removes its part file", async () => {
  await withTemporaryDirectory(async (directory) => {
    const expected = Buffer.from("complete payload");
    const destination = join(directory, "artifact.bin");
    const temporaryPath = join(directory, ".stalled-download.part");
    const controller = new AbortController();
    const stream = new PassThrough();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const downloading = downloadVerifiedArtifact(
      "https://example.test/artifact.bin",
      destination,
      artifactManifest(expected),
      controller.signal,
      () => markStarted(),
      {
        openDownload: async () => ({ stream, totalBytes: expected.length }),
        temporaryPath: () => temporaryPath,
      },
    );
    stream.write(expected.subarray(0, 4));
    await started;
    controller.abort();

    await assert.rejects(
      downloading,
      (error: unknown) => error instanceof Error && error.name === "AbortError",
    );
    assert.equal(await pathExists(destination), false);
    assert.equal(await pathExists(temporaryPath), false);
  });
});

test("archive validation failures remove the verified artifact and extraction directory", async () => {
  await withTemporaryDirectory(async (directory) => {
    const payload = Buffer.from("not a zip archive");
    const item: DependencyCatalogItem = {
      id: "phonak-target",
      category: "fitting-software",
      installKind: "archive",
      name: "Test archive",
      vendor: "Test",
      required: false,
      sourceUrl: "https://example.test/archive.zip",
      documentationUrl: "https://example.test/",
      artifact: artifactManifest(payload, {
        fileName: "archive.zip",
        archive: { maxEntries: 10, maxExtractedBytes: 1_024 },
      }),
      installerTokens: ["setup"],
    };

    await assert.rejects(
      prepareDependencyInstaller(
        item,
        directory,
        new AbortController().signal,
        () => undefined,
        { download: { openDownload: body([payload], payload.length) } },
      ),
      /Unsafe dependency archive/,
    );
    assert.equal(await pathExists(join(directory, item.id)), false);
  });
});
