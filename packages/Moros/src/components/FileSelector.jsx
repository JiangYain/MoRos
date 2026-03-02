import React, { useState, useEffect, useMemo } from 'react'
import { FileText, Folder, Search, ChevronDown, ChevronRight, Shapes } from 'lucide-react'
import { filesApi } from '../utils/api'
import './FileSelector.css'

function FileSelector({ 
  visible, 
  onSelect, 
  onClose, 
  position = { top: 0, left: 0 },
  currentFile 
}) {
  const [fileTree, setFileTree] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [expandedFolders, setExpandedFolders] = useState(new Set())
  const [showSelection, setShowSelection] = useState(false)
  const listRef = React.useRef(null)
  const panelRef = React.useRef(null)

  // 鑾峰彇褰撳墠鏂囦欢鎵€鍦ㄧ殑鏂囦欢澶硅矾寰?
  const getCurrentFileFolder = () => {
    if (!currentFile?.path) return null
    const parts = currentFile.path.split('/')
    return parts.length > 1 ? parts.slice(0, -1).join('/') : null
  }


  // 澶勭悊鏂囦欢鏍戯紝淇濇寔灞傛缁撴瀯
  const processedItems = useMemo(() => {
    if (!fileTree.length) return []
    
    const currentFolder = getCurrentFileFolder()
    
    // 濡傛灉鏈夋悳绱紝杩囨护鍖归厤椤?
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      const result = []
      
      // 閫掑綊鎼滅储鏂囦欢
      const searchInTree = (items, level = 0, parentPath = '') => {
        for (const item of items) {
          const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name
          
          if (item.type === 'file') {
            // 妫€鏌ユ枃浠舵槸鍚﹀尮閰嶆悳绱?
            if (item.name.toLowerCase().includes(searchLower) || 
                fullPath.toLowerCase().includes(searchLower)) {
              result.push({
                ...item,
                level,
                fullPath,
                isFile: true,
                isFolder: false
              })
            }
          } else if (item.type === 'folder') {
            // 鍏堟鏌ュ瓙椤规槸鍚︽湁鍖归厤鐨勬枃浠?
            let hasMatchingChildren = false
            if (item.children) {
              const childrenResult = []
              const searchChildren = (children, childLevel) => {
                for (const child of children) {
                  const childFullPath = `${fullPath}/${child.name}`
                  if (child.type === 'file') {
                    if (child.name.toLowerCase().includes(searchLower) || 
                        childFullPath.toLowerCase().includes(searchLower)) {
                      hasMatchingChildren = true
                      childrenResult.push({
                        ...child,
                        level: childLevel,
                        fullPath: childFullPath,
                        isFile: true,
                        isFolder: false
                      })
                    }
                  } else if (child.type === 'folder' && child.children) {
                    searchChildren(child.children, childLevel + 1)
                  }
                }
              }
              searchChildren(item.children, level + 1)
              
              if (hasMatchingChildren) {
                // 娣诲姞鍖呭惈鍖归厤鏂囦欢鐨勬枃浠跺す
                result.push({
                  ...item,
                  level,
                  fullPath,
                  isFile: false,
                  isFolder: true
                })
                result.push(...childrenResult)
              }
            }
          }
        }
      }
      
      searchInTree(fileTree)
      return result
    }
    
    // 娌℃湁鎼滅储鏃讹紝淇濇寔鍘熷鐨勬爲褰㈢粨鏋勶紝浣嗗皢褰撳墠鏂囦欢澶圭Щ鍒板墠闈?
    const processTreeWithPriority = (items, level = 0, parentPath = '') => {
      const result = []
      const currentItems = []
      const otherItems = []
      
      // 鍒嗙褰撳墠鏂囦欢澶瑰拰鍏朵粬椤?
      for (const item of items) {
        // 璺宠繃褰撳墠鏂囦欢
        if (false && item.type === 'file' && item.path === currentFile?.path) {
          continue
        }
        
        const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name
        const processed = {
          ...item,
          level,
          fullPath,
          isFile: item.type === 'file',
          isFolder: item.type === 'folder'
        }
        
        if (item.type === 'folder' && currentFolder && item.path === currentFolder) {
          currentItems.push(processed)
        } else {
          otherItems.push(processed)
        }
      }
      
      // 鍏堝鐞嗗綋鍓嶆枃浠跺す
      for (const item of currentItems) {
        result.push(item)
        if (item.children && item.children.length > 0) {
          result.push(...processTreeWithPriority(item.children, level + 1, item.fullPath))
        }
      }
      
      // 鍐嶅鐞嗗叾浠栭」
      for (const item of otherItems) {
        result.push(item)
        if (item.children && item.children.length > 0) {
          result.push(...processTreeWithPriority(item.children, level + 1, item.fullPath))
        }
      }
      
      return result
    }
    
    return processTreeWithPriority(fileTree)
  }, [fileTree, search, currentFile?.path])

  // 鑾峰彇鍙鐨勯」鐩紙鑰冭檻鎶樺彔鐘舵€侊級
  const visibleItems = useMemo(() => {
    console.log('Computing visible items. Search:', search, 'Expanded folders:', Array.from(expandedFolders))
    console.log('Processed items count:', processedItems.length)
    
    if (search.trim()) {
      // 鎼滅储妯″紡涓嬪睍绀烘墍鏈夊尮閰嶉」
      console.log('Search mode, returning all processed items')
      return processedItems
    }
    
    const result = []
    let skipUntilLevel = null
    
    for (let i = 0; i < processedItems.length; i++) {
      const item = processedItems[i]
      
      // 濡傛灉鎴戜滑鍦ㄨ烦杩囨煇涓姌鍙犳枃浠跺す鐨勫瓙椤?
      if (skipUntilLevel !== null) {
        if (item.level > skipUntilLevel) {
          console.log('Skipping child item:', item.name, 'level:', item.level)
          continue // 璺宠繃瀛愰」
        } else {
          skipUntilLevel = null // 閲嶆柊寮€濮嬪鐞?
        }
      }
      
      result.push(item)
      console.log('Added item:', item.name, 'isFolder:', item.isFolder, 'expanded:', item.isFolder ? expandedFolders.has(item.path) : 'N/A')
      
      // 濡傛灉鏄枃浠跺す涓旀病鏈夊睍寮€锛岃缃烦杩囨爣璁?
      if (item.isFolder && !expandedFolders.has(item.path)) {
        skipUntilLevel = item.level
        console.log('Setting skip level for collapsed folder:', item.name, 'level:', item.level)
      }
    }
    
    console.log('Final visible items count:', result.length)
    return result
  }, [processedItems, expandedFolders, search])

  // 閲嶆柊缃浂閫変腑绱㈠紩
  // 淇濇寔閫変腑椤圭ǔ瀹氾細
  // 1) 鎼滅储鍙樺寲鎴栨墦寮€闈㈡澘鏃堕噸缃埌绗竴涓?  // 2) 鍒楄〃闀垮害鍙樺寲鏃讹紝浠呮敹鏁涚储寮曞埌鍚堟硶鑼冨洿锛屼笉寮哄埗璺冲埌椤堕儴
  useEffect(() => { setSelectedIndex(0); if (visible) setShowSelection(false) }, [search, visible])
  useEffect(() => {
    setSelectedIndex((idx) => {
      const max = Math.max(visibleItems.length - 1, 0)
      return Math.min(idx, max)
    })
  }, [visibleItems.length])

  // 婊氬姩閫変腑椤瑰埌鍙鍖哄煙
  useEffect(() => {
    const list = listRef.current
    if (list) {
      const items = list.querySelectorAll('.file-selector-item')
      const selectedItem = items[selectedIndex]
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // 鍔犺浇鏂囦欢鏍?
  const loadFileTree = async () => {
    setLoading(true)
    try {
      const flat = await filesApi.getFileTree()
      const fileMap = new Map()
      const roots = []

      flat.forEach(f => fileMap.set(f.id, { ...f, children: [] }))
      flat.forEach(f => {
        const item = fileMap.get(f.id)
        if (f.parentId) {
          const parent = fileMap.get(f.parentId)
          if (parent) parent.children.push(item)
          else roots.push(item)
        } else {
          roots.push(item)
        }
      })

      // Sanity-check: ensure we didn't drop any nodes when nesting
      try {
        const countNested = (nodes) => nodes.reduce((sum, n) => sum + 1 + (n.children && n.children.length ? countNested(n.children) : 0), 0)
        const nestedCount = countNested(roots)
        if (nestedCount !== flat.length) {
          console.warn('FileSelector nesting mismatch:', { flat: flat.length, nested: nestedCount })
        }
      } catch {}

      setFileTree(roots)
    } catch (error) {
      console.error('加载文件树失败', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible) {
      loadFileTree()
      setSearch('')
      // 閲嶇疆灞曞紑鐘舵€侊紝浣嗚嚜鍔ㄥ睍寮€褰撳墠鏂囦欢澶?
      const currentFolder = getCurrentFileFolder()
      setExpandedFolders(currentFolder ? new Set([currentFolder]) : new Set())
      setTimeout(() => panelRef.current?.focus(), 0)
    }
  }, [visible, currentFile?.path])

  const handleFileSelect = (item) => {
    if (item.isFile) {
      onSelect?.(item)
      onClose?.()
    }
  }

  const handleFolderToggle = (folderPath) => {
    console.log('Toggle folder:', folderPath, 'Current expanded:', Array.from(expandedFolders))
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath)
        console.log('Collapsed folder:', folderPath)
      } else {
        newSet.add(folderPath)
        console.log('Expanded folder:', folderPath)
      }
      console.log('New expanded set:', Array.from(newSet))
      return newSet
    })
  }

  const handleKeyDown = (e) => {
    // 拦截在面板内处理的按键，避免冒泡导致重复处理（产生“跳两个”现象）
    const handledKeys = ['Escape', 'Enter', 'ArrowDown', 'ArrowUp']
    if (handledKeys.includes(e.key)) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (e.key === 'Escape') {
      onClose?.()
    } else if (e.key === 'Enter') {
      const target = visibleItems[selectedIndex]
      if (target) {
        if (target.isFile) {
          handleFileSelect(target)
        } else if (target.isFolder) {
          handleFolderToggle(target.path)
        }
      }
    } else if (e.key === 'ArrowDown') {
      setShowSelection(true)
      setSelectedIndex(idx => Math.min(idx + 1, Math.max(visibleItems.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      setShowSelection(true)
      setSelectedIndex(idx => Math.max(idx - 1, 0))
    }
  }

  if (!visible) return null

  return (
    <div 
      className="file-selector-overlay" 
      onClick={onClose}
    >
      <div 
        className="file-selector-panel"
        ref={panelRef}
        tabIndex="-1"
        onKeyDown={handleKeyDown}
        style={{ 
          top: Math.max(8, Math.min(position.top, window.innerHeight - 500)) + 'px',
          left: Math.max(8, Math.min(position.left, window.innerWidth - 400)) + 'px'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 鎼滅储澶撮儴 */}
        <div className="file-selector-header">
          <Search size={14} />
          <input
            type="text"
            placeholder="搜索文件和文件夹..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="file-selector-search"
          />
        </div>
        
        <div className="file-selector-body">
          {loading ? (
            <div className="file-selector-loading">加载中...</div>
          ) : visibleItems.length === 0 ? (
            <div className="file-selector-empty">
              {search ? '未找到匹配的文件' : '没有可选择的文件'}
            </div>
          ) : (
            <div className="file-selector-list" ref={listRef} onMouseDown={() => setShowSelection(false)}>
              {visibleItems.map((item, index) => (
                <div
                  key={item.path}
                  className={`file-selector-item ${showSelection && index === selectedIndex ? 'selected' : ''} ${item.isFolder ? 'folder' : 'file'}`}
                  style={{ paddingLeft: `${12 + item.level * 16}px` }}
                  onClick={() => {
                    if (item.isFile) {
                      handleFileSelect(item)
                    } else {
                      handleFolderToggle(item.path)
                    }
                  }}
                >
                  {item.isFolder && (
                    <span 
                      className="file-expand-icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFolderToggle(item.path)
                      }}
                    >
                      {expandedFolders.has(item.path) ? 
                        <ChevronDown size={14} /> : 
                        <ChevronRight size={14} />
                      }
                    </span>
                  )}
                  
                  <span className="file-icon">
                    {item.isFolder ? (
                      <Folder size={16} />
                    ) : item.name?.toLowerCase().endsWith('.excalidraw') ? (
                      <Shapes size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </span>
                  
                  <div className="file-info">
                    <div className="file-name">{item.name}</div>
                    {search && item.fullPath !== item.name && (
                      <div className="file-path">{item.fullPath}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="file-selector-footer">
          <span>↑↓ 导航 · Enter 选择/展开 · Esc 取消</span>
        </div>
      </div>
    </div>
  )
}

export default FileSelector


