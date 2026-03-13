import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs/promises'
import { 
  getFileTree, 
  createFolder, 
  createFile, 
  readFileContent, 
  writeFileContent, 
  deleteItem, 
  renameItem,
  reorderItems,
  moveItem,
  setFolderColor,
  setFolderCoverImage,
  revealInFileExplorer,
  getAbsoluteItemPath,
} from '../utils/fileSystem.js'
import {
  installSkillPreset,
  listSkillPresets,
} from '../utils/skillPresets.js'

export const filesRouter = express.Router()
const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const BASE_TAG_REGEX = /<base\s[^>]*>/i
const HEAD_OPEN_TAG_REGEX = /<head[^>]*>/i

// 上传配置（内存存储）
// 将单文件大小上限提升到 50MB，避免粘贴/拖拽大图失败
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

// 获取文件树
filesRouter.get('/', async (req, res) => {
  try {
    const fresh = ['1', 'true', 'yes'].includes(String(req.query?.fresh || '').toLowerCase())
    const files = await getFileTree({ fresh })
    res.json({ success: true, data: files })
  } catch (error) {
    console.error('获取文件树失败:', error)
    res.status(500).json({ success: false, error: '获取文件树失败' })
  }
})

// 创建文件夹
filesRouter.post('/folder', async (req, res) => {
  try {
    const { name, parentPath } = req.body
    
    if (!name) {
      return res.status(400).json({ success: false, error: '文件夹名称不能为空' })
    }
    
    const folder = await createFolder(name, parentPath)
    res.json({ success: true, data: folder })
  } catch (error) {
    console.error('创建文件夹失败:', error)
    res.status(500).json({ success: false, error: '创建文件夹失败' })
  }
})

// 创建文件
filesRouter.post('/file', async (req, res) => {
  try {
    const { name, content = '', parentPath } = req.body
    
    if (!name) {
      return res.status(400).json({ success: false, error: '文件名不能为空' })
    }
    
    // 如果未提供扩展名，默认补全为 .md；若已包含任意扩展名（例如 .excalidraw），则按原名创建
    const hasExtension = path.extname(name || '').length > 0
    const fileName = hasExtension ? name : `${name}.md`
    
    const file = await createFile(fileName, content, parentPath)
    res.json({ success: true, data: file })
  } catch (error) {
    console.error('创建文件失败:', error)
    res.status(500).json({ success: false, error: '创建文件失败' })
  }
})

// 读取文件内容
filesRouter.get('/content/:path(*)', async (req, res) => {
  try {
    const filePath = req.params.path
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: '文件路径不能为空' })
    }
    
    const content = await readFileContent(filePath)
    res.json({ success: true, data: { content } })
  } catch (error) {
    console.error('读取文件内容失败:', error)
    res.status(500).json({ success: false, error: '读取文件内容失败' })
  }
})

// 保存文件内容
filesRouter.put('/content/:path(*)', async (req, res) => {
  try {
    const filePath = req.params.path
    const { content } = req.body
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: '文件路径不能为空' })
    }
    
    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, error: '文件内容必须是字符串' })
    }
    
    await writeFileContent(filePath, content)
    res.json({ success: true, message: '文件保存成功' })
  } catch (error) {
    console.error('保存文件内容失败:', error)
    res.status(500).json({ success: false, error: '保存文件内容失败' })
  }
})

