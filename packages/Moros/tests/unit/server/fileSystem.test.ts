// @vitest-environment node
import { describe, test, expect, beforeAll, afterAll } from "vitest"
import fs from "fs/promises"
import os from "os"
import path from "path"

type FSMod = {
  ensureDataDir: () => Promise<void>
  createFolder: (name: string, parentPath?: string) => Promise<any>
  createFile: (name: string, content?: string, parentPath?: string) => Promise<any>
  readFileContent: (filePath: string) => Promise<string>
  writeFileContent: (filePath: string, content: string) => Promise<void>
  deleteItem: (itemPath: string) => Promise<void>
  renameItem: (oldPath: string, newName: string) => Promise<any>
  moveItem: (sourcePath: string, targetParentPath?: string) => Promise<any>
  reorderItems: (parentPath: string | undefined, orderedNames: string[]) => Promise<void>
  setFolderColor: (folderPath: string, color?: string) => Promise<void>
  setFolderCoverImage: (folderPath: string, coverImagePath?: string) => Promise<void>
  getFileTree: (options?: { fresh?: boolean }) => Promise<any[]>
  getAbsoluteItemPath: (itemPath: string) => string
}

let testRoot: string
let mod: FSMod
const originalCwd = process.cwd()

beforeAll(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "moros-fs-vitest-"))
  process.chdir(testRoot)
  mod = (await import("../../../server/utils/fileSystem")) as unknown as FSMod
  await mod.ensureDataDir()
})

