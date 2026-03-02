import fs from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'
import { FileItem } from '../types/index.js'

// 数据存储目录
const DATA_DIR = path.join(process.cwd(), 'markov-data')
const ORDER_FILE = '.order.json'
const METADATA_FILE = '.metadata.json'
const LEGACY_WORKSPACE_CONFIG_FILE = '.moros-workspaces.json'

function resolveDataPath(targetPath: string): string {
  const fullPath = path.resolve(DATA_DIR, targetPath || '')
  if (fullPath === DATA_DIR || fullPath.startsWith(DATA_DIR + path.sep)) {
    return fullPath
  }
  throw new Error('非法路径')
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

// 生成唯一 ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// 读取目录元数据
async function readDirectoryMetadata(dirPath: string): Promise<{ [key: string]: any }> {
  try {
    const metadataJson = await fs.readFile(path.join(dirPath, METADATA_FILE), 'utf-8')
    return JSON.parse(metadataJson)
  } catch {
    return {}
  }
}

// 获取文件系统树
export async function getFileTree(): Promise<FileItem[]> {
  await ensureDataDir()
  
  async function scanDirectory(dirPath: string, parentId?: string): Promise<FileItem[]> {
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

      for (const entry of sortedEntries) {
        if (entry.name === ORDER_FILE || entry.name === METADATA_FILE || entry.name === LEGACY_WORKSPACE_CONFIG_FILE) continue
        const fullPath = path.join(dirPath, entry.name)
        const relativePath = path.relative(DATA_DIR, fullPath)
        const stats = await fs.stat(fullPath)

        const item: FileItem = {
          id: generateId(),
          name: entry.name,
          type: entry.isDirectory() ? 'folder' : 'file',
          path: relativePath,
          parentId,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
          size: entry.isFile() ? stats.size : undefined,
          color: entry.isDirectory() ? metadata[entry.name]?.color : undefined
        }

        items.push(item)

        // 递归扫描子目录
        if (entry.isDirectory()) {
          const children = await scanDirectory(fullPath, item.id)
          items.push(...children)
        }
      }
    } catch (error) {
      console.error(`扫描目录失败: ${dirPath}`, error)
    }

    return items
  }
  
  return await scanDirectory(DATA_DIR)
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

  const stats = await fs.stat(folderPath)
  const relativePath = path.relative(DATA_DIR, folderPath)
  
  return {
    id: generateId(),
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

  const stats = await fs.stat(filePath)
  const relativePath = path.relative(DATA_DIR, filePath)
  
  return {
    id: generateId(),
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
}

// 删除文件或文件夹
export async function deleteItem(itemPath: string): Promise<void> {
  const fullPath = resolveDataPath(itemPath)
  const stats = await fs.stat(fullPath)

  if (stats.isDirectory()) {
    await fs.rm(fullPath, { recursive: true, force: true })
  } else {
    await fs.unlink(fullPath)
  }
}

// 重命名文件或文件夹
export async function renameItem(oldPath: string, newName: string): Promise<FileItem> {
  const oldFullPath = resolveDataPath(oldPath)
  if (path.basename(newName) !== newName) {
    throw new Error('非法名称')
  }
  const parentDir = path.dirname(oldFullPath)
  const newFullPath = path.join(parentDir, newName)

  await fs.rename(oldFullPath, newFullPath)
  
  const stats = await fs.stat(newFullPath)
  const relativePath = path.relative(DATA_DIR, newFullPath)
  
  return {
    id: generateId(),
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
  
  const stats = await fs.stat(targetFullPath)
  const relativePath = path.relative(DATA_DIR, targetFullPath)
  
  return {
    id: generateId(),
    name: itemName,
    type: stats.isDirectory() ? 'folder' : 'file',
    path: relativePath,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    size: stats.isFile() ? stats.size : undefined
  }
}

// 设置文件夹颜色
export async function setFolderColor(folderPath: string, color?: string): Promise<void> {
  await ensureDataDir()

  const folderFullPath = resolveDataPath(folderPath)
  const parentDir = path.dirname(folderFullPath)
  const folderName = path.basename(folderFullPath)
  
  // 读取父目录的元数据
  const metadata = await readDirectoryMetadata(parentDir)
  
  // 设置或删除颜色
  if (!metadata[folderName]) {
    metadata[folderName] = {}
  }
  
  if (color) {
    metadata[folderName].color = color
  } else {
    delete metadata[folderName].color
    // 如果对象为空，删除整个条目
    if (Object.keys(metadata[folderName]).length === 0) {
      delete metadata[folderName]
    }
  }
  
  // 写入元数据文件
  await fs.writeFile(
    path.join(parentDir, METADATA_FILE),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  )
}