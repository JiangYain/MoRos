import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import {
  loadJsonFile,
  nodeSettingsFileSystem,
  saveJsonFileAtomic,
  SettingsAtomicWriteError,
  type SettingsFileSystem,
} from "../src/main/settings-persistence.ts";

function withTemporaryDirectory(run: (directoryPath: string) => void): void {
  const directoryPath = mkdtempSync(join(tmpdir(), "moros-settings-test-"));
  try {
    run(directoryPath);
  } finally {
    rmSync(directoryPath, { recursive: true, force: true });
  }
}

test("a first run reports missing settings without creating recovery artifacts", () => {
  withTemporaryDirectory((directoryPath) => {
    const filePath = join(directoryPath, "moros-settings.json");
    const result = loadJsonFile(filePath);

    assert.equal(result.kind, "missing");
    assert.equal(existsSync(filePath), false);
    assert.equal(existsSync(`${filePath}.corrupt`), false);
  });
});

test("a settings read error is distinct from a missing file", () => {
  const readError = Object.assign(new Error("simulated access failure"), { code: "EACCES" });
  const result = loadJsonFile("unreadable-settings.json", {
    fileSystem: {
      ...nodeSettingsFileSystem,
      readUtf8: () => {
        throw readError;
      },
    },
  });

  assert.deepEqual(result, { kind: "read-error", error: readError });
});

test("settings round-trip only after the temporary file is flushed and closed", () => {
  withTemporaryDirectory((directoryPath) => {
    const filePath = join(directoryPath, "moros-settings.json");
    const temporaryPath = join(directoryPath, ".settings-under-test.tmp");
    const operations: string[] = [];
    const recordingFileSystem: SettingsFileSystem = {
      ...nodeSettingsFileSystem,
      createExclusive: (path) => {
        operations.push(`create:${basename(path)}`);
        const writable = nodeSettingsFileSystem.createExclusive(path);
        return {
          writeUtf8: (contents) => {
            operations.push("write");
            writable.writeUtf8(contents);
          },
          flush: () => {
            operations.push("flush");
            writable.flush();
          },
          close: () => {
            operations.push("close");
            writable.close();
          },
        };
      },
      replace: (sourcePath, targetPath) => {
        operations.push("replace");
        nodeSettingsFileSystem.replace(sourcePath, targetPath);
      },
    };
    const expected = { language: "zh-CN", enabledModels: ["test::model"] };

    saveJsonFileAtomic(filePath, expected, {
      fileSystem: recordingFileSystem,
      temporaryPath: () => temporaryPath,
    });
    const result = loadJsonFile<typeof expected>(filePath);

    assert.deepEqual(operations, [
      "create:.settings-under-test.tmp",
      "write",
      "flush",
      "close",
      "replace",
    ]);
    assert.deepEqual(result, { kind: "loaded", value: expected });
    assert.equal(existsSync(temporaryPath), false);
  });
});

test("truncated JSON returns an explicit corrupt result and preserves recoverable evidence", () => {
  withTemporaryDirectory((directoryPath) => {
    const filePath = join(directoryPath, "moros-settings.json");
    const truncated = '{\n  "language": "zh-CN"';
    writeFileSync(filePath, truncated, "utf8");

    const first = loadJsonFile(filePath);
    assert.equal(first.kind, "corrupt");
    if (first.kind !== "corrupt") return;
    assert.equal(first.quarantinePath, `${filePath}.corrupt`);
    assert.equal(readFileSync(first.quarantinePath, "utf8"), truncated);
    assert.equal(readFileSync(filePath, "utf8"), truncated);

    const second = loadJsonFile(filePath);
    assert.equal(second.kind, "corrupt");
    if (second.kind !== "corrupt") return;
    assert.equal(second.quarantinePath, first.quarantinePath);
    assert.equal(existsSync(`${filePath}.corrupt.1`), false);
  });
});

test("an atomic replace failure keeps the previous settings and cleans its temporary file", () => {
  withTemporaryDirectory((directoryPath) => {
    const filePath = join(directoryPath, "moros-settings.json");
    const temporaryPath = join(dirname(filePath), ".settings-replace-failure.tmp");
    const previous = '{"version":"previous"}\n';
    writeFileSync(filePath, previous, "utf8");
    const failingFileSystem: SettingsFileSystem = {
      ...nodeSettingsFileSystem,
      replace: () => {
        throw new Error("simulated replace failure");
      },
    };

    assert.throws(
      () => saveJsonFileAtomic(filePath, { version: "next" }, {
        fileSystem: failingFileSystem,
        temporaryPath: () => temporaryPath,
      }),
      (error) => {
        assert.ok(error instanceof SettingsAtomicWriteError);
        assert.match(String(error.cause), /simulated replace failure/);
        assert.equal(error.closeError, undefined);
        assert.equal(error.cleanupError, undefined);
        return true;
      },
    );
    assert.equal(readFileSync(filePath, "utf8"), previous);
    assert.equal(existsSync(temporaryPath), false);
  });
});

test("write, close, and cleanup failures retain the write failure as the cause", () => {
  const calls: string[] = [];
  const writeError = new Error("WRITE");
  const closeError = new Error("CLOSE");
  const cleanupError = new Error("REMOVE");
  const fileSystem: SettingsFileSystem = {
    readUtf8: () => "",
    ensureDirectory: () => undefined,
    createExclusive: () => ({
      writeUtf8: () => {
        calls.push("write");
        throw writeError;
      },
      flush: () => calls.push("flush"),
      close: () => {
        calls.push("close");
        throw closeError;
      },
    }),
    replace: () => calls.push("replace"),
    remove: () => {
      calls.push("remove");
      throw cleanupError;
    },
  };

  assert.throws(
    () => saveJsonFileAtomic("C:\\settings\\moros-settings.json", { language: "en" }, {
      fileSystem,
      temporaryPath: () => "C:\\settings\\.moros-settings.tmp",
    }),
    (error) => {
      assert.ok(error instanceof SettingsAtomicWriteError);
      assert.equal(error.cause, writeError);
      assert.equal(error.closeError, closeError);
      assert.equal(error.cleanupError, cleanupError);
      return true;
    },
  );
  assert.deepEqual(calls, ["write", "close", "remove"]);
});

for (const failurePoint of ["flush", "close"] as const) {
  test(`${failurePoint} failure prevents replacement and removes the temporary file`, () => {
    const calls: string[] = [];
    const primaryError = new Error(failurePoint.toUpperCase());
    const fileSystem: SettingsFileSystem = {
      readUtf8: () => "",
      ensureDirectory: () => undefined,
      createExclusive: () => ({
        writeUtf8: () => calls.push("write"),
        flush: () => {
          calls.push("flush");
          if (failurePoint === "flush") throw primaryError;
        },
        close: () => {
          calls.push("close");
          if (failurePoint === "close") throw primaryError;
        },
      }),
      replace: () => calls.push("replace"),
      remove: () => calls.push("remove"),
    };

    assert.throws(
      () => saveJsonFileAtomic("C:\\settings\\moros-settings.json", { language: "en" }, {
        fileSystem,
        temporaryPath: () => "C:\\settings\\.moros-settings.tmp",
      }),
      (error) => {
        assert.ok(error instanceof SettingsAtomicWriteError);
        assert.equal(error.cause, primaryError);
        assert.equal(error.closeError, undefined);
        assert.equal(error.cleanupError, undefined);
        return true;
      },
    );
    assert.equal(calls.includes("replace"), false);
    assert.equal(calls.at(-1), "remove");
  });
}
