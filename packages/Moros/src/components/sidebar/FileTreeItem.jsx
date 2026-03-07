import React, { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  FileText,
  Folder,
  FolderOpen,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Shapes,
} from 'lucide-react'
import { filesApi } from '../../utils/api'
import { useI18n } from '../../utils/i18n'

function FileTreeItem({
  item,
  level = 0,
  onFileClick,
  onContextMenu,
  onRename,
  creatingItem,
  onFinishCreating,
  onCancelCreating,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  onDragEnd,
  dragOverItem,
  dragOverPosition,
  isDragging,
  highlightPath,
  activePath,
  onHoverStart,
  onHoverEnd,
  hoverPreview,
  expandedFolders,
  onToggleFolder,
  collapsed,
  showFileExtensions,
  multiSelectMode,
  selectedPaths,
  onSelectToggle,
  onEnterMultiSelect,
  onOpenCreateMenu,
  onFolderColorPick,
}) {
  const { t } = useI18n()
  const expanded = item.type === 'folder' ? expandedFolders.has(item.path) : undefined
  const [editName, setEditName] = useState(item.name)
  const longPressTimerRef = React.useRef(null)
  const longPressTriggeredRef = React.useRef(false)
  const renameCommittedRef = React.useRef(false)
  const indentPx = collapsed ? 8 : (12 + level * 14)
  const childIndentPx = collapsed ? 8 : (12 + (level + 1) * 14)

  useEffect(() => {
    if (item.isEditing) {
      renameCommittedRef.current = false
      const nameWithoutExt = (item.name || '').replace(/\.(md|excalidraw|moros)$/i, '')
      setEditName(nameWithoutExt)
    }
  }, [item.isEditing, item.name])

  const handleClick = () => {
    if (item.isEditing) return
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
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
    }, 600)
  }

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleDragStartWrapper = (e) => {
    clearLongPress()
    onDragStart?.(e, item)
  }

  const commitRename = async () => {
    if (renameCommittedRef.current) return
    renameCommittedRef.current = true
    const raw = editName.trim()
    const nameWithoutExt = (item.name || '').replace(/\.(md|excalidraw|moros)$/i, '')
    if (raw && raw !== nameWithoutExt) {
      try {
        const hasUserExt = /\.[^\s.]+$/i.test(raw)
        let finalName = raw
        if (!hasUserExt) {
          if (/\.md$/i.test(item.name)) finalName = `${raw}.md`
          else if (/\.excalidraw$/i.test(item.name)) finalName = `${raw}.excalidraw`
          else if (/\.moros$/i.test(item.name)) finalName = `${raw}.MoRos`
        }
        await filesApi.renameItem(item.path, finalName)
      } catch (error) {
        console.error('重命名失败:', error)
        setEditName(nameWithoutExt)
      }
    }
    onRename?.()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      renameCommittedRef.current = true
      onRename?.()
    }
  }

  const handleOpenCreateMenu = (e) => {
    e.stopPropagation()
    onOpenCreateMenu?.(e, item)
  }

  const handleOpenFolderColorPicker = (e) => {
    if (item.type !== 'folder') return
    e.stopPropagation()
    onFolderColorPick?.(e, item)
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

          <span
            className={`file-icon ${item.type === 'folder' ? 'folder-color-trigger' : ''}`}
            style={{ color: item.color || undefined }}
            onClick={item.type === 'folder' ? handleOpenFolderColorPicker : undefined}
            title={item.type === 'folder' ? t('sidebar.context.set_color') : undefined}
          >
            {item.type === 'folder'
              ? (expanded ? <FolderOpen size={16} /> : <Folder size={16} />)
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
              onBlur={commitRename}
              onKeyDown={handleKeyDown}
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
            <span className={`bulk-check ${selectedPaths?.has(item.path) ? 'checked' : ''}`} aria-hidden />
          )}
        </div>

        {!multiSelectMode && (
          <div className="file-item-actions">
            {item.type === 'folder' && (
              <button
                className="file-quick-add-btn"
                onClick={handleOpenCreateMenu}
                title="New"
              >
                <Plus size={12} />
              </button>
            )}
            <button
              className="file-menu-btn"
              onClick={(e) => {
                e.stopPropagation()
                onContextMenu?.(e, item)
              }}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
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
              onOpenCreateMenu={onOpenCreateMenu}
              onFolderColorPick={onFolderColorPick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FileTreeItem
