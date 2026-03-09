import React, { useState, useEffect, useMemo } from 'react'
import { 
  Search, ChevronLeft, ChevronRight, Sun, Moon, ChevronDown,
  Folder, FileText, Plus, MoreHorizontal, Trash2, User
} from 'lucide-react'
import { filesApi, knowledgeApi } from '../utils/api'
import { useI18n } from '../utils/i18n'
import { getActiveChatModel, getActiveChatProvider } from '../utils/chatProvider'
import {
  getOpenedChatPaths,
  isEmptyMorosChatContent,
  isMorosChatPath,
  markChatFileOpened,
  unmarkChatFileOpened,
} from '../utils/chatFiles'
import HoverPreview from './HoverPreview'
import MorosShapeIcon from './MorosShapeIcon'
import CreateActionsMenu from './sidebar/CreateActionsMenu'
import FileTreeItem from './sidebar/FileTreeItem'
import SidebarContextMenu from './sidebar/SidebarContextMenu'
import './Sidebar.css'

const DELETE_CONFIRM_SUPPRESS_KEY = 'moros-delete-confirm-suppressed'
const MULTI_SELECT_CLICK_GUARD_MS = 360
const FILE_TREE_SESSION_CACHE_KEY = 'moros-sidebar-file-tree-cache-v1'

