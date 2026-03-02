import React, { useState, useMemo } from 'react'
import MarkdownPreview from './MarkdownPreview'
import RichHtmlPreview from './RichHtmlPreview'
import ExportToolbar from './ExportToolbar'
import { buildMarkdownComponents } from './markdownComponents.jsx'
import './RightPanel.css'

function RightPanel({ currentFile, content, viewMode, previewPaneRef, onPreviewScroll, onEditStyles, customCSS, onCloseStylePanel }) {
  const components = useMemo(() => buildMarkdownComponents(), [])
  const [previewMode, setPreviewMode] = useState('markdown')
  
  // 处理预览模式变化，当切换到markdown预览时关闭样式面板
  const handlePreviewModeChange = (newMode) => {
    if (newMode === 'markdown' && onCloseStylePanel) {
      onCloseStylePanel()
    }
    setPreviewMode(newMode)
  }

  const handlePreviewScroll = () => {
    if (viewMode === 'split') {
      onPreviewScroll?.('preview')
      // 通知覆盖层更新
      if (window.updateOverlay) {
        requestAnimationFrame(window.updateOverlay)
      }
    }
  }

  if (viewMode !== 'split') return null

  return (
    <aside className="right-panel">
      <div className="preview-panel">
        <ExportToolbar
          currentFile={currentFile}
          previewPaneRef={previewPaneRef}
          previewMode={previewMode}
          onChangePreviewMode={handlePreviewModeChange}
          onEditStyles={onEditStyles}
        />
        <div className="preview-content-wrapper" key={previewMode}>
          <div className={`preview-content-inner preview-${previewMode}`}>
            {previewMode === 'rich-html' ? (
              <RichHtmlPreview
                content={content}
                paneRef={previewPaneRef}
                onScroll={handlePreviewScroll}
                customCSS={customCSS}
              />
            ) : (
              <MarkdownPreview
                content={content}
                components={components}
                paneRef={previewPaneRef}
                onScroll={handlePreviewScroll}
              />
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

export default RightPanel