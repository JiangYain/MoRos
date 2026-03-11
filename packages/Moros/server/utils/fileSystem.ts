import fs from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { FileItem } from '../types/index.js'

// 数据存储目录
const DATA_DIR = path.join(process.cwd(), 'markov-data')
const ORDER_FILE = '.order.json'
const METADATA_FILE = '.metadata.json'
const LEGACY_WORKSPACE_CONFIG_FILE = '.moros-workspaces.json'
const GLOBAL_SETTINGS_FILE = '.moros-settings.json'
const FILE_TREE_CACHE_TTL_MS = 3000

type DirectoryMetadataEntry = {
  color?: string
  coverImagePath?: string
}

type DirectoryMetadata = Record<string, DirectoryMetadataEntry>

let fileTreeCache: { expiresAt: number; data: FileItem[] } | null = null
let fileTreeInFlight: Promise<FileItem[]> | null = null

function toRelativePath(fullPath: string): string {
  return path.relative(DATA_DIR, fullPath).replace(/\\/g, '/')
}

function invalidateFileTreeCache() {
  fileTreeCache = null
}

function resolveDataPath(targetPath: string): string {
  const fullPath = path.resolve(DATA_DIR, targetPath || '')
  if (fullPath === DATA_DIR || fullPath.startsWith(DATA_DIR + path.sep)) {
    return fullPath
  }
  throw new Error('非法路径')
}

function normalizeStoredRelativePath(inputPath: string): string {
  return String(inputPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
}

// 确保数据目录存在
export async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true })
    console.log(`📁 创建数据目录: ${DATA_DIR}`)
  }
}

// 读取目录元数据
async function readDirectoryMetadata(dirPath: string): Promise<DirectoryMetadata> {
  try {
    const metadataJson = await fs.readFile(path.join(dirPath, METADATA_FILE), 'utf-8')
    const parsed = JSON.parse(metadataJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as DirectoryMetadata
  } catch {
    return {}
  }
}

async function writeDirectoryMetadata(dirPath: string, metadata: DirectoryMetadata): Promise<void> {
  await fs.writeFile(
    path.join(dirPath, METADATA_FILE),
    JSON.stringify(metadata, null, 2),
    'utf-8',
  )
}

// 获取文件系统树
export async function getFileTree(options: { fresh?: boolean } = {}): Promise<FileItem[]> {
  await ensureDataDir()
  const fresh = Boolean(options.fresh)
  const now = Date.now()
  if (!fresh && fileTreeCache && fileTreeCache.expiresAt > now) {
    return fileTreeCache.data
  }
  if (fileTreeInFlight) {
    return await fileTreeInFlight
  }
  
  async function scanDirectory(dirPath: string, parentPath?: string): Promise<FileItem[]> {
    const items: FileItem[] = []

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      // 读取并应用顺序文件
      let order: string[] = []
      try {
        const orderJson = await fs.readFile(path.join(dirPath, ORDER_FILE), 'utf-8')
        const parsed = JSON.parse(orderJson)
        if (Array.isArray(parsed?.order)) order = parsed.order as string[]
      } catch {}

      // 读取元数据
      const metadata = await readDirectoryMetadata(dirPath)

      // 将条目映射为名称->Dirent
      const nameToEntry = new Map(entries.map((e) => [e.name, e]))
      const inOrder: Dirent[] = []
      // 优先按order排序
      for (const name of order) {
        const found = nameToEntry.get(name)
        if (found) {
          inOrder.push(found)
          nameToEntry.delete(name)
        }
      }
      // 剩余的条目：目录优先，然后字母序
      const remaining = Array.from(nameToEntry.values()).sort((a, b) => {
        const dirDiff = Number(b.isDirectory()) - Number(a.isDirectory())
        if (dirDiff !== 0) return dirDiff
        return a.name.localeCompare(b.name, 'zh-CN')
      })

      const sortedEntries = [...inOrder, ...remaining]

      const nodes = await Promise.all(sortedEntries.map(async (entry) => {
        if (
          entry.name === ORDER_FILE ||
          entry.name === METADATA_FILE ||
          entry.name === LEGACY_WORKSPACE_CONFIG_FILE ||
          entry.name === GLOBAL_SETTINGS_FILE
        ) {
          return null
        }
        const fullPath = path.join(dirPath, entry.name)
        const relativePath = toRelativePath(fullPath)

        let stats
        try {
          stats = await fs.stat(fullPath)
        } catch (error: any) {
          // 文件在 readdir 与 stat 之间被改名/删除时，直接跳过，避免整次扫描失败
          if (error?.code === 'ENOENT') return null
          throw error
        }

        const item: FileItem = {
          id: relativePath,
          name: entry.name,
          type: entry.isDirectory() ? 'folder' : 'file',
          path: relativePath,
          parentId: parentPath,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          size: entry.isFile() ? stats.size : undefined,
          color: metadata[entry.name]?.color,
          coverImagePath: metadata[entry.name]?.coverImagePath,
        }

        if (!entry.isDirectory()) {
          return { item, children: [] as FileItem[] }
        }

        const children = await scanDirectory(fullPath, relativePath)
        return { item, children }
      }))

      for (const node of nodes) {
        if (!node) continue
        items.push(node.item)
        if (node.children.length > 0) {
          items.push(...node.children)
        }
      }
    } catch (error) {
      console.error(`扫描目录失败: ${dirPath}`, error)
    }

    return items
  }
  
  fileTreeInFlight = (async () => {
    const scanned = await scanDirectory(DATA_DIR)
    fileTreeCache = {
      expiresAt: Date.now() + FILE_TREE_CACHE_TTL_MS,
      data: scanned,
    }
    return scanned
  })()

  try {
    return await fileTreeInFlight
  } finally {
    fileTreeInFlight = null
  }
}