afterAll(async () => {
  process.chdir(originalCwd)
  if (testRoot) {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// createFolder / createFile
// ---------------------------------------------------------------------------

describe("createFolder", () => {
  test("creates a new folder and returns metadata", async () => {
    const result = await mod.createFolder("FolderA")
    expect(result.type).toBe("folder")
    expect(result.name).toBe("FolderA")
    const stat = await fs.stat(path.join(testRoot, "markov-data", "FolderA"))
    expect(stat.isDirectory()).toBe(true)
  })

  test("creates nested folder", async () => {
    await mod.createFolder("Nest")
    const child = await mod.createFolder("Inner", "Nest")
    expect(child.path).toBe("Nest/Inner")
  })

  test("rejects path-traversal names", async () => {
    await expect(mod.createFolder("../escape")).rejects.toThrow()
  })
})

describe("createFile", () => {
  test("creates a file with content", async () => {
    const result = await mod.createFile("hello.md", "# Hello")
    expect(result.type).toBe("file")
    expect(result.name).toBe("hello.md")
    const content = await fs.readFile(
      path.join(testRoot, "markov-data", "hello.md"),
      "utf-8",
    )
    expect(content).toBe("# Hello")
  })

  test("creates a file inside a subfolder", async () => {
    await mod.createFolder("SubDir")
    const result = await mod.createFile("note.txt", "body", "SubDir")
    expect(result.path).toBe("SubDir/note.txt")
    const content = await mod.readFileContent("SubDir/note.txt")
    expect(content).toBe("body")
  })
})

// ---------------------------------------------------------------------------
// renameItem — core regression tests
// ---------------------------------------------------------------------------

describe("renameItem", () => {
  test("renames a folder", async () => {
    await mod.createFolder("RenSrc1")
    const result = await mod.renameItem("RenSrc1", "RenDst1")
    expect(result.path).toBe("RenDst1")
    expect(result.type).toBe("folder")
  })

  test("renames a file and preserves content", async () => {
    await mod.createFile("oldfile.md", "data-123")
    const result = await mod.renameItem("oldfile.md", "newfile.md")
    expect(result.type).toBe("file")
    expect(result.name).toBe("newfile.md")
    const content = await mod.readFileContent("newfile.md")
    expect(content).toBe("data-123")
  })

  test("rejects when target name already exists", async () => {
    await mod.createFolder("RenSrc2")
    await mod.createFolder("RenDst2")
    await expect(mod.renameItem("RenSrc2", "RenDst2")).rejects.toThrow(
      /目标位置已存在同名项目/,
    )
  })

  test("preserves folder color after rename", async () => {
    await mod.createFolder("ColorSrc")
    await mod.setFolderColor("ColorSrc", "#ff0000")

    await mod.renameItem("ColorSrc", "ColorDst")

    const tree = await mod.getFileTree({ fresh: true })
    const folder = tree.find((n: any) => n.name === "ColorDst")
    expect(folder).toBeDefined()
    expect(folder.color).toBe("#ff0000")
  })

  test("preserves coverImagePath after rename", async () => {
    await mod.createFolder("CoverSrc")
    await mod.createFile("img.png", "fake", "CoverSrc")
    await mod.setFolderCoverImage("CoverSrc", "CoverSrc/img.png")

    await mod.renameItem("CoverSrc", "CoverDst")

    const tree = await mod.getFileTree({ fresh: true })
    const folder = tree.find((n: any) => n.name === "CoverDst")
    expect(folder).toBeDefined()
    expect(folder.coverImagePath).toBe("CoverSrc/img.png")
  })

  test("no-op when new name resolves to same path (case-insensitive on Windows)", async () => {
    await mod.createFolder("SamePath")
    const result = await mod.renameItem("SamePath", "SamePath")
    expect(result.type).toBe("folder")
    expect(result.name).toBe("SamePath")
  })
})

// ---------------------------------------------------------------------------
// deleteItem
// ---------------------------------------------------------------------------

describe("deleteItem", () => {
  test("deletes a folder", async () => {
    await mod.createFolder("DelFolder")
    await mod.deleteItem("DelFolder")
    const exists = await fs
      .access(path.join(testRoot, "markov-data", "DelFolder"))
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })

  test("cleans up parent metadata on deletion", async () => {
    await mod.createFolder("MetaDel")
    await mod.setFolderColor("MetaDel", "#00ff00")

    const metaPath = path.join(testRoot, "markov-data", ".metadata.json")
    const before = JSON.parse(await fs.readFile(metaPath, "utf-8"))
    expect(before["MetaDel"]).toBeDefined()

    await mod.deleteItem("MetaDel")

    const after = JSON.parse(await fs.readFile(metaPath, "utf-8"))
    expect(after["MetaDel"]).toBeUndefined()
  })

  test("is idempotent for missing items", async () => {
    await expect(mod.deleteItem("NoSuchItem999")).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// moveItem
// ---------------------------------------------------------------------------

describe("moveItem", () => {
  test("moves a folder into another folder", async () => {
    await mod.createFolder("MoveSrc")
    await mod.createFolder("MoveTgt")
    const result = await mod.moveItem("MoveSrc", "MoveTgt")
    expect(result.path).toBe("MoveTgt/MoveSrc")
    expect(result.type).toBe("folder")
  })

  test("migrates metadata to target parent after move", async () => {
    await mod.createFolder("MoveMetaSrc")
    await mod.setFolderColor("MoveMetaSrc", "#0000ff")
    await mod.createFolder("MoveMetaDst")

    await mod.moveItem("MoveMetaSrc", "MoveMetaDst")

    const tree = await mod.getFileTree({ fresh: true })
    const moved = tree.find(
      (n: any) =>
        n.name === "MoveMetaSrc" && n.path === "MoveMetaDst/MoveMetaSrc",
    )
    expect(moved).toBeDefined()
    expect(moved.color).toBe("#0000ff")
  })

  test("rejects when target already has same-name child", async () => {
    await mod.createFolder("MoveConflictA")
    await mod.createFolder("MoveConflictDst")
    await mod.createFolder("MoveConflictA", "MoveConflictDst")
    await expect(
      mod.moveItem("MoveConflictA", "MoveConflictDst"),
    ).rejects.toThrow(/目标位置已存在同名项目/)
  })
})

// ---------------------------------------------------------------------------
// setFolderColor
// ---------------------------------------------------------------------------

describe("setFolderColor", () => {
  test("sets and reads color via file tree", async () => {
    await mod.createFolder("Clr1")
    await mod.setFolderColor("Clr1", "#123456")
    const tree = await mod.getFileTree({ fresh: true })
    const f = tree.find((n: any) => n.name === "Clr1")
    expect(f?.color).toBe("#123456")
  })

  test("clears color when empty string is passed", async () => {
    await mod.createFolder("Clr2")
    await mod.setFolderColor("Clr2", "#aabbcc")
    await mod.setFolderColor("Clr2", "")
    const tree = await mod.getFileTree({ fresh: true })
    const f = tree.find((n: any) => n.name === "Clr2")
    expect(f?.color).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// getFileTree
// ---------------------------------------------------------------------------

describe("getFileTree", () => {
  test("returns items created in earlier tests", async () => {
    const tree = await mod.getFileTree({ fresh: true })
    expect(tree.length).toBeGreaterThan(0)
    const names = tree.map((n: any) => n.name)
    expect(names).toContain("RenDst1")
  })

  test("hides internal dotfiles (.metadata.json, .order.json)", async () => {
    const tree = await mod.getFileTree({ fresh: true })
    const names = tree.map((n: any) => n.name)
    expect(names).not.toContain(".metadata.json")
    expect(names).not.toContain(".order.json")
  })
})

// ---------------------------------------------------------------------------
// reorderItems
// ---------------------------------------------------------------------------

describe("reorderItems", () => {
  test("custom ordering is reflected in file tree", async () => {
    await mod.createFolder("OrdParent")
    await mod.createFolder("Zebra", "OrdParent")
    await mod.createFolder("Apple", "OrdParent")
    await mod.createFolder("Mango", "OrdParent")

    await mod.reorderItems("OrdParent", ["Mango", "Apple", "Zebra"])

    const tree = await mod.getFileTree({ fresh: true })
    const children = tree.filter((n: any) => n.parentId === "OrdParent")
    expect(children.map((c: any) => c.name)).toEqual([
      "Mango",
      "Apple",
      "Zebra",
    ])
  })
})

// ---------------------------------------------------------------------------
// writeFileContent / readFileContent
// ---------------------------------------------------------------------------

describe("writeFileContent + readFileContent", () => {
  test("round-trips file content", async () => {
    await mod.createFile("rw.txt", "initial")
    await mod.writeFileContent("rw.txt", "updated")
    const content = await mod.readFileContent("rw.txt")
    expect(content).toBe("updated")
  })
})
