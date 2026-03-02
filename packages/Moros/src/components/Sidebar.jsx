import React, { useState, useEffect, useMemo } from 'react'
import { 
  Search, ChevronLeft, ChevronRight, Sun, Moon, ChevronDown, 
  ChevronRight as ChevronRightIcon, Folder, FileText, Plus, 
  MoreHorizontal, Edit, Trash2, FolderPlus, FilePlus, Shapes,
  User, Globe, Palette, MessageSquare 
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
import './Sidebar.css'

const DELETE_CONFIRM_SUPPRESS_KEY = 'moros-delete-confirm-suppressed'
const MULTI_SELECT_CLICK_GUARD_MS = 360

// 文件树项组件
function FileTreeItem({ item, level = 0, onFileClick, onContextMenu, onRename, creatingItem, onFinishCreating, onCancelCreating, onDragStart, onDragOver, onDrop, onDragLeave, onDragEnd, dragOverItem, dragOverPosition, isDragging, highlightPath, activePath, onHoverStart, onHoverEnd, hoverPreview, expandedFolders, onToggleFolder, collapsed, showFileExtensions, multiSelectMode, selectedPaths, onSelectToggle, onEnterMultiSelect }) {
  const { t } = useI18n()
  const expanded = item.type === 'folder' ? expandedFolders.has(item.path) : undefined
  const [editName, setEditName] = useState(item.name)
  const longPressTimerRef = React.useRef(null)
  const longPressTriggeredRef = React.useRef(false)
  const indentPx = collapsed ? 8 : (12 + level * 14)
  const childIndentPx = collapsed ? 8 : (12 + (level + 1) * 14)

  // 检测是否应该进入编辑状态
  useEffect(() => {
    if (item.isEditing) {
      // 重命名时隐藏常见扩展名（.md、.excalidraw、.MoRos）
      const nameWithoutExt = (item.name || '').replace(/\.(md|excalidraw|moros)$/i, '')
      setEditName(nameWithoutExt)
    }
  }, [item.isEditing, item.name])

  const handleClick = () => {
    if (item.isEditing) return // 编辑状态下不处理点击
    if (longPressTriggeredRef.current) { longPressTriggeredRef.current = false; return }
    if (multiSelectMode) {
      onSelectToggle?.(item)
      return
    }
    if (item.type === 'folder') {
      onToggleFolder?.(item.path)
    } else {
      onFileClick?.(item)
    }
  }

  const handleMouseDown = () => {
    if (multiSelectMode) return
    longPressTriggeredRef.current = false
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      onEnterMultiSelect?.(item)
    }, 600) // 延长到 600ms,给拖拽更多时间
  }

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleDragStartWrapper = (e) => {
    // 拖拽开始时立即清除长按计时器
    clearLongPress()
    onDragStart?.(e, item)
  }

  const handleRename = async () => {
    const raw = editName.trim()
    if (raw && raw !== item.name) {
      try {
        // 根据原文件扩展名（仅支持 .md / .excalidraw / .MoRos）决定是否自动补齐
        const hasUserExt = /\.[^\s.]+$/i.test(raw)
        let finalName = raw
        if (!hasUserExt) {
          if (/\.md$/i.test(item.name)) finalName = raw + '.md'
          else if (/\.excalidraw$/i.test(item.name)) finalName = raw + '.excalidraw'
          else if (/\.moros$/i.test(item.name)) finalName = raw + '.MoRos'
        }
        await filesApi.renameItem(item.path, finalName)
        onRename?.() // 通知父组件重新加载文件树
      } catch (error) {
        console.error('重命名失败:', error)
        alert('重命名失败: ' + error.message)
        const nameWithoutExt = (item.name || '').replace(/\.(md|excalidraw|moros)$/i, '')
        setEditName(nameWithoutExt)
      }
    }
    // 通过父组件重新加载来退出编辑状态
    onRename?.()
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      const nameWithoutExt = (item.name || '').replace(/\.(md|excalidraw|moros)$/i, '')
      setEditName(nameWithoutExt)
      onRename?.() // 取消编辑
    }
  }

  return (
    <div className="file-tree-item">
      <div 
        className={`file-item ${(item.active || item.path === activePath) ? 'active' : ''} ${item.path === highlightPath ? 'reorder-highlight' : ''} ${isDragging && isDragging === item.path ? 'dragging' : ''} ${dragOverItem === item.path ? (dragOverPosition === 'inside' ? 'drag-over-folder' : (dragOverPosition === 'before' ? 'drag-over-before' : (dragOverPosition === 'after' ? 'drag-over-after' : ''))) : ''} ${multiSelectMode && selectedPaths?.has(item.path) ? 'bulk-selected' : ''}`}
        style={{ paddingLeft: `${indentPx}px` }}
        data-type={item.type}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu?.(e, item)}
        draggable="true"
        onDragStart={handleDragStartWrapper}
        onDragEnd={(e) => onDragEnd?.(e, item)}
        onDragOver={(e) => onDragOver?.(e, item)}
        onDrop={(e) => onDrop?.(e, item)}
        onDragLeave={onDragLeave}
        title={collapsed ? item.name : undefined}
        onMouseDown={handleMouseDown}
        onMouseUp={clearLongPress}
        onMouseLeave={() => {
          clearLongPress()
          if (hoverPreview && item.type === 'file' && item.name.toLowerCase().endsWith('.md')) {
            onHoverEnd?.()
          }
        }}
        onMouseEnter={(e) => {
          if (hoverPreview && item.type === 'file' && item.name.toLowerCase().endsWith('.md')) {
            onHoverStart?.(e, item)
          }
        }}
      >
        <div className="file-item-content">
          {item.type === 'folder' ? (
            <span className="file-expand-icon">
              {expanded ? <ChevronDown size={14} /> : <ChevronRightIcon size={14} />}
            </span>
          ) : (
            <span className="file-expand-placeholder" aria-hidden="true" />
          )}
          
          <span className="file-icon" style={{ color: item.type === 'folder' && item.color ? item.color : undefined }}>
            {item.type === 'folder' 
              ? <Folder size={16} /> 
              : (String(item.name || '').toLowerCase().endsWith('.excalidraw') 
                  ? <Shapes size={16} /> 
                  : (String(item.name || '').toLowerCase().endsWith('.moros')
                      ? <MessageSquare size={16} />
                      : <FileText size={16} />))}
          </span>
          
          {item.isEditing ? (
            <input
              className="file-name-input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyPress={handleKeyPress}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="file-name">
              {showFileExtensions 
                ? item.name 
                : (item.name || '').replace(/\.(md|excalidraw|moros)$/i, '')}
            </span>
          )}
          {multiSelectMode && (
            <span className={`bulk-check ${selectedPaths?.has(item.path) ? 'checked' : ''}`} aria-hidden></span>
          )}
        </div>
        
        {!multiSelectMode && (
          <button 
            className="file-menu-btn"
            onClick={(e) => {
              e.stopPropagation()
              onContextMenu?.(e, item)
            }}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      </div>
      
      {item.type === 'folder' && expanded && (
        <div className="file-children">
          {creatingItem && creatingItem.parentPath === item.path && (
            <div className="file-tree-item">
              <div className="file-item creating">
                <div className="file-item-content" style={{ paddingLeft: `${childIndentPx}px` }}>
                  <span className="file-icon">
                    {creatingItem.type === 'folder' ? <Folder size={16} /> : <FileText size={16} />}
                  </span>
                  <input
                    className="file-name-input"
                    placeholder={creatingItem.type === 'folder' ? t('sidebar.placeholders.new_folder_name') : t('sidebar.placeholders.new_file_name')}
                    onBlur={(e) => onFinishCreating(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        onFinishCreating(e.target.value)
                      } else if (e.key === 'Escape') {
                        onCancelCreating()
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>
            </div>
          )}
          {item.children && item.children.map((child) => (
            <FileTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
              onRename={onRename}
              creatingItem={creatingItem}
              onFinishCreating={onFinishCreating}
              onCancelCreating={onCancelCreating}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragLeave={onDragLeave}
              onDragEnd={onDragEnd}
              dragOverItem={dragOverItem}
              dragOverPosition={dragOverPosition}
              isDragging={isDragging}
              highlightPath={highlightPath}
              activePath={activePath}
              onHoverStart={onHoverStart}
              onHoverEnd={onHoverEnd}
              hoverPreview={hoverPreview}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              collapsed={collapsed}
              showFileExtensions={showFileExtensions}
              multiSelectMode={multiSelectMode}
              selectedPaths={selectedPaths}
              onSelectToggle={onSelectToggle}
              onEnterMultiSelect={onEnterMultiSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

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
  sidebarRef,
}) {
  const [fileTree, setFileTree] = useState([])
  const [loading, setLoading] = useState(true)
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
  const initialFileTreeLoadedRef = React.useRef(false)
  const [hoverPreviewFile, setHoverPreviewFile] = useState(null)
  const [hoverPreviewPosition, setHoverPreviewPosition] = useState({ top: 0, left: 0 })
  // 计时器使用 ref，避免闭包导致取消失败
  const hoverTimeoutRef = React.useRef(null)
  // 管理展开的文件夹路径
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false)
  const [filesCollapsed, setFilesCollapsed] = useState(false)
  const [foldersCollapsed, setFoldersCollapsed] = useState(false)
  const [createMenu, setCreateMenu] = useState(null) // 用于显示创建菜单 { x, y, type: 'file' | 'folder', parentPath }
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

  // WorkSpace 总开关
  const handleToggleWorkspace = () => {
    setWorkspaceCollapsed(prev => !prev)
  }

  const workspaceStorageKey = 'moros-workspace-paths'
  const legacyWorkspaceConfigFile = '.moros-workspaces.json'
  const wsPathsCacheRef = React.useRef(null)
  const workspaceMigrationDoneRef = React.useRef(false)

  const getWorkspacePaths = () => {
    return wsPathsCacheRef.current || []
  }

  const normalizeWorkspacePaths = (paths) => {
    if (!Array.isArray(paths)) return []
    return Array.from(new Set(paths.filter((p) => typeof p === 'string' && p.trim().length > 0)))
  }

  const loadWorkspacePaths = async () => {
    try {
      const local = localStorage.getItem(workspaceStorageKey)
      if (local) {
        wsPathsCacheRef.current = normalizeWorkspacePaths(JSON.parse(local))
        return wsPathsCacheRef.current
      }
    } catch {
      // ignore localStorage parse errors and fallback to legacy migration
    }

    wsPathsCacheRef.current = []

    // 仅在首次加载时尝试迁移旧版文件配置，并自动清理旧配置文件
    if (!workspaceMigrationDoneRef.current) {
      workspaceMigrationDoneRef.current = true
      try {
        const content = await filesApi.readFile(legacyWorkspaceConfigFile)
        const migrated = normalizeWorkspacePaths(JSON.parse(content || '[]'))
        wsPathsCacheRef.current = migrated
        if (migrated.length > 0) {
          try { localStorage.setItem(workspaceStorageKey, JSON.stringify(migrated)) } catch {}
        }
        try { await filesApi.deleteItem(legacyWorkspaceConfigFile) } catch {}
      } catch {
        // legacy file may not exist
      }
    }

    return wsPathsCacheRef.current
  }

  const saveWorkspacePaths = async (paths) => {
    const normalized = normalizeWorkspacePaths(paths)
    wsPathsCacheRef.current = normalized
    try { localStorage.setItem(workspaceStorageKey, JSON.stringify(normalized)) } catch {}
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
    const workspaces = []
    const folders = []
    const files = []
    
    fileTree.forEach(item => {
      if (item.type === 'folder' && wsPaths.includes(item.path)) {
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
    
    return { workspaces, folders, files }
  }, [fileTree, filesManuallyOrdered])

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

  // 加载文件树
  const loadFileTree = async (options = {}) => {
    const {
      showLoading = !initialFileTreeLoadedRef.current,
      preserveScroll = true,
    } = options
    const previousScrollTop = preserveScroll ? fileTreeRef.current?.scrollTop ?? null : null
    try {
      if (showLoading) {
        setLoading(true)
      }
      await loadWorkspacePaths()
      let files = await filesApi.getFileTree()

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
          files = await filesApi.getFileTree()
        }
      }

      // 自动清理：未被打开且内容为空的 .MoRos 文件直接清除
      const openedChatPaths = new Set(getOpenedChatPaths())
      if (isMorosChatPath(currentFile?.path)) {
        openedChatPaths.add(currentFile.path)
      }
      const unopenedChatFiles = files.filter((file) => {
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
          files = await filesApi.getFileTree()
        }
      }
      
      // 构建层级结构
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
      
      // 保持后端顺序（.order.json 优先，其余保留后端默认：目录优先 + 字母序）
      setFileTree(rootFiles)
      if (typeof previousScrollTop === 'number') {
        requestAnimationFrame(() => {
          if (fileTreeRef.current) {
            fileTreeRef.current.scrollTop = previousScrollTop
          }
        })
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
    loadFileTree({ showLoading: true, preserveScroll: false })
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
      await loadFileTree()
      // 直接触发打开
      onFileClick?.(file)
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
      await loadFileTree()
      // 直接触发打开
      onFileClick?.(file)
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
      if (creatingItem.type === 'folder' || creatingItem.type === 'workspace') {
        const created = await filesApi.createFolder(name.trim(), creatingItem.parentPath)
        if (creatingItem.type === 'workspace') {
          const wsPath = created?.path || name.trim()
          await addWorkspacePath(wsPath)
        }
      } else {
        await filesApi.createFile(name.trim(), '', creatingItem.parentPath)
      }
      await loadFileTree()
      setCreatingItem(null)
    } catch (error) {
      alert(`创建${creatingItem.type === 'folder' ? '文件夹' : '文件'}失败: ${error.message}`)
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

  const performDelete = async (item) => {
    if (!item) return
    // 如果是多个项目删除
    if (item.isMultiple && item.paths) {
      for (const path of item.paths) {
        await filesApi.deleteItem(path)
        unmarkChatFileOpened(path)
      }
      // 清除多选状态
      clearMultiSelect()
    } else {
      // 单个项目删除
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
    const inWorkspaceSection = !!e.target.closest('.workspace-section')
    const inFoldersSection = !!e.target.closest('.folders-section')
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item: null, // 空白处右键，item 为 null
      allowCreateFolder: inWorkspaceSection || inFoldersSection
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
              <span className="brand-logo" aria-hidden="true" />
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
              <div className="loading">{t('sidebar.state.loading')}</div>
            ) : fileTree.length === 0 ? (
              <div className="empty-state">
                <p>{t('sidebar.state.empty')}</p>
                <p className="empty-hint">{t('sidebar.state.hint')}</p>
              </div>
            ) : (
              <>
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
                              type: 'folder', 
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
                              type: 'file', 
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
          {contextMenu && (
            <div 
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {contextMenu.item ? (
                <>
                  <button onClick={() => {
                    handleRenameItem(contextMenu.item)
                    setContextMenu(null)
                  }}>
                    <Edit size={14} /> {t('sidebar.context.rename')}
                  </button>
                  <button onClick={() => {
                    handleDeleteItem(contextMenu.item)
                    setContextMenu(null)
                  }}>
                    <Trash2 size={14} /> {t('sidebar.context.delete')}
                  </button>
                  {contextMenu.item.type === 'folder' && (
                    <>
                      <hr />
                      <button onClick={(e) => handleShowColorPicker(e, contextMenu.item)}>
                        <Palette size={14} style={{ color: contextMenu.item.color || 'var(--text-secondary)' }} />
                        {t('sidebar.context.set_color')}
                      </button>
                      <hr />
                      <button onClick={() => {
                        handleCreateFolder(contextMenu.item.path)
                        setContextMenu(null)
                      }}>
                        <FolderPlus size={14} /> {t('sidebar.context.new_folder')}
                      </button>
                      <button onClick={() => {
                        handleCreateFile(contextMenu.item.path)
                        setContextMenu(null)
                      }}>
                        <FilePlus size={14} /> {t('sidebar.context.new_file')}
                      </button>
                      <button onClick={() => handleCreateWhiteboard(contextMenu.item.path)}>
                        <Shapes size={14} /> {t('sidebar.context.new_whiteboard')}
                      </button>
                      <button onClick={() => handleCreateChat(contextMenu.item.path)}>
                        <MessageSquare size={14} /> {t('sidebar.context.new_chat')}
                      </button>
                    </>
                  )}
                </>
              ) : (
                // 空白处右键菜单
                <>
                  <button onClick={() => {
                    handleCreateFile()
                    setContextMenu(null)
                  }}>
                    <FilePlus size={14} /> {t('sidebar.context.new_file')}
                  </button>
                  <button onClick={() => handleCreateWhiteboard()}>
                    <Shapes size={14} /> {t('sidebar.context.new_whiteboard')}
                  </button>
                  <button onClick={() => handleCreateChat()}>
                    <MessageSquare size={14} /> {t('sidebar.context.new_chat')}
                  </button>
                  {contextMenu.allowCreateFolder && (
                    <button onClick={() => {
                      handleCreateFolder()
                      setContextMenu(null)
                    }}>
                      <FolderPlus size={14} /> {t('sidebar.context.new_folder')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* 创建菜单 */}
          {createMenu && (
            <div 
              className="context-menu"
              style={{ left: createMenu.x, top: createMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {createMenu.type === 'file' ? (
                <>
                  <button onClick={() => {
                    handleCreateFile(createMenu.parentPath)
                    setCreateMenu(null)
                  }}>
                    <FilePlus size={14} /> {t('sidebar.context.new_file')}
                  </button>
                  <button onClick={() => {
                    handleCreateWhiteboard(createMenu.parentPath)
                    setCreateMenu(null)
                  }}>
                    <Shapes size={14} /> {t('sidebar.context.new_whiteboard')}
                  </button>
                  <button onClick={() => {
                    handleCreateChat(createMenu.parentPath)
                    setCreateMenu(null)
                  }}>
                    <MessageSquare size={14} /> {t('sidebar.context.new_chat')}
                  </button>
                </>
              ) : (
                <button onClick={() => {
                  handleCreateFolder(createMenu.parentPath)
                  setCreateMenu(null)
                }}>
                  <FolderPlus size={14} /> {t('sidebar.context.new_folder')}
                </button>
              )}
            </div>
          )}

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
