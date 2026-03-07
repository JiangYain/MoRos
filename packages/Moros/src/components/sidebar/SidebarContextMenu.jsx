import React from 'react'
import {
  Copy,
  Edit,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  MessageSquare,
  Palette,
  Shapes,
  Trash2,
} from 'lucide-react'

function SidebarContextMenu({
  contextMenu,
  contextMenuRef,
  t,
  canCreateConversationalFiles,
  onCreateAction,
  onOpenReview,
  onRevealInExplorer,
  onAddToMoRos,
  onCopyPath,
  onRename,
  onShowColorPicker,
  onDelete,
  onClose,
}) {
  if (!contextMenu) return null

  const contextItem = contextMenu.item
  const folderCreatePath = contextItem?.type === 'folder' ? contextItem.path : undefined
  const showFolderNewMoros = Boolean(
    folderCreatePath && canCreateConversationalFiles(folderCreatePath),
  )

  return (
    <div
      className="context-menu"
      ref={contextMenuRef}
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {contextItem ? (
        <>
          {showFolderNewMoros && (
            <button className="context-menu-item" onClick={() => {
              onCreateAction('moros', folderCreatePath)
              onClose()
            }}>
              <MessageSquare size={14} /> {t('sidebar.context.new_moros')}
            </button>
          )}
          <button className="context-menu-item" onClick={() => {
            onOpenReview(contextItem)
            onClose()
          }}>
            <FileText size={14} /> Open Review
          </button>
          <button className="context-menu-item" onClick={() => {
            void onRevealInExplorer(contextItem)
            onClose()
          }}>
            <FolderOpen size={14} /> reveal in File Explorer
          </button>
          <button className="context-menu-item" onClick={() => {
            void onAddToMoRos(contextItem)
            onClose()
          }}>
            <MessageSquare size={14} /> Add to MoRos
          </button>
          <button className="context-menu-item" onClick={() => {
            void onCopyPath(contextItem)
            onClose()
          }}>
            <Copy size={14} /> Copy Path
          </button>
          <button className="context-menu-item" onClick={() => {
            onRename(contextItem)
            onClose()
          }}>
            <Edit size={14} /> Rename...
          </button>
          <button
            className="context-menu-item"
            style={contextItem.color ? { color: contextItem.color } : undefined}
            onClick={(e) => onShowColorPicker(e, contextItem)}
          >
            <Palette size={14} style={{ color: 'currentColor' }} />
            Set Color
          </button>
          <hr />
          <button className="context-menu-item danger" onClick={() => {
            onDelete(contextItem)
            onClose()
          }}>
            <Trash2 size={14} /> Delete
          </button>
        </>
      ) : (
        <>
          <div className="context-menu-section-title">Create</div>
          {canCreateConversationalFiles(contextMenu.parentPath) && (
            <button className="context-menu-item" onClick={() => onCreateAction('moros', contextMenu.parentPath)}>
              <MessageSquare size={14} /> {t('sidebar.context.new_moros')}
            </button>
          )}
          <button className="context-menu-item" onClick={() => onCreateAction('file', contextMenu.parentPath)}>
            <FilePlus size={14} /> {t('sidebar.context.new_file')}
          </button>
          {canCreateConversationalFiles(contextMenu.parentPath) && (
            <button className="context-menu-item" onClick={() => onCreateAction('whiteboard', contextMenu.parentPath)}>
              <Shapes size={14} /> {t('sidebar.context.new_whiteboard')}
            </button>
          )}
          <button className="context-menu-item" onClick={() => onCreateAction('folder', contextMenu.parentPath)}>
            <FolderPlus size={14} /> {t('sidebar.context.new_folder')}
          </button>
        </>
      )}
    </div>
  )
}

export default SidebarContextMenu