function Sidebar({ 
  collapsed, 
  onToggleCollapse, 
  darkMode, 
  onToggleDarkMode, 
  searchTerm, 
  onSearchChange,
  onFileClick,
  currentFile,
  language,
  onLanguageChange,
  avatar,
  onAvatarChange,
  username,
  onOpenSettings,
  hoverPreview,
  showFileExtensions,
  onGoHome,
  onSkillPathsChange,
  sidebarRef,
}) {
  const [fileTree, setFileTree] = useState(() => {
    try {
      const cached = sessionStorage.getItem(FILE_TREE_SESSION_CACHE_KEY)
      const parsed = cached ? JSON.parse(cached) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => fileTree.length === 0)
  const [contextMenu, setContextMenu] = useState(null)
  const [creatingItem, setCreatingItem] = useState(null) // { type: 'file'|'folder', parentPath: string }
  const [highlightPath, setHighlightPath] = useState('')
  const [dragOverItem, setDragOverItem] = useState(null)
  // 'before' | 'after' | 'inside' | null
  const [dragOverPosition, setDragOverPosition] = useState(null)
  const [isDragging, setIsDragging] = useState(null)
  const dragHoverRef = React.useRef({ itemPath: null, position: null })
  const [searchResults, setSearchResults] = useState([])
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(null) // { item, x, y }
  const fileTreeRef = React.useRef(null)
  const loadFileTreeRef = React.useRef(null)
  const initialFileTreeLoadedRef = React.useRef(fileTree.length > 0)
  const hasCachedTreeOnInitRef = React.useRef(fileTree.length > 0)
  const [hoverPreviewFile, setHoverPreviewFile] = useState(null)
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState({ top: 0, left: 0 })
  // 计时器使用 ref，避免闭包导致取消失败
  const hoverTimeoutRef = React.useRef(null)
  // 管理展开的文件夹路径
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [skillsCollapsed, setSkillsCollapsed] = useState(false)
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false)
  const [filesCollapsed, setFilesCollapsed] = useState(false)
  const [foldersCollapsed, setFoldersCollapsed] = useState(false)
  const [createMenu, setCreateMenu] = useState(null) // 用于显示创建菜单 { x, y, type: 'new-actions', parentPath }
  const contextMenuRef = React.useRef(null)
  const createMenuRef = React.useRef(null)
  const colorPickerRef = React.useRef(null)
  const { t } = useI18n()
  const legacyMigrationAttemptedRef = React.useRef(false)
  // 多选：模式与选中集合
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState(new Set())
  const multiSelectEnteredAtRef = React.useRef(0)

  // 文件夹切换功能
  const handleToggleFolder = (folderPath) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath)
      } else {
        newSet.add(folderPath)
      }
      return newSet
    })
  }

  // 切换碎片文件区域的折叠状态
  const handleToggleFiles = () => {
    setFilesCollapsed(prev => !prev)
  }

  // 切换文件夹区域的折叠状态
  const handleToggleFolders = () => {
    setFoldersCollapsed(prev => !prev)
  }

  // Skills 总开关
  const handleToggleSkills = () => {
    setSkillsCollapsed(prev => !prev)
  }

  // WorkSpace 总开关
  const handleToggleWorkspace = () => {
    setWorkspaceCollapsed(prev => !prev)
  }

  const workspaceStorageKey = 'moros-workspace-paths'
  const FIXED_SKILLS_ROOT = 'skills'
  const legacyWorkspaceConfigFile = '.moros-workspaces.json'
  const wsPathsCacheRef = React.useRef(null)
  const workspaceConfigLoadedRef = React.useRef(false)
  const [workspacePathsState, setWorkspacePathsState] = useState([])
  const [skillPathsState, setSkillPathsState] = useState([FIXED_SKILLS_ROOT])

  const getWorkspacePaths = () => {
    return wsPathsCacheRef.current || workspacePathsState
  }

  const getSkillPaths = () => {
    return skillPathsState.length > 0 ? skillPathsState : [FIXED_SKILLS_ROOT]
  }

  const normalizeWorkspacePaths = (paths) => {
    if (!Array.isArray(paths)) return []
    return Array.from(
      new Set(
        paths
          .filter((p) => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.replace(/\\/g, '/').trim())
      )
    )
  }

  const parseWorkspaceConfig = (parsed) => {
    if (Array.isArray(parsed)) return normalizeWorkspacePaths(parsed)
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.paths)) return normalizeWorkspacePaths(parsed.paths)
      if (Array.isArray(parsed.workspaces)) return normalizeWorkspacePaths(parsed.workspaces)
    }
    return []
  }

  const persistWorkspaceConfig = async (paths) => {
    try {
      await filesApi.saveFile(legacyWorkspaceConfigFile, JSON.stringify(paths, null, 2))
    } catch (error) {
      console.warn('保存 WorkSpace 配置失败:', error)
    }
  }

  const loadWorkspacePaths = async (options = {}) => {
    const { force = false } = options
    if (workspaceConfigLoadedRef.current && !force) {
      return wsPathsCacheRef.current || []
    }

    let resolved = null
    try {
      const fileContent = await filesApi.readFile(legacyWorkspaceConfigFile)
      const parsed = fileContent ? JSON.parse(fileContent) : []
      resolved = parseWorkspaceConfig(parsed)
    } catch {
      resolved = null
    }

    if (resolved === null) {
      try {
        const local = localStorage.getItem(workspaceStorageKey)
        if (local) {
          resolved = parseWorkspaceConfig(JSON.parse(local))
        }
      } catch {
        resolved = []
      }
      if (resolved.length > 0) {
        await persistWorkspaceConfig(resolved)
      }
    }

    if (!resolved) {
      resolved = []
    }

    wsPathsCacheRef.current = resolved
    setWorkspacePathsState(resolved)
    workspaceConfigLoadedRef.current = true
    try { localStorage.setItem(workspaceStorageKey, JSON.stringify(resolved)) } catch {}

    return resolved
  }

  const skillFolderEnsuredRef = React.useRef(false)
  const loadSkillPaths = async () => {
    if (!skillFolderEnsuredRef.current) {
      skillFolderEnsuredRef.current = true
      try {
        await filesApi.createFolder(FIXED_SKILLS_ROOT)
      } catch {
        // ignore fixed skill folder creation errors
      }
    }
    const fixedPaths = [FIXED_SKILLS_ROOT]
    setSkillPathsState(fixedPaths)
    onSkillPathsChange?.(fixedPaths)
    return fixedPaths
  }

  const saveWorkspacePaths = async (paths) => {
    const normalized = normalizeWorkspacePaths(paths)
    wsPathsCacheRef.current = normalized
    setWorkspacePathsState(normalized)
    workspaceConfigLoadedRef.current = true
    try { localStorage.setItem(workspaceStorageKey, JSON.stringify(normalized)) } catch {}
    await persistWorkspaceConfig(normalized)
  }

  const addWorkspacePath = async (p) => {
    const cur = getWorkspacePaths()
    if (!cur.includes(p)) {
      await saveWorkspacePaths([...cur, p])
    }
  }

  const removeWorkspacePath = async (p) => {
    await saveWorkspacePaths(getWorkspacePaths().filter(x => x !== p))
  }

  const [filesManuallyOrdered, setFilesManuallyOrdered] = useState(() => {
    return localStorage.getItem('moros-files-manually-ordered') === 'true'
  })

  const markFilesManuallyOrdered = () => {
    setFilesManuallyOrdered(true)
    try { localStorage.setItem('moros-files-manually-ordered', 'true') } catch {}
  }

  const separatedItems = useMemo(() => {
    const wsPaths = getWorkspacePaths()
    const skillPaths = getSkillPaths()
    const skills = []
    const workspaces = []
    const folders = []
    const files = []
    
    fileTree.forEach(item => {
      if (item.type === 'folder' && skillPaths.includes(item.path)) {
        skills.push(item)
      } else if (item.type === 'folder' && wsPaths.includes(item.path)) {
        workspaces.push(item)
      } else if (item.type === 'folder') {
        folders.push(item)
      } else {
        files.push(item)
      }
    })
    
    if (!filesManuallyOrdered) {
      files.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime()
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime()
        return timeB - timeA
      })
    }
    
    return { skills, workspaces, folders, files }
  }, [fileTree, filesManuallyOrdered, workspacePathsState, skillPathsState])

  // 折叠模式下，只显示当前文件所在 Folder/WorkSpace 的内容
  const collapsedViewItems = useMemo(() => {
    if (!collapsed || !currentFile?.path) return null
    const ap = currentFile.path
    for (const s of separatedItems.skills) {
      if (ap === s.path || ap.startsWith(s.path + '/')) return s.children || []
    }
    for (const w of separatedItems.workspaces) {
      if (ap === w.path || ap.startsWith(w.path + '/')) return w.children || []
    }
    for (const f of separatedItems.folders) {
      if (ap === f.path || ap.startsWith(f.path + '/')) return f.children || []
    }
    return separatedItems.files
  }, [collapsed, currentFile, separatedItems])

  // 去重后的搜索结果：同一文件 + 相同片段 仅显示一次
  const uniqueSearchResults = useMemo(() => {
    const map = new Map()
    for (const r of searchResults) {
      const key = `${r.path}__${(r.snippet || '').trim().replace(/\s+/g, ' ')}`
      if (!map.has(key)) map.set(key, r)
    }
    return Array.from(map.values())
  }, [searchResults])

  // 悬浮预览处理函数 - 稳定版本
  const handleHoverStart = (event, item) => {
    if (!hoverPreview || item.type !== 'file' || !item.name.toLowerCase().endsWith('.md')) {
      return
    }

    // 清除所有定时器（使用 ref）
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    // 立即显示预览，无延迟
    const targetEl = event.currentTarget
    const sidebarEl = targetEl ? targetEl.closest('.sidebar') : null
    
    if (!targetEl || !sidebarEl) return

    const rect = targetEl.getBoundingClientRect()
    const sidebarRect = sidebarEl.getBoundingClientRect()
    
    setHoverPreviewPosition({
      top: rect.top,
      left: sidebarRect.right + 12
    })
    setHoverPreviewFile(item)
  }

  const handleHoverEnd = () => {
    // 先清除旧计时器
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }

    const closeTimeout = setTimeout(() => {
      setHoverPreviewFile(null)
      setHoverPreviewPosition(null)
    }, 900) // 延长到 900ms，避免预览一闪而过

    hoverTimeoutRef.current = closeTimeout
  }

  // 全局取消函数只注册一次，始终读取最新的 ref
  React.useEffect(() => {
    window.sidebarCancelClose = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }

    }
    return () => {
      delete window.sidebarCancelClose
    }
  }, [])

  const handlePreviewClose = () => {
    setHoverPreviewFile(null)
    setHoverPreviewPosition(null)
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }

  // 进入多选模式并选择当前项
  const enterMultiSelect = (item) => {
    multiSelectEnteredAtRef.current = Date.now()
    setMultiSelectMode(true)
    setSelectedPaths(prev => new Set(prev).add(item.path))
  }
  const toggleSelect = (item) => {
    setSelectedPaths(prev => {
      const n = new Set(prev)
      if (n.has(item.path)) n.delete(item.path); else n.add(item.path)
      return n
    })
  }
  const clearMultiSelect = () => {
    setMultiSelectMode(false)
    setSelectedPaths(new Set())
  }

  // 处理用户配置区域的点击动画
  const handleUserProfileClick = (e) => {
    const userProfile = e.currentTarget
    const rect = userProfile.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // 创建涟漪效果
    const ripple = document.createElement('span')
    ripple.style.position = 'absolute'
    ripple.style.width = '0'
    ripple.style.height = '0'
    ripple.style.borderRadius = '50%'
    ripple.style.background = 'radial-gradient(circle, rgba(var(--accent-color-rgb, 26, 26, 26), 0.3) 0%, transparent 70%)'
    ripple.style.transform = 'translate(-50%, -50%)'
    ripple.style.left = x + 'px'
    ripple.style.top = y + 'px'
    ripple.style.pointerEvents = 'none'
    ripple.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    ripple.style.opacity = '0'
    ripple.style.zIndex = '1'
    
    userProfile.appendChild(ripple)
    
    // 立即触发动画
    requestAnimationFrame(() => {
      ripple.style.width = '80px'
      ripple.style.height = '80px'
      ripple.style.opacity = '1'
    })
    
    // 快速清理动画元素
    setTimeout(() => {
      ripple.style.width = '100px'
      ripple.style.height = '100px'
      ripple.style.opacity = '0'
      
      setTimeout(() => {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple)
        }
      }, 200)
    }, 250)
    
    // 触发原有的点击事件
    onOpenSettings?.()
  }

  const chatCleanupDoneRef = React.useRef(false)

  const buildTree = (files) => {
    const fileMap = new Map()
    const rootFiles = []
    files.forEach(file => {
      fileMap.set(file.id, { ...file, children: [] })
    })
    files.forEach(file => {
      const fileItem = fileMap.get(file.id)
      if (file.parentId) {
        const parent = fileMap.get(file.parentId)
        if (parent) {
          parent.children.push(fileItem)
        }
      } else {
        rootFiles.push(fileItem)
      }
    })
    return rootFiles
  }

  const persistFileTreeSnapshot = (nextTree) => {
    setTimeout(() => {
      try {
        const serialized = JSON.stringify(nextTree)
        // 避免超大树写入 sessionStorage 反而拖慢主线程
        if (serialized.length > 2_000_000) return
        sessionStorage.setItem(FILE_TREE_SESSION_CACHE_KEY, serialized)
      } catch {}
    }, 0)
  }

  const applyFileTree = (nextTree) => {
    setFileTree(nextTree)
    persistFileTreeSnapshot(nextTree)
  }

  // 加载文件树
  const loadFileTree = async (options = {}) => {
    const {
      showLoading = !initialFileTreeLoadedRef.current,
      preserveScroll = true,
      fresh = false,
    } = options
    const previousScrollTop = preserveScroll ? fileTreeRef.current?.scrollTop ?? null : null
    try {
      if (showLoading) {
        setLoading(true)
      }
      let files = await filesApi.getFileTree({ fresh })

      // 一次性迁移旧版 .markovchat 后缀为 .MoRos
      if (!legacyMigrationAttemptedRef.current) {
        legacyMigrationAttemptedRef.current = true
        const legacyChatFiles = files.filter((file) => file.type === 'file' && /\.markovchat$/i.test(file.name || ''))
        if (legacyChatFiles.length > 0) {
          for (const file of legacyChatFiles) {
            const newName = String(file.name || '').replace(/\.markovchat$/i, '.MoRos')
            try {
              await filesApi.renameItem(file.path, newName)
            } catch (error) {
              console.warn(`迁移文件失败: ${file.path}`, error)
            }
          }
          files = await filesApi.getFileTree({ fresh: true })
        }
      }

      applyFileTree(buildTree(files))
      if (typeof previousScrollTop === 'number') {
        requestAnimationFrame(() => {
          if (fileTreeRef.current) {
            fileTreeRef.current.scrollTop = previousScrollTop
          }
        })
      }

      // 自动清理空 .MoRos 文件（后台执行，只做一次，不阻塞UI）
      if (!chatCleanupDoneRef.current) {
        chatCleanupDoneRef.current = true
        const filesToClean = files
        ;(async () => {
          try {
            const openedChatPaths = new Set(getOpenedChatPaths())
            if (isMorosChatPath(currentFile?.path)) {
              openedChatPaths.add(currentFile.path)
            }
            const unopenedChatFiles = filesToClean.filter((file) => {
              if (file.type !== 'file') return false
              if (!isMorosChatPath(file.path || file.name)) return false
              return !openedChatPaths.has(file.path)
            })
            if (unopenedChatFiles.length > 0) {
              let removedAny = false
              for (const file of unopenedChatFiles) {
                try {
                  const content = await filesApi.readFile(file.path)
                  if (!isEmptyMorosChatContent(content)) continue
                  await filesApi.deleteItem(file.path)
                  unmarkChatFileOpened(file.path)
                  removedAny = true
                } catch (error) {
                  console.warn('自动清理空对话失败:', file.path, error)
                }
              }
              if (removedAny) {
                const freshFiles = await filesApi.getFileTree({ fresh: true })
                applyFileTree(buildTree(freshFiles))
              }
            }
          } catch (error) {
            console.warn('自动清理空对话时出错:', error)
          }
        })()
      }
    } catch (error) {
      console.error('加载文件树失败:', error)
    } finally {
      initialFileTreeLoadedRef.current = true
      if (showLoading) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadFileTreeRef.current = loadFileTree
  }, [loadFileTree])

  useEffect(() => {
    const handleFileTreeRefreshRequest = () => {
      void loadFileTreeRef.current?.({
        showLoading: false,
        preserveScroll: true,
        fresh: true,
      })
    }
    window.addEventListener('moros:file-tree-refresh-request', handleFileTreeRefreshRequest)
    return () => {
      window.removeEventListener('moros:file-tree-refresh-request', handleFileTreeRefreshRequest)
    }
  }, [])

  useEffect(() => {
    void loadWorkspacePaths()
    void loadSkillPaths()
    void loadFileTree({ showLoading: !hasCachedTreeOnInitRef.current, preserveScroll: false })
  }, [])

  React.useImperativeHandle(sidebarRef, () => ({
    reloadFileTree: loadFileTree,
  }))

  // 折叠时关闭搜索面板
  useEffect(() => {
    if (collapsed) setShowSearchPanel(false)
  }, [collapsed])

  // 开始创建文件夹（内联模式）
  const handleCreateFolder = async (parentPath) => {
    setCreatingItem({ type: 'folder', parentPath })
    // 如果在文件夹内创建，自动展开该文件夹
    if (parentPath) {
      ensureFolderExpanded(parentPath)
    }
  }

  // 开始创建文件（内联模式）
  const handleCreateFile = async (parentPath) => {
    setCreatingItem({ type: 'file', parentPath })
    // 如果在文件夹内创建，自动展开该文件夹
    if (parentPath) {
      ensureFolderExpanded(parentPath)
    }
  }

  // 开始创建 WorkSpace（本质为根目录文件夹）
  const handleCreateWorkspace = () => {
    setCreatingItem({ type: 'workspace', parentPath: undefined })
    if (workspaceCollapsed) {
      setWorkspaceCollapsed(false)
    }
  }

  // 开始创建 Skills 目录（本质为根目录文件夹）
  const handleCreateSkillFolder = () => {
    setCreatingItem({ type: 'skill', parentPath: FIXED_SKILLS_ROOT })
    if (skillsCollapsed) {
      setSkillsCollapsed(false)
    }
  }

  // 开始创建白板（直接创建 .excalidraw 文件并打开）
  const handleCreateWhiteboard = async (parentPath) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const baseName = `白板-${timestamp}.excalidraw`
      const initialContent = JSON.stringify({ 
        type: 'excalidraw', 
        version: 2, 
        source: 'moros', 
        elements: [], 
        appState: { 
          collaborators: [],
          gridSize: null,
          viewBackgroundColor: '#ffffff'
        }, 
        files: {} 
      }, null, 2)
      const file = await filesApi.createFile(baseName, initialContent, parentPath)
      onFileClick?.(file)
      void loadFileTree({ showLoading: false })
    } catch (error) {
      alert('创建白板失败: ' + error.message)
    } finally {
      setContextMenu(null)
    }
  }

  // 创建对话（直接创建 .MoRos 文件并打开）
  const handleCreateChat = async (parentPath) => {
    try {
      const now = new Date()
      const pad = (value) => String(value).padStart(2, '0')
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`
      const baseName = `${timestamp}.MoRos`
      const provider = getActiveChatProvider()
      const model = getActiveChatModel()
      const initialContent = JSON.stringify({ 
        type: 'moroschat', 
        version: 1, 
        provider,
        model,
        conversationId: '',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, null, 2)
      const file = await filesApi.createFile(baseName, initialContent, parentPath)
      markChatFileOpened(file?.path)
      onFileClick?.(file)
      void loadFileTree({ showLoading: false })
    } catch (error) {
      alert('创建对话失败: ' + error.message)
    } finally {
      setContextMenu(null)
    }
  }

  // 确保文件夹展开
  const ensureFolderExpanded = (folderPath) => {
    if (!folderPath) return
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (!newSet.has(folderPath)) {
        newSet.add(folderPath)
      }
      return newSet
    })
  }

  // 完成创建项目
  const handleFinishCreating = async (name) => {
    if (!creatingItem || !name?.trim()) {
      setCreatingItem(null)
      return
    }

    try {
      if (creatingItem.type === 'folder' || creatingItem.type === 'workspace' || creatingItem.type === 'skill') {
        const created = await filesApi.createFolder(name.trim(), creatingItem.parentPath)
        const createdPath = created?.path || name.trim()
        if (creatingItem.type === 'workspace') {
          await addWorkspacePath(createdPath)
        }
      } else {
        await filesApi.createFile(name.trim(), '', creatingItem.parentPath)
      }
      await loadFileTree()
      setCreatingItem(null)
    } catch (error) {
      const kind = creatingItem.type === 'file' ? '文件' : '文件夹'
      alert(`创建${kind}失败: ${error.message}`)
      setCreatingItem(null)
    }
  }

  // 查找父级children与索引
  const findParentAndIndex = (items, targetPath, parentPath = '') => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.path === targetPath) {
        return { children: items, index: i, parentPath }
      }
      if (it.children && it.children.length) {
        const res = findParentAndIndex(it.children, targetPath, it.path)
        if (res) return res
      }
    }
    return null
  }

  const resolveDropPosition = (e, item) => {
    const el = e.currentTarget
    if (!el) return item.type === 'folder' ? 'inside' : 'after'
    const bounds = el.getBoundingClientRect()
    if (item.type === 'folder') {
      const topZone = bounds.top + bounds.height * 0.25
      const bottomZone = bounds.bottom - bounds.height * 0.25
      if (e.clientY < topZone) return 'before'
      if (e.clientY > bottomZone) return 'after'
      return 'inside'
    }
    const mid = bounds.top + bounds.height / 2
    return e.clientY < mid ? 'before' : 'after'
  }

  // 拖拽开始
  const handleDragStart = (e, item) => {
    setIsDragging(item.path)
    dragHoverRef.current = { itemPath: null, position: null }

    // 如果在多选模式下且当前项已选中，则拖拽所有选中项
    const itemsToDrag = multiSelectMode && selectedPaths.has(item.path)
      ? Array.from(selectedPaths)
      : [item.path]

    // 为md文件添加特殊的拖拽数据
    const dragData = {
      ...item,
      isMarkdownFile: item.type === 'file' && item.name.toLowerCase().endsWith('.md'),
      // 添加多选信息
      isMultiSelect: itemsToDrag.length > 1,
      selectedPaths: itemsToDrag
    }

    e.dataTransfer.setData('text/plain', JSON.stringify(dragData))

    // 如果是md文件，允许拖拽到画板
    if (dragData.isMarkdownFile) {
      e.dataTransfer.setData('application/markdown-file', JSON.stringify(dragData))
      e.dataTransfer.effectAllowed = 'copyMove'
    } else {
      e.dataTransfer.effectAllowed = 'move'
    }

    e.dataTransfer.dropEffect = 'move'
  }

  // 拖拽结束（兜底清理）
  const handleDragEnd = () => {
    setIsDragging(null)
    setDragOverItem(null)
    setDragOverPosition(null)
    dragHoverRef.current = { itemPath: null, position: null }
  }

  // 拖拽经过
  const handleDragOver = (e, item) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const position = resolveDropPosition(e, item)
    setDragOverItem(item.path)
    setDragOverPosition(position)
    dragHoverRef.current = { itemPath: item.path, position }
  }

  // 拖拽离开
  const handleDragLeave = (e) => {
    // 只有当离开当前元素且不是进入子元素时才清除状态
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverItem(null)
      setDragOverPosition(null)
      dragHoverRef.current = { itemPath: null, position: null }
    }
  }

  // 拖拽放下
  const handleDrop = async (e, targetItem) => {
    e.preventDefault()
    e.stopPropagation()

    const refPosition = dragHoverRef.current.itemPath === targetItem.path
      ? dragHoverRef.current.position
      : null
    const dropPosition = refPosition || resolveDropPosition(e, targetItem)

    setDragOverItem(null)
    setDragOverPosition(null)
    setIsDragging(null)
    dragHoverRef.current = { itemPath: null, position: null }

    try {
      const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (draggedData.path === targetItem.path) return // 同一项目

      // 如果是多选拖拽
      const isMultiSelect = draggedData.isMultiSelect && draggedData.selectedPaths
      const pathsToMove = isMultiSelect ? draggedData.selectedPaths : [draggedData.path]

      // 如果目标是文件夹并且命中"内部"区域，移动到文件夹内
      if (targetItem.type === 'folder' && dropPosition === 'inside') {
        // 检查是否尝试将文件夹移动到自己的子目录中（防止循环）
        for (const path of pathsToMove) {
          if (targetItem.path.startsWith(path + '/')) {
            alert('不能将文件夹移动到自己的子目录中')
            return
          }
        }

        // 移动所有选中项到文件夹内
        for (const path of pathsToMove) {
          await filesApi.moveItem(path, targetItem.path)
        }
        await loadFileTree()

        // 如果是多选,清除多选状态
        if (isMultiSelect) {
          clearMultiSelect()
        }

        setHighlightPath(targetItem.path)
        setTimeout(() => setHighlightPath(''), 800)
        return
      }

      // 检查是否跨级移动（不同父目录）
      const cloned = JSON.parse(JSON.stringify(fileTree))
      const draggedInfo = findParentAndIndex(cloned, draggedData.path, '')
      const targetInfo = findParentAndIndex(cloned, targetItem.path, '')

      if (!draggedInfo || !targetInfo) return

      // 如果是跨级拖拽，先移动到目标项的父级目录，再在该父级内插入到 before/after 位置
      if (draggedInfo.parentPath !== targetInfo.parentPath) {
        await filesApi.moveItem(draggedData.path, targetInfo.parentPath || undefined)

        // 基于当前（移动前）目标父级的子项顺序，插入被移动项名称以形成新的 orderedNames
        const targetSiblings = targetInfo.children
        let insertIndex = targetInfo.index
        if (dropPosition === 'after') insertIndex = Math.min(insertIndex + 1, targetSiblings.length)
        const orderedNames = targetSiblings.map((c) => c.name)
        // 如果目标父级中尚不存在该名称，则按期望位置插入
        if (!orderedNames.includes(draggedData.name)) {
          orderedNames.splice(insertIndex, 0, draggedData.name)
        }
        await filesApi.reorder(targetInfo.parentPath, orderedNames)

        await loadFileTree()
        const newPath = targetInfo.parentPath
          ? (targetInfo.parentPath + '/' + draggedData.name)
          : draggedData.name
        setHighlightPath(newPath)
        setTimeout(() => setHighlightPath(''), 800)
        return
      }

      // 同级排序逻辑
      const { children, index: draggedIndex } = draggedInfo
      let { index: targetIndex } = targetInfo

      // 移除拖拽项
      const [draggedItem] = children.splice(draggedIndex, 1)
      // 在目标前/后插入
      if (dropPosition === 'after' && targetIndex < children.length) {
        targetIndex += 1
      }
      children.splice(targetIndex, 0, draggedItem)

      // 发送到后端持久化
      const orderedNames = children.map((c) => c.name)
      await filesApi.reorder(draggedInfo.parentPath, orderedNames)

      if (!draggedInfo.parentPath) {
        markFilesManuallyOrdered()
      }

      setFileTree(cloned)
      setHighlightPath(draggedData.path)
      setTimeout(() => setHighlightPath(''), 800)
    } catch (error) {
      console.error('拖拽操作失败:', error)
      alert('拖拽操作失败: ' + error.message)
    }
  }

  // 取消创建
  const handleCancelCreating = () => {
    setCreatingItem(null)
  }

  // 重命名项目
  const handleRenameItem = (item) => {
    // 找到对应的文件项并设置为编辑状态
    const findAndSetEditing = (items) => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === item.id) {
          items[i].isEditing = true
          break
        }
        if (items[i].children) {
          findAndSetEditing(items[i].children)
        }
      }
    }
    
    setFileTree(prevTree => {
      const newTree = JSON.parse(JSON.stringify(prevTree))
      findAndSetEditing(newTree)
      return newTree
    })
  }

  // 自定义删除确认模态
  const [deleteConfirmSuppressed, setDeleteConfirmSuppressed] = useState(() => {
    try {
      return localStorage.getItem(DELETE_CONFIRM_SUPPRESS_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [deleteConfirm, setDeleteConfirm] = useState({ visible: false, item: null })
  
  // 已移除设置模态，改为跳转到设置页面

  const persistDeleteConfirmPreference = (suppressed) => {
    setDeleteConfirmSuppressed(suppressed)
    try {
      localStorage.setItem(DELETE_CONFIRM_SUPPRESS_KEY, suppressed ? 'true' : 'false')
    } catch {}
  }

  const removePathsFromTree = (pathsToRemove) => {
    const pathSet = new Set(pathsToRemove)
    const filterTree = (items) =>
      items
        .filter((it) => !pathSet.has(it.path))
        .map((it) => (it.children ? { ...it, children: filterTree(it.children) } : it))
    setFileTree((prev) => {
      const nextTree = filterTree(prev)
      persistFileTreeSnapshot(nextTree)
      return nextTree
    })
  }

  const performDelete = async (item) => {
    if (!item) return
    const pathsToRemove = item.isMultiple && item.paths ? item.paths : [item.path]
    removePathsFromTree(pathsToRemove)

    const currentWorkspacePaths = getWorkspacePaths()
    const nextWorkspacePaths = currentWorkspacePaths.filter((workspacePath) => {
      return !pathsToRemove.some((removedPath) => {
        return workspacePath === removedPath || workspacePath.startsWith(`${removedPath}/`)
      })
    })
    if (nextWorkspacePaths.length !== currentWorkspacePaths.length) {
      await saveWorkspacePaths(nextWorkspacePaths)
    }

    if (item.isMultiple && item.paths) {
      for (const p of item.paths) {
        await filesApi.deleteItem(p)
        unmarkChatFileOpened(p)
      }
      clearMultiSelect()
    } else {
      await filesApi.deleteItem(item.path)
      unmarkChatFileOpened(item.path)
    }
    await loadFileTree()
  }

  const handleDeleteItem = async (item) => {
    if (!item) return
    if (deleteConfirmSuppressed) {
      try {
        await performDelete(item)
      } catch (error) {
        alert('删除失败: ' + error.message)
      }
      return
    }
    setDeleteConfirm({ visible: true, item })
  }

  const handleCopyItemPath = async (item) => {
    const path = String(item?.path || '').trim()
    if (!path) return
    try {
      const absolutePath = await filesApi.getAbsolutePath(path)
      await navigator.clipboard.writeText(absolutePath || path)
    } catch (error) {
      console.error('复制路径失败:', error)
      alert('复制路径失败: ' + (error?.message || '未知错误'))
    }
  }

  const handleOpenReview = (item) => {
    if (!item) return
    if (item.type === 'file') {
      onFileClick?.(item)
      return
    }
    handleToggleFolder(item.path)
  }

  const handleRevealInExplorer = async (item) => {
    const targetPath = String(item?.path || '').trim()
    if (!targetPath) return
    try {
      await filesApi.revealInFileExplorer(targetPath)
    } catch (error) {
      alert('打开资源管理器失败: ' + (error?.message || '未知错误'))
    }
  }

  const handleAddToMoRos = async (item) => {
    const targetPath = String(item?.path || '').trim()
    if (!targetPath) return
    try {
      window.dispatchEvent(new CustomEvent('moros:add-chat-attachment', {
        detail: {
          path: targetPath,
          name: item?.name || '',
        },
      }))
      await navigator.clipboard.writeText(`@${targetPath}`)
    } catch (error) {
      console.error('复制引用失败:', error)
      alert('复制引用失败: ' + (error?.message || '未知错误'))
    }
  }

  const confirmDelete = async (suppressFuture = false) => {
    const item = deleteConfirm.item
    if (!item) {
      setDeleteConfirm({ visible: false, item: null })
      return
    }
    try {
      await performDelete(item)
      if (suppressFuture) {
        persistDeleteConfirmPreference(true)
      }
      setDeleteConfirm({ visible: false, item: null })
    } catch (error) {
      alert('删除失败: ' + error.message)
      setDeleteConfirm({ visible: false, item: null })
    }
  }

  const cancelDelete = () => setDeleteConfirm({ visible: false, item: null })

  // 右键菜单
  const handleContextMenu = (e, item) => {
    e.preventDefault()
    // 多选模式下不显示右键菜单，只支持拖拽操作
    if (multiSelectMode && selectedPaths.size > 0) {
      return
    }
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }

  // 文件树空白处右键菜单
  const handleFileTreeContextMenu = (e) => {
    // 检查是否点击在文件项上
    if (e.target.closest('.file-item')) {
      return // 如果点击在文件项上，让文件项的右键菜单处理
    }
    
    e.preventDefault()
    const clickedInSkillsSection = Boolean(e.target?.closest?.('.skills-section'))
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item: null, // 空白处右键，item 为 null
      parentPath: clickedInSkillsSection ? FIXED_SKILLS_ROOT : undefined,
    })
  }

  // 设置文件夹颜色
  const handleSetFolderColor = async (item, color) => {
    try {
      await filesApi.setFolderColor(item.path, color)
      await loadFileTree()
      setShowColorPicker(null)
      setContextMenu(null)
    } catch (error) {
      alert('设置颜色失败: ' + error.message)
    }
  }

  // 显示颜色选择器
  const handleShowColorPicker = (e, item) => {
    e.stopPropagation()
    setShowColorPicker({
      item,
      x: e.clientX,
      y: e.clientY
    })
  }

  const resolveCreateParentPath = (item) => {
    if (!item) return undefined
    if (item.type === 'folder') return item.path
    const fullPath = String(item.path || '')
    const slashIndex = fullPath.lastIndexOf('/')
    if (slashIndex <= 0) return undefined
    return fullPath.slice(0, slashIndex)
  }

  const isPathInSkillArea = (targetPath) => {
    const normalized = String(targetPath || '').replace(/\\/g, '/').trim()
    if (!normalized) return false
    const skillRoots = getSkillPaths()
      .map((item) => String(item || '').replace(/\\/g, '/').trim())
      .filter(Boolean)
    return skillRoots.some((rootPath) => normalized === rootPath || normalized.startsWith(`${rootPath}/`))
  }

  const canCreateConversationalFiles = (parentPath) => {
    return !isPathInSkillArea(parentPath)
  }

  const handleOpenCreateMenu = (e, item) => {
    e.stopPropagation()
    setContextMenu(null)
    setCreateMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'new-actions',
      parentPath: resolveCreateParentPath(item),
    })
  }

  const getSmartPopupPosition = (anchorX, anchorY, popupEl) => {
    if (!popupEl) return { x: anchorX, y: anchorY }
    const margin = 8
    const rect = popupEl.getBoundingClientRect()
    const popupWidth = rect.width
    const popupHeight = rect.height

    let x = anchorX
    let y = anchorY

    // 右侧溢出则向左回收
    if (x + popupWidth + margin > window.innerWidth) {
      x = Math.max(margin, window.innerWidth - popupWidth - margin)
    }

    // 下方溢出则优先向上弹出（满足“底部不截断”）
    if (y + popupHeight + margin > window.innerHeight) {
      y = Math.max(margin, anchorY - popupHeight - 6)
    }

    // 兜底：仍溢出则贴合窗口边界
    if (y + popupHeight + margin > window.innerHeight) {
      y = Math.max(margin, window.innerHeight - popupHeight - margin)
    }
    if (x < margin) x = margin
    if (y < margin) y = margin

    return { x, y }
  }

  const handleCreateMenuAction = (action, parentPath) => {
    setContextMenu(null)
    setCreateMenu(null)
    if ((action === 'moros' || action === 'whiteboard') && !canCreateConversationalFiles(parentPath)) {
      alert('Skills 区域不支持创建 MoRos 或白板')
      return
    }
    if (action === 'folder') {
      handleCreateFolder(parentPath)
      return
    }
    if (action === 'file') {
      handleCreateFile(parentPath)
      return
    }
    if (action === 'whiteboard') {
      handleCreateWhiteboard(parentPath)
      return
    }
    if (action === 'moros') {
      handleCreateChat(parentPath)
    }
  }

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const next = getSmartPopupPosition(contextMenu.x, contextMenu.y, contextMenuRef.current)
    if (next.x !== contextMenu.x || next.y !== contextMenu.y) {
      setContextMenu((prev) => (prev ? { ...prev, x: next.x, y: next.y } : prev))
    }
  }, [contextMenu?.x, contextMenu?.y, contextMenu?.item])

  useEffect(() => {
    if (!createMenu || !createMenuRef.current) return
    const next = getSmartPopupPosition(createMenu.x, createMenu.y, createMenuRef.current)
    if (next.x !== createMenu.x || next.y !== createMenu.y) {
      setCreateMenu((prev) => (prev ? { ...prev, x: next.x, y: next.y } : prev))
    }
  }, [createMenu?.x, createMenu?.y, createMenu?.type, createMenu?.parentPath])

  useEffect(() => {
    if (!showColorPicker || !colorPickerRef.current) return
    const next = getSmartPopupPosition(showColorPicker.x, showColorPicker.y, colorPickerRef.current)
    if (next.x !== showColorPicker.x || next.y !== showColorPicker.y) {
      setShowColorPicker((prev) => (prev ? { ...prev, x: next.x, y: next.y } : prev))
    }
  }, [showColorPicker?.x, showColorPicker?.y, showColorPicker?.item?.path])

  // 关闭右键菜单、颜色选择器、创建菜单，以及退出多选模式
  useEffect(() => {
    const handleClickOutside = (e) => {
      // 检查是否点击在文件项上（允许切换选择状态）
      const isFileItem = e.target.closest('.file-item')
      
      setContextMenu(null)
      setShowColorPicker(null)
      setCreateMenu(null)
      
      // 如果不是点击文件项，且处于多选模式，则退出多选模式
      if (!isFileItem && multiSelectMode) {
        const elapsed = Date.now() - multiSelectEnteredAtRef.current
        if (elapsed < MULTI_SELECT_CLICK_GUARD_MS) return
        clearMultiSelect()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [multiSelectMode])

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-title">
          {!collapsed && (
              <div className="brand" onClick={() => onGoHome?.()} style={{ cursor: 'pointer' }}>
              <span className="brand-logo" aria-hidden="true">
                <MorosShapeIcon className="brand-logo-mark" />
              </span>
              <span className="brand-name">MoRos CoWork</span>
            </div>
          )}
          <button className="collapse-btn sidebar-icon-btn" onClick={onToggleCollapse}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      <div className="search-section">
        {!collapsed && (
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder={t('sidebar.search_placeholder')}
              value={searchTerm}
              onChange={async (e) => {
                const q = e.target.value
                onSearchChange(q)
                if (q && q.trim().length > 0) {
                  setSearchLoading(true)
                  try {
                    const res = await knowledgeApi.searchFiles(q)
                    setSearchResults(res)
                    setShowSearchPanel(true)
                  } finally { 
                    setSearchLoading(false) 
                  }
                } else {
                  setSearchResults([])
                  setShowSearchPanel(false)
                }
              }}
              onFocus={() => { 
                if (searchResults.length) setShowSearchPanel(true) 
              }}
            />
          </div>
        )}
        <button 
          className="theme-toggle sidebar-icon-btn"
          onClick={onToggleDarkMode}
          title={darkMode ? t('sidebar.theme_to_light') : t('sidebar.theme_to_dark')}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

          {/* 搜索结果浮层 */}
          {!collapsed && showSearchPanel && (
            <div className="search-result-panel" onMouseLeave={() => setShowSearchPanel(false)}>
              {uniqueSearchResults.map((it, idx) => {
                const q = (searchTerm || '').trim()
                const path = it.path
                const snippet = (it.snippet || '')
                  .replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `__H__${m}__H__`)
                const parts = snippet.split('__H__')
                return (
                  <div key={idx} className="search-item" onClick={() => { 
                    onFileClick?.({ name: it.name, path: it.path, type: 'file' }); 
                    setShowSearchPanel(false) 
                  }}>
                    <div className="search-item-path">{path}</div>
                    <div className="search-item-snippet">
                      {parts.map((p, i) => i % 2 === 1 ? (
                        <span key={i} className="search-highlight">{p}</span>
                      ) : (
                        <span key={i}>{p}</span>
                      ))}
                    </div>
                  </div>
                )
              })}
              {!searchResults.length && !searchLoading && (
                <div className="search-item">
                  <div className="search-item-path">{t('sidebar.state.empty')}</div>
                </div>
              )}
            </div>
          )}

          <div 
            className="file-tree"
            ref={fileTreeRef}
            onContextMenu={handleFileTreeContextMenu}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={async (e) => {
              e.preventDefault()
              try {
                const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'))
                // 如果已经在根目录，不做操作
                if (!draggedData.path.includes('/')) return
                
                // 移动到根目录
                await filesApi.moveItem(draggedData.path, undefined)
                await loadFileTree()
                setHighlightPath(draggedData.name)
                setTimeout(() => setHighlightPath(''), 800)
              } catch (error) {
                console.error('拖拽到根目录失败:', error)
                alert('拖拽操作失败: ' + error.message)
              } finally {
                handleDragEnd()
              }
            }}
          >
            {loading ? (
              <div className="sidebar-loading-skeleton" role="status" aria-label={t('sidebar.state.loading')}>
                <div className="sidebar-skeleton-block">
                  <div className="sidebar-skeleton-line w-48" />
                  <div className="sidebar-skeleton-line w-72" />
                  <div className="sidebar-skeleton-line w-64" />
                  <div className="sidebar-skeleton-line w-80" />
                  <div className="sidebar-skeleton-line w-56" />
                  <div className="sidebar-skeleton-line w-70" />
                </div>
              </div>
            ) : fileTree.length === 0 ? (
              <div className="empty-state">
                <p>{t('sidebar.state.empty')}</p>
                <p className="empty-hint">{t('sidebar.state.hint')}</p>
              </div>
            ) : collapsed && collapsedViewItems ? (
              <div className="collapsed-file-list">
                {collapsedViewItems.map(item => (
                  <FileTreeItem
                    key={item.id}
                    item={item}
                    onFileClick={onFileClick}
                    onContextMenu={handleContextMenu}
                    onRename={loadFileTree}
                    creatingItem={creatingItem}
                    onFinishCreating={handleFinishCreating}
                    onCancelCreating={handleCancelCreating}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragLeave={handleDragLeave}
                    onDragEnd={handleDragEnd}
                    dragOverItem={dragOverItem}
                    dragOverPosition={dragOverPosition}
                    isDragging={isDragging}
                    highlightPath={highlightPath}
                    activePath={currentFile?.path}
                    onHoverStart={handleHoverStart}
                    onHoverEnd={handleHoverEnd}
                    hoverPreview={hoverPreview}
                    expandedFolders={expandedFolders}
                    onToggleFolder={handleToggleFolder}
                    collapsed={collapsed}
                    showFileExtensions={showFileExtensions}
                    multiSelectMode={multiSelectMode}
                    selectedPaths={selectedPaths}
                    onSelectToggle={toggleSelect}
                    onEnterMultiSelect={enterMultiSelect}
                    onOpenCreateMenu={handleOpenCreateMenu}
                    onFolderColorPick={handleShowColorPicker}
                  />
                ))}
              </div>
            ) : (
              <>
                <div className={`workspace-section skills-section ${skillsCollapsed ? 'collapsed' : ''}`}>
                  <div className="workspace-header" onClick={handleToggleSkills}>
                    <span className="workspace-title">{t('sidebar.sections.skills')}</span>
                    <div className="workspace-header-right">
                      <button
                        className="workspace-create-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCreateSkillFolder()
                        }}
                        title={t('sidebar.tooltips.create_skill_item')}
                      >
                        <Plus size={12} />
                      </button>
                      <span className="workspace-toggle">
                        {skillsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </div>
                  </div>
                  {!skillsCollapsed && (
                    <div className="workspace-content">
                      {creatingItem && creatingItem.type === 'skill' && creatingItem.parentPath === FIXED_SKILLS_ROOT && (
                        <div className="file-tree-item">
                          <div className="file-item creating">
                            <div className="file-item-content" style={{ paddingLeft: '12px' }}>
                              <span className="file-icon">
                                <Folder size={16} />
                              </span>
                              <input
                                className="file-name-input"
                                placeholder={t('sidebar.placeholders.new_skill_name')}
                                onBlur={(e) => handleFinishCreating(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    handleFinishCreating(e.target.value)
                                  } else if (e.key === 'Escape') {
                                    handleCancelCreating()
                                  }
                                }}
                                autoFocus
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {separatedItems.skills.map(item => (
                        <FileTreeItem
                          key={item.id}
                          item={item}
                          onFileClick={onFileClick}
                          onContextMenu={handleContextMenu}
                          onRename={loadFileTree}
                          creatingItem={creatingItem}
                          onFinishCreating={handleFinishCreating}
                          onCancelCreating={handleCancelCreating}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onDragLeave={handleDragLeave}
                          onDragEnd={handleDragEnd}
                          dragOverItem={dragOverItem}
                          dragOverPosition={dragOverPosition}
                          isDragging={isDragging}
                          highlightPath={highlightPath}
                          activePath={currentFile?.path}
                          onHoverStart={handleHoverStart}
                          onHoverEnd={handleHoverEnd}
                          hoverPreview={hoverPreview}
                          expandedFolders={expandedFolders}
                          onToggleFolder={handleToggleFolder}
                          collapsed={collapsed}
                          showFileExtensions={showFileExtensions}
                          multiSelectMode={multiSelectMode}
                          selectedPaths={selectedPaths}
                          onSelectToggle={toggleSelect}
                          onEnterMultiSelect={enterMultiSelect}
                          onOpenCreateMenu={handleOpenCreateMenu}
                          onFolderColorPick={handleShowColorPicker}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className={`workspace-section ${workspaceCollapsed ? 'collapsed' : ''}`}>
                  <div className="workspace-header" onClick={handleToggleWorkspace}>
                    <span className="workspace-title">{t('sidebar.sections.workspace')}</span>
                    <div className="workspace-header-right">
                      <button
                        className="workspace-create-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCreateWorkspace()
                        }}
                        title={t('sidebar.tooltips.create_workspace_item')}
                      >
                        <Plus size={12} />
                      </button>
                      <span className="workspace-toggle">
                        {workspaceCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </div>
                  </div>
                  {!workspaceCollapsed && (
                    <div className="workspace-content">
                      {creatingItem && creatingItem.type === 'workspace' && !creatingItem.parentPath && (
                        <div className="file-tree-item">
                          <div className="file-item creating">
                            <div className="file-item-content" style={{ paddingLeft: '12px' }}>
                              <span className="file-icon">
                                <Folder size={16} />
                              </span>
                              <input
                                className="file-name-input"
                                placeholder={t('sidebar.placeholders.new_workspace_name')}
                                onBlur={(e) => handleFinishCreating(e.target.value)}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    handleFinishCreating(e.target.value)
                                  } else if (e.key === 'Escape') {
                                    handleCancelCreating()
                                  }
                                }}
                                autoFocus
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {separatedItems.workspaces.map(item => (
                        <FileTreeItem
                          key={item.id}
                          item={item}
                          onFileClick={onFileClick}
                          onContextMenu={handleContextMenu}
                          onRename={loadFileTree}
                          creatingItem={creatingItem}
                          onFinishCreating={handleFinishCreating}
                          onCancelCreating={handleCancelCreating}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onDragLeave={handleDragLeave}
                          onDragEnd={handleDragEnd}
                          dragOverItem={dragOverItem}
                          dragOverPosition={dragOverPosition}
                          isDragging={isDragging}
                          highlightPath={highlightPath}
                          activePath={currentFile?.path}
                          onHoverStart={handleHoverStart}
                          onHoverEnd={handleHoverEnd}
                          hoverPreview={hoverPreview}
                          expandedFolders={expandedFolders}
                          onToggleFolder={handleToggleFolder}
                          collapsed={collapsed}
                          showFileExtensions={showFileExtensions}
                          multiSelectMode={multiSelectMode}
                          selectedPaths={selectedPaths}
                          onSelectToggle={toggleSelect}
                          onEnterMultiSelect={enterMultiSelect}
                          onOpenCreateMenu={handleOpenCreateMenu}
                          onFolderColorPick={handleShowColorPicker}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {/* 文件夹区域 */}
                {(separatedItems.folders.length > 0 || (creatingItem && creatingItem.type === 'folder' && !creatingItem.parentPath)) && (
                  <div className={`file-section folders-section ${foldersCollapsed ? 'collapsed' : ''}`}>
                    <div className="file-section-header" onClick={handleToggleFolders}>
                      <span className="file-section-title">{t('sidebar.sections.folders')}</span>
                      <div className="file-section-header-right">
                        <button 
                          className="file-section-create-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCreateMenu({ 
                              x: e.clientX, 
                              y: e.clientY, 
                              type: 'new-actions',
                              parentPath: undefined 
                            })
                          }}
                          title={t('sidebar.tooltips.create_folder')}
                        >
                          <Plus size={12} />
                        </button>
                        <span className="file-section-toggle">
                          {foldersCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </div>
                    </div>
                    {!foldersCollapsed && (
                      <div className="file-section-content">
                        {/* 在文件夹区域创建新文件夹（顶部） */}
                        {creatingItem && creatingItem.type === 'folder' && !creatingItem.parentPath && (
                          <div className="file-tree-item">
                            <div className="file-item creating">
                              <div className="file-item-content" style={{ paddingLeft: '12px' }}>
                                <span className="file-icon">
                                  <Folder size={16} />
                                </span>
                                <input
                                  className="file-name-input"
                                  placeholder={t('sidebar.placeholders.new_folder_name')}
                                  onBlur={(e) => handleFinishCreating(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      handleFinishCreating(e.target.value)
                                    } else if (e.key === 'Escape') {
                                      handleCancelCreating()
                                    }
                                  }}
                                  autoFocus
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        {separatedItems.folders.map(item => (
                          <FileTreeItem
                            key={item.id}
                            item={item}
                            onFileClick={onFileClick}
                            onContextMenu={handleContextMenu}
                            onRename={loadFileTree}
                            creatingItem={creatingItem}
                            onFinishCreating={handleFinishCreating}
                            onCancelCreating={handleCancelCreating}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onDragLeave={handleDragLeave}
                            onDragEnd={handleDragEnd}
                            dragOverItem={dragOverItem}
                            dragOverPosition={dragOverPosition}
                            isDragging={isDragging}
                            highlightPath={highlightPath}
                            activePath={currentFile?.path}
                            onHoverStart={handleHoverStart}
                            onHoverEnd={handleHoverEnd}
                            hoverPreview={hoverPreview}
                            expandedFolders={expandedFolders}
                            onToggleFolder={handleToggleFolder}
                            collapsed={collapsed}
                            showFileExtensions={showFileExtensions}
                            multiSelectMode={multiSelectMode}
                            selectedPaths={selectedPaths}
                            onSelectToggle={toggleSelect}
                            onEnterMultiSelect={enterMultiSelect}
                            onOpenCreateMenu={handleOpenCreateMenu}
                            onFolderColorPick={handleShowColorPicker}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* 文件区域（可折叠） */}
                {(separatedItems.files.length > 0 || (creatingItem && creatingItem.type === 'file' && !creatingItem.parentPath)) && (
                  <div className={`file-section files-section ${filesCollapsed ? 'collapsed' : ''}`}>
                    <div className="file-section-header" onClick={handleToggleFiles}>
                      <span className="file-section-title">{t('sidebar.sections.files')}</span>
                      <div className="file-section-header-right">
                        <button 
                          className="file-section-create-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCreateMenu({ 
                              x: e.clientX, 
                              y: e.clientY, 
                              type: 'new-actions',
                              parentPath: undefined 
                            })
                          }}
                          title={t('sidebar.tooltips.create_file')}
                        >
                          <Plus size={12} />
                        </button>
                        <span className="file-section-toggle">
                          {filesCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </span>
                      </div>
                    </div>
                    {!filesCollapsed && (
                      <div className="file-section-content">
                        {/* 在文件区域创建新文件（顶部） */}
                        {creatingItem && creatingItem.type === 'file' && !creatingItem.parentPath && (
                          <div className="file-tree-item">
                            <div className="file-item creating">
                              <div className="file-item-content" style={{ paddingLeft: '12px' }}>
                                <span className="file-icon">
                                  <FileText size={16} />
                                </span>
                                <input
                                  className="file-name-input"
                                  placeholder={t('sidebar.placeholders.new_file_name')}
                                  onBlur={(e) => handleFinishCreating(e.target.value)}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      handleFinishCreating(e.target.value)
                                    } else if (e.key === 'Escape') {
                                      handleCancelCreating()
                                    }
                                  }}
                                  autoFocus
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        {separatedItems.files.map(item => (
                          <FileTreeItem
                            key={item.id}
                            item={item}
                            onFileClick={onFileClick}
                            onContextMenu={handleContextMenu}
                            onRename={loadFileTree}
                            creatingItem={creatingItem}
                            onFinishCreating={handleFinishCreating}
                            onCancelCreating={handleCancelCreating}
                            onDragStart={handleDragStart}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onDragLeave={handleDragLeave}
                            onDragEnd={handleDragEnd}
                            dragOverItem={dragOverItem}
                            dragOverPosition={dragOverPosition}
                            isDragging={isDragging}
                            highlightPath={highlightPath}
                            activePath={currentFile?.path}
                            onHoverStart={handleHoverStart}
                            onHoverEnd={handleHoverEnd}
                            hoverPreview={hoverPreview}
                            expandedFolders={expandedFolders}
                            onToggleFolder={handleToggleFolder}
                            collapsed={collapsed}
                            showFileExtensions={showFileExtensions}
                            multiSelectMode={multiSelectMode}
                            selectedPaths={selectedPaths}
                            onSelectToggle={toggleSelect}
                            onEnterMultiSelect={enterMultiSelect}
                            onOpenCreateMenu={handleOpenCreateMenu}
                            onFolderColorPick={handleShowColorPicker}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 垃圾桶区域 - 用于拖拽删除 */}
          {multiSelectMode && selectedPaths.size > 0 && (
            <div 
              className="trash-zone"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                e.currentTarget.classList.add('drag-over-trash')
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('drag-over-trash')
              }}
              onDrop={async (e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('drag-over-trash')
                
                try {
                  const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'))
                  const pathsToDelete = draggedData.isMultiSelect && draggedData.selectedPaths 
                    ? draggedData.selectedPaths 
                    : [draggedData.path]
                  await handleDeleteItem({
                    name: pathsToDelete.length > 1 ? `${pathsToDelete.length} 个项目` : draggedData.name,
                    isMultiple: pathsToDelete.length > 1,
                    paths: pathsToDelete,
                  })
                } catch (error) {
                  console.error('拖拽到垃圾桶失败:', error)
                }
              }}
            >
              <Trash2 size={18} />
              {!collapsed && <span>{t('sidebar.state.drag_to_delete')}</span>}
            </div>
          )}

          {/* 用户头像设置（点击打开设置页） */}
          <div className="user-profile" onClick={handleUserProfileClick} title={(!collapsed && username) ? username : undefined}>
            <button 
              className="profile-btn"
              title={t('sidebar.tooltips.open_settings')}
            >
              {avatar ? (
                <img src={avatar} alt={t('sidebar.avatar_alt')} className="profile-avatar" />
              ) : (
                <div className="default-profile-avatar">
                  <User size={14} />
                </div>
              )}
            </button>
            {!collapsed && (<div className="user-name">{username || 'MoRos'}</div>)}
            {!collapsed && (
              <div className="user-more" aria-hidden>
                <MoreHorizontal size={16} />
              </div>
            )}
          </div>

          {/* 右键菜单 */}
          <SidebarContextMenu
            contextMenu={contextMenu}
            contextMenuRef={contextMenuRef}
            t={t}
            canCreateConversationalFiles={canCreateConversationalFiles}
            onCreateAction={handleCreateMenuAction}
            onOpenReview={handleOpenReview}
            onRevealInExplorer={handleRevealInExplorer}
            onAddToMoRos={handleAddToMoRos}
            onCopyPath={handleCopyItemPath}
            onRename={handleRenameItem}
            onShowColorPicker={handleShowColorPicker}
            onDelete={handleDeleteItem}
            onClose={() => setContextMenu(null)}
          />

          {/* 创建菜单 */}
          <CreateActionsMenu
            createMenu={createMenu}
            createMenuRef={createMenuRef}
            t={t}
            canCreateConversationalFiles={canCreateConversationalFiles}
            onCreateAction={handleCreateMenuAction}
          />

      {/* 删除确认模态 */}
      {deleteConfirm.visible && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="modal elegant" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon danger"></div>
              <div className="modal-titles">
                <div className="modal-title">{t('sidebar.delete_confirm.title')}</div>
                <div className="modal-subtitle">{t('sidebar.delete_confirm.subtitle')}</div>
              </div>
            </div>
            <div className="modal-body">
              {t('sidebar.delete_confirm.body', { name: deleteConfirm.item?.name })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={cancelDelete}>{t('sidebar.delete_confirm.cancel')}</button>
              <button className="btn btn-secondary" onClick={() => confirmDelete(false)}>{t('sidebar.delete_confirm.confirm')}</button>
              <button className="btn btn-danger" onClick={() => confirmDelete(true)}>{t('sidebar.delete_confirm.confirm_and_skip')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 设置模态已移除，统一在主内容页中展示设置 */}

      {/* 颜色选择器 */}
      {showColorPicker && (
        <div 
          className="color-picker"
          ref={colorPickerRef}
          style={{ left: showColorPicker.x, top: showColorPicker.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            '#94a3b8', '#ef4444', '#f97316', '#eab308', 
            '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', 
            '#ec4899', '#6b7280', '#84cc16', '#f59e0b'
          ].map((color, index) => (
            <button
              key={`${color}-${index}`}
              className="color-option"
              style={{ backgroundColor: color }}
              onClick={() => handleSetFolderColor(showColorPicker.item, index === 0 ? null : color)}
            />
          ))}
        </div>
      )}
      
      
      {/* 悬浮预览 */}
      <HoverPreview
        file={hoverPreviewFile}
        visible={!!hoverPreviewFile}
        position={hoverPreviewPosition}
        onClose={handlePreviewClose}
      />
    </div>
  )
}

export default Sidebar