// 创建文件夹
export async function createFolder(name: string, parentPath?: string): Promise<FileItem> {
  await ensureDataDir()
  if (path.basename(name) !== name) {
    throw new Error('非法文件夹名称')
  }

  const baseDir = resolveDataPath(parentPath || '')
  const folderPath = path.join(baseDir, name)

  await fs.mkdir(folderPath, { recursive: true })
  invalidateFileTreeCache()

  const stats = await fs.stat(folderPath)
  const relativePath = toRelativePath(folderPath)
  
  return {
    id: relativePath,
    name,
    type: 'folder',
    path: relativePath,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString()
  }
}

// 创建文件
export async function createFile(name: string, content: string = '', parentPath?: string): Promise<FileItem> {
  await ensureDataDir()
  if (path.basename(name) !== name) {
    throw new Error('非法文件名')
  }

  const baseDir = resolveDataPath(parentPath || '')
  const filePath = path.join(baseDir, name)

  // 确保父目录存在
  const parentDir = path.dirname(filePath)
  await fs.mkdir(parentDir, { recursive: true })

  await fs.writeFile(filePath, content, 'utf-8')
  invalidateFileTreeCache()

  const stats = await fs.stat(filePath)
  const relativePath = toRelativePath(filePath)
  
  return {
    id: relativePath,
    name,
    type: 'file',
    path: relativePath,
    content,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    size: stats.size
  }
}

// 读取文件内容
export async function readFileContent(filePath: string): Promise<string> {
  const fullPath = resolveDataPath(filePath)
  return await fs.readFile(fullPath, 'utf-8')
}

// 写入文件内容
export async function writeFileContent(filePath: string, content: string): Promise<void> {
  const fullPath = resolveDataPath(filePath)

  // 确保父目录存在
  const parentDir = path.dirname(fullPath)
  await fs.mkdir(parentDir, { recursive: true })

  await fs.writeFile(fullPath, content, 'utf-8')
  invalidateFileTreeCache()
}

// 删除文件或文件夹
export async function deleteItem(itemPath: string): Promise<void> {
  const fullPath = resolveDataPath(itemPath)
  let stats
  try {
    stats = await fs.stat(fullPath)
  } catch (error: any) {
    // 幂等删除：目标不存在时视为已删除
    if (error?.code === 'ENOENT') return
    throw error
  }

  if (stats.isDirectory()) {
    await fs.rm(fullPath, { recursive: true, force: true })
  } else {
    await fs.unlink(fullPath)
  }
  invalidateFileTreeCache()
}

// 重命名文件或文件夹
export async function renameItem(oldPath: string, newName: string): Promise<FileItem> {
  const oldFullPath = resolveDataPath(oldPath)
  if (path.basename(newName) !== newName) {
    throw new Error('非法名称')
  }
  const parentDir = path.dirname(oldFullPath)
  const newFullPath = path.join(parentDir, newName)

  try {
    await fs.rename(oldFullPath, newFullPath)
  } catch (error: any) {
    // 当同一次重命名被重复触发时，可能第一次已成功，第二次 oldPath 不存在
    if (error?.code !== 'ENOENT') throw error
    try {
      await fs.stat(newFullPath)
    } catch {
      throw error
    }
  }
  invalidateFileTreeCache()
  
  const stats = await fs.stat(newFullPath)
  const relativePath = toRelativePath(newFullPath)
  
  return {
    id: relativePath,
    name: newName,
    type: stats.isDirectory() ? 'folder' : 'file',
    path: relativePath,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    size: stats.isFile() ? stats.size : undefined
  }
}

