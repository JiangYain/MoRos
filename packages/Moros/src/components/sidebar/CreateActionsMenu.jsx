import React from 'react'
import { FilePlus, FolderPlus, MessageSquare, Shapes } from 'lucide-react'

function CreateActionsMenu({
  createMenu,
  createMenuRef,
  t,
  canCreateConversationalFiles,
  onCreateAction,
}) {
  if (!createMenu) return null

  return (
    <div
      className="context-menu"
      ref={createMenuRef}
      style={{ left: createMenu.x, top: createMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="context-menu-section-title">Create</div>
      {canCreateConversationalFiles(createMenu.parentPath) && (
        <button className="context-menu-item" onClick={() => onCreateAction('moros', createMenu.parentPath)}>
          <MessageSquare size={14} /> {t('sidebar.context.new_moros')}
        </button>
      )}
      <button className="context-menu-item" onClick={() => onCreateAction('file', createMenu.parentPath)}>
        <FilePlus size={14} /> {t('sidebar.context.new_file')}
      </button>
      {canCreateConversationalFiles(createMenu.parentPath) && (
        <button className="context-menu-item" onClick={() => onCreateAction('whiteboard', createMenu.parentPath)}>
          <Shapes size={14} /> {t('sidebar.context.new_whiteboard')}
        </button>
      )}
      <button className="context-menu-item" onClick={() => onCreateAction('folder', createMenu.parentPath)}>
        <FolderPlus size={14} /> {t('sidebar.context.new_folder')}
      </button>
    </div>
  )
}

export default CreateActionsMenu