// 删除文件或文件夹
filesRouter.delete('/:path(*)', async (req, res) => {
  try {
    const itemPath = req.params.path
    
    if (!itemPath) {
      return res.status(400).json({ success: false, error: '路径不能为空' })
    }
    
    await deleteItem(itemPath)
    res.json({ success: true, message: '删除成功' })
  } catch (error) {
    console.error('删除失败:', error)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// 重命名文件或文件夹
filesRouter.put('/rename/:path(*)', async (req, res) => {
  try {
    const oldPath = req.params.path
    const { newName } = req.body
    
    if (!oldPath || !newName) {
      return res.status(400).json({ success: false, error: '路径和新名称不能为空' })
    }
    
    const updatedItem = await renameItem(oldPath, newName)
    res.json({ success: true, data: updatedItem })
  } catch (error) {
    console.error('重命名失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '重命名失败' })
  }
})

// 更新同级排序
filesRouter.post('/reorder', async (req, res) => {
  try {
    const { parentPath = '', orderedNames } = req.body || {}
    if (!Array.isArray(orderedNames)) {
      return res.status(400).json({ success: false, error: 'orderedNames 必须是字符串数组' })
    }
    await reorderItems(parentPath, orderedNames)
    res.json({ success: true })
  } catch (error) {
    console.error('更新排序失败:', error)
    res.status(500).json({ success: false, error: '更新排序失败' })
  }
})

// 移动文件/文件夹到其他位置
filesRouter.post('/move', async (req, res) => {
  try {
    const { sourcePath, targetParentPath } = req.body
    
    if (!sourcePath) {
      return res.status(400).json({ success: false, error: '源路径不能为空' })
    }
    
    const movedItem = await moveItem(sourcePath, targetParentPath)
    res.json({ success: true, data: movedItem })
  } catch (error) {
    console.error('移动失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '移动失败' })
  }
})

// 设置文件夹颜色
filesRouter.post('/folder-color', async (req, res) => {
  try {
    const { folderPath, color } = req.body
    
    if (!folderPath) {
      return res.status(400).json({ success: false, error: '文件夹路径不能为空' })
    }
    
    await setFolderColor(folderPath, color)
    res.json({ success: true, message: '文件夹颜色设置成功' })
  } catch (error) {
    console.error('设置文件夹颜色失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '设置颜色失败' })
  }
})

// 设置文件夹封面图（用于 Skill 封面）
filesRouter.post('/folder-cover', async (req, res) => {
  try {
    const { folderPath, coverImagePath } = req.body || {}

    if (!folderPath) {
      return res.status(400).json({ success: false, error: '文件夹路径不能为空' })
    }

    await setFolderCoverImage(
      String(folderPath),
      coverImagePath ? String(coverImagePath) : undefined,
    )
    res.json({ success: true, message: '文件夹封面设置成功' })
  } catch (error) {
    console.error('设置文件夹封面失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '设置封面失败' })
  }
})

// 获取内置 Skill 预设列表
filesRouter.get('/skill-presets', async (_req, res) => {
  try {
    const items = await listSkillPresets()
    res.json({ success: true, data: items })
  } catch (error) {
    console.error('获取 Skill 预设列表失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '获取 Skill 预设失败' })
  }
})

// 安装内置 Skill 预设
filesRouter.post('/skill-presets/install', async (req, res) => {
  try {
    const { skillId } = req.body || {}
    if (!skillId) {
      return res.status(400).json({ success: false, error: 'skillId 不能为空' })
    }

    const result = await installSkillPreset(String(skillId))
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('安装 Skill 预设失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '安装 Skill 预设失败' })
  }
})

// 在系统文件管理器中显示文件/文件夹
filesRouter.post('/reveal', async (req, res) => {
  try {
    const { itemPath } = req.body || {}
    if (!itemPath) {
      return res.status(400).json({ success: false, error: '路径不能为空' })
    }
    await revealInFileExplorer(itemPath)
    res.json({ success: true })
  } catch (error) {
    console.error('打开资源管理器失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '打开资源管理器失败' })
  }
})

// 获取文件/文件夹的绝对路径
filesRouter.post('/absolute-path', async (req, res) => {
  try {
    const { itemPath } = req.body || {}
    if (!itemPath) {
      return res.status(400).json({ success: false, error: '路径不能为空' })
    }
    const absolutePath = getAbsoluteItemPath(itemPath)
    res.json({ success: true, data: { path: absolutePath } })
  } catch (error) {
    console.error('解析绝对路径失败:', error)
    res.status(500).json({ success: false, error: (error as Error).message || '解析绝对路径失败' })
  }
})

// 上传文件（用于图片粘贴/插入）
// 显式捕获 Multer 错误（例如文件过大），并返回统一 JSON
filesRouter.post('/upload', (req, res) => {
  upload.single('file')(req as any, res as any, async (err: any) => {
    if (err) {
      // Multer 限制错误或其他上传错误
      const code = (err && err.code) || ''
      if (code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: '文件过大，最大 50MB' })
      }
      return res.status(400).json({ success: false, error: `上传失败: ${err.message || '未知错误'}` })
    }

    try {
      const file = (req as any).file as Express.Multer.File | undefined
      const parentPath = ((req as any).body?.parentPath || '').toString()
      const useAssetsSubdir = (((req as any).body?.useAssetsSubdir ?? 'true').toString() !== 'false')

      if (!file) {
        return res.status(400).json({ success: false, error: '未接收到文件' })
      }

      const DATA_DIR = path.join(process.cwd(), 'markov-data')
      const targetDir = useAssetsSubdir
        ? path.join(DATA_DIR, parentPath, 'assets')
        : path.join(DATA_DIR, parentPath)

      // 防御性检查：如果 parentPath 指向的是文件而非目录，mkdir 会失败
      // 先检查 parentPath 对应的完整路径是否存在且是文件
      if (parentPath) {
        const parentFullPath = path.join(DATA_DIR, parentPath)
        try {
          const stat = await fs.stat(parentFullPath)
          if (stat.isFile()) {
            return res.status(400).json({ success: false, error: '无法在文件路径下创建目录，请检查当前文件路径' })
          }
        } catch (err: any) {
          // 如果路径不存在，说明是新目录，继续
          if (err.code !== 'ENOENT') throw err
        }
      }

      await fs.mkdir(targetDir, { recursive: true })

      const originalName = (file.originalname || '').trim()
      const mime = (file.mimetype || '').toLowerCase()
      const isImageMime = /image\/(png|jpe?g|gif|webp|svg)/i.test(mime)

      let fileName: string
      if (!useAssetsSubdir && originalName && !isImageMime) {
        const safeName = path.basename(originalName).replace(/[<>:"|?*]/g, '_')
        const candidate = path.join(targetDir, safeName)
        try {
          await fs.access(candidate)
          const extPart = path.extname(safeName)
          const basePart = path.basename(safeName, extPart)
          fileName = `${basePart}_${Date.now().toString(36)}${extPart}`
        } catch {
          fileName = safeName
        }
      } else {
        const ext = mime.includes('png') ? 'png'
          : mime.includes('jpeg') ? 'jpg'
          : mime.includes('jpg') ? 'jpg'
          : mime.includes('gif') ? 'gif'
          : mime.includes('webp') ? 'webp'
          : (path.extname(originalName || '').replace('.', '') || 'bin')
        const base = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        fileName = `${base}.${ext}`
      }
      const destFullPath = path.join(targetDir, fileName)

      await fs.writeFile(destFullPath, (file as any).buffer)

      const relativePath = path.relative(DATA_DIR, destFullPath).replace(/\\/g, '/')
      // 仅返回相对路径，由前端拼接完整 URL
      return res.json({ success: true, data: { path: relativePath, name: fileName } })
    } catch (error) {
      console.error('上传文件失败:', error)
      return res.status(500).json({ success: false, error: '上传文件失败' })
    }
  })
})

// 从绝对路径目录中读取文件（用于 HTML 内的相对资源）
filesRouter.get('/raw-absolute-root/:encodedRoot/:relativePath(*)', async (req, res) => {
  try {
    const rootPath = String(req.params?.encodedRoot || '').trim()
    const relativePath = String(req.params?.relativePath || '').trim()
    if (!rootPath || !relativePath) {
      return res.status(400).json({ success: false, error: '路径参数不能为空' })
    }
    if (!ABSOLUTE_PATH_PATTERN.test(rootPath)) {
      return res.status(400).json({ success: false, error: '根路径必须是绝对路径' })
    }

    const resolvedRoot = path.resolve(rootPath)
    const targetPath = path.resolve(resolvedRoot, relativePath)
    if (!(targetPath === resolvedRoot || targetPath.startsWith(resolvedRoot + path.sep))) {
      return res.status(400).json({ success: false, error: '非法相对路径' })
    }

    const stat = await fs.stat(targetPath)
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: '目标路径不是文件' })
    }
    res.sendFile(targetPath)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: '文件不存在' })
    }
    console.error('读取绝对路径目录资源失败:', error)
    res.status(500).json({ success: false, error: '读取绝对路径目录资源失败' })
  }
})

// 读取绝对路径 HTML，并注入 base 以支持相对资源加载
filesRouter.get('/raw-absolute-html', async (req, res) => {
  try {
    const requestedPath = String(req.query?.path || '').trim()
    if (!requestedPath) {
      return res.status(400).json({ success: false, error: '绝对路径不能为空' })
    }

    const normalizedInput = requestedPath.replace(/^"(.*)"$/, '$1')
    if (!ABSOLUTE_PATH_PATTERN.test(normalizedInput)) {
      return res.status(400).json({ success: false, error: '仅支持绝对路径预览' })
    }

    const fullPath = path.resolve(normalizedInput)
    const stat = await fs.stat(fullPath)
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: '目标路径不是文件' })
    }

    const html = await fs.readFile(fullPath, 'utf-8')
    const rootDir = path.dirname(fullPath)
    const baseHref = `/api/files/raw-absolute-root/${encodeURIComponent(rootDir)}/`
    const baseTag = `<base href="${baseHref}">`
    let patchedHtml = html

    if (BASE_TAG_REGEX.test(patchedHtml)) {
      patchedHtml = patchedHtml.replace(BASE_TAG_REGEX, baseTag)
    } else if (HEAD_OPEN_TAG_REGEX.test(patchedHtml)) {
      patchedHtml = patchedHtml.replace(HEAD_OPEN_TAG_REGEX, (matched) => `${matched}\n${baseTag}`)
    } else {
      patchedHtml = `${baseTag}\n${patchedHtml}`
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(patchedHtml)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: '文件不存在' })
    }
    console.error('读取绝对路径 HTML 失败:', error)
    res.status(500).json({ success: false, error: '读取绝对路径 HTML 失败' })
  }
})

