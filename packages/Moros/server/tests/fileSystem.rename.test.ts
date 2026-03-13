import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

type FileSystemModule = {
  ensureDataDir: () => Promise<void>
  createFolder: (name: string, parentPath?: string) => Promise<{ path: string; type: string }>
  renameItem: (oldPath: string, newName: string) => Promise<{ path: string; type: string }>
}

const originalCwd = process.cwd()
let testRoot = ''
let fileSystemUtils: FileSystemModule

before(async () => {
  testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'moros-fs-rename-'))
  process.chdir(testRoot)
  fileSystemUtils = (await import('../utils/fileSystem')) as FileSystemModule
  await fileSystemUtils.ensureDataDir()
})

after(async () => {
  process.chdir(originalCwd)
  if (testRoot) {
    await fs.rm(testRoot, { recursive: true, force: true })
  }
})

test('renameItem can rename folder path', { concurrency: false }, async () => {
  await fileSystemUtils.createFolder('RenameSourceA')
  const renamed = await fileSystemUtils.renameItem('RenameSourceA', 'RenameTargetA')

  assert.equal(renamed.path, 'RenameTargetA')
  assert.equal(renamed.type, 'folder')
})

test('renameItem rejects when target name already exists', { concurrency: false }, async () => {
  await fileSystemUtils.createFolder('RenameSourceB')
  await fileSystemUtils.createFolder('RenameTargetB')

  await assert.rejects(
    () => fileSystemUtils.renameItem('RenameSourceB', 'RenameTargetB'),
    /目标位置已存在同名项目/,
  )
})