// 更新目录内项目顺序
export async function reorderItems(parentPath: string | undefined, orderedNames: string[]): Promise<void> {
  await ensureDataDir()
  const dirFullPath = resolveDataPath(parentPath || '')
  // 过滤不存在的名称
  const existing = await fs.readdir(dirFullPath, { withFileTypes: true })
  const existingNames = new Set(existing.map((e) => e.name).filter((n) => n !== ORDER_FILE))
  const filtered = orderedNames.filter((n) => existingNames.has(n))
  await fs.writeFile(
    path.join(dirFullPath, ORDER_FILE),
    JSON.stringify({ order: filtered }, null, 2),
    'utf-8'
  )
  invalidateFileTreeCache()
}

// 移动文件或文件夹到新位置
export async function moveItem(sourcePath: string, targetParentPath?: string): Promise<FileItem> {
  await ensureDataDir()

  const sourceFullPath = resolveDataPath(sourcePath)
  const itemName = path.basename(sourceFullPath)

  // 目标目录
  const targetDirPath = resolveDataPath(targetParentPath || '')

  const targetFullPath = path.join(targetDirPath, itemName)

  // 确保目标目录存在
  await fs.mkdir(targetDirPath, { recursive: true })
  
  // 检查目标位置是否已存在同名文件
  try {
    await fs.access(targetFullPath)
    throw new Error(`目标位置已存在同名项目: ${itemName}`)
  } catch (error: any) {
    if (error.code !== 'ENOENT') throw error
  }
  
  // 移动文件/文件夹
  await fs.rename(sourceFullPath, targetFullPath)
  invalidateFileTreeCache()
  
  const stats = await fs.stat(targetFullPath)
  const relativePath = toRelativePath(targetFullPath)
  
  return {
    id: relativePath,
    name: itemName,
    type: stats.isDirectory() ? 'folder' : 'file',
    path: relativePath,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    size: stats.isFile() ? stats.size : undefined
  }
}

async function updateFolderMetadata(
  folderPath: string,
  updater: (entry: DirectoryMetadataEntry) => DirectoryMetadataEntry,
): Promise<void> {
  await ensureDataDir()

  const folderFullPath = resolveDataPath(folderPath)
  const folderStats = await fs.stat(folderFullPath)
  if (!folderStats.isDirectory()) {
    throw new Error('目标路径不是文件夹')
  }

  const parentDir = path.dirname(folderFullPath)
  const folderName = path.basename(folderFullPath)
  const metadata = await readDirectoryMetadata(parentDir)
  const previousEntry = metadata[folderName] || {}
  const nextEntry = updater({ ...previousEntry })

  if (Object.keys(nextEntry).length === 0) {
    delete metadata[folderName]
  } else {
    metadata[folderName] = nextEntry
  }

  await writeDirectoryMetadata(parentDir, metadata)
  invalidateFileTreeCache()
}

// 设置文件夹颜色
export async function setFolderColor(folderPath: string, color?: string): Promise<void> {
  const normalizedColor = String(color || '').trim()
  await updateFolderMetadata(folderPath, (entry) => {
    if (normalizedColor) {
      entry.color = normalizedColor
    } else {
      delete entry.color
    }
    return entry
  })
}

// 设置文件夹封面（用于 Skill 展示）
export async function setFolderCoverImage(folderPath: string, coverImagePath?: string): Promise<void> {
  const normalizedCoverPath = normalizeStoredRelativePath(String(coverImagePath || ''))

  if (normalizedCoverPath) {
    const coverFullPath = resolveDataPath(normalizedCoverPath)
    const coverStats = await fs.stat(coverFullPath)
    if (!coverStats.isFile()) {
      throw new Error('封面路径必须指向文件')
    }
  }

  await updateFolderMetadata(folderPath, (entry) => {
    if (normalizedCoverPath) {
      entry.coverImagePath = normalizedCoverPath
    } else {
      delete entry.coverImagePath
    }
    return entry
  })
}

// 在系统文件管理器中定位文件/文件夹
export async function revealInFileExplorer(itemPath: string): Promise<void> {
  await ensureDataDir()
  const fullPath = resolveDataPath(itemPath)
  const stats = await fs.stat(fullPath)
  const normalizedPath = path.normalize(fullPath)

  await new Promise<void>((resolve, reject) => {
    let command = ''
    let args: string[] = []

    if (process.platform === 'win32') {
      command = 'explorer.exe'
      args = stats.isDirectory()
        ? [normalizedPath]
        : [`/select,${normalizedPath}`]
    } else if (process.platform === 'darwin') {
      command = 'open'
      args = stats.isDirectory()
        ? [normalizedPath]
        : ['-R', normalizedPath]
    } else {
      command = 'xdg-open'
      args = [stats.isDirectory() ? normalizedPath : path.dirname(normalizedPath)]
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    })

    child.once('error', (error) => reject(error))
    child.unref()
    resolve()
  })
}

// 获取项目的绝对路径
export function getAbsoluteItemPath(itemPath: string): string {
  return resolveDataPath(itemPath)
}