// 读取原始文件（用于图片等静态资源）
filesRouter.get('/raw-absolute', async (req, res) => {
  try {
    const requestedPath = String(req.query?.path || '').trim()
    if (!requestedPath) {
      return res.status(400).json({ success: false, error: '绝对路径不能为空' })
    }

    const normalizedInput = requestedPath.replace(/^"(.*)"$/, '$1')
    if (!ABSOLUTE_PATH_PATTERN.test(normalizedInput)) {
      return res.status(400).json({ success: false, error: '仅支持绝对路径预览' })
    }

    const fullPath = path.resolve(normalizedInput)
    const stat = await fs.stat(fullPath)
    if (!stat.isFile()) {
      return res.status(400).json({ success: false, error: '目标路径不是文件' })
    }

    res.sendFile(fullPath)
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ success: false, error: '文件不存在' })
    }
    console.error('读取绝对路径文件失败:', error)
    res.status(500).json({ success: false, error: '读取绝对路径文件失败' })
  }
})

// 读取原始文件（用于图片等静态资源）
filesRouter.get('/raw/:path(*)', async (req, res) => {
  try {
    const targetPath = req.params.path
    if (!targetPath) {
      return res.status(400).json({ success: false, error: '文件路径不能为空' })
    }
    const DATA_DIR = path.join(process.cwd(), 'markov-data')
    const fullPath = path.join(DATA_DIR, targetPath)
    res.sendFile(fullPath)
  } catch (error) {
    console.error('读取原始文件失败:', error)
    res.status(500).json({ success: false, error: '读取原始文件失败' })
  }
})