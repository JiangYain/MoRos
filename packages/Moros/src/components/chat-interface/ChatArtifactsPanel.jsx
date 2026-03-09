import React, { useEffect, useMemo, useState } from 'react'
import { filesApi } from '../../utils/api'
import { isTextArtifactPath } from './artifacts'
import FileTypeIcon from './FileTypeIcon'

function ArtifactPreviewPane({
  activeArtifact,
  activeArtifactUrl,
  activeArtifactRawUrl,
  activeArtifactExtension,
  activeArtifactIsImage,
  onClosePreview,
  onRevealArtifact,
  showRevealAction = false,
}) {
  const [textContent, setTextContent] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState('')
  const [htmlPreviewMode, setHtmlPreviewMode] = useState('code')

  const isUrlArtifact = activeArtifact?.artifactType === 'url'
  const normalizedExtension = String(activeArtifactExtension || '').toLowerCase()
  const isHtmlArtifact = normalizedExtension === '.html' || normalizedExtension === '.htm'
  const isTextPreview = useMemo(() => {
    if (!activeArtifact) return false
    if (isUrlArtifact) return false
    if (activeArtifactIsImage) return false
    return isTextArtifactPath(activeArtifactExtension || activeArtifact?.path || activeArtifact?.relativePath || '')
  }, [activeArtifact, isUrlArtifact, activeArtifactIsImage, activeArtifactExtension])

  useEffect(() => {
    setHtmlPreviewMode('code')
  }, [activeArtifact?.id])

  useEffect(() => {
    let disposed = false
    if (!activeArtifact || !isTextPreview) {
      setTextContent('')
      setTextError('')
      setTextLoading(false)
      return () => {
        disposed = true
      }
    }

    const loadText = async () => {
      setTextLoading(true)
      setTextError('')
      try {
        const relativePath = String(activeArtifact?.relativePath || '').trim()
        let content = ''
        if (relativePath) {
          content = await filesApi.readFile(relativePath)
        } else if (activeArtifactRawUrl) {
          const response = await fetch(activeArtifactRawUrl)
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }
          content = await response.text()
        } else {
          throw new Error('缺少可读取的文件地址')
        }
        if (disposed) return
        setTextContent(String(content || ''))
      } catch (error) {
        if (disposed) return
        setTextError(String(error?.message || '读取文件内容失败'))
        setTextContent('')
      } finally {
        if (!disposed) {
          setTextLoading(false)
        }
      }
    }

    void loadText()
    return () => {
      disposed = true
    }
  }, [activeArtifact?.id, activeArtifactRawUrl, isTextPreview])

  if (!activeArtifact) {
    return <div className="chat-artifacts-content-empty">选择文件以预览</div>
  }

  return (
    <>
      <div className="chat-artifacts-content-header">
        <div className="chat-artifacts-content-tab">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          <span>{activeArtifact.name}</span>
          <button
            type="button"
            className="chat-artifacts-tab-close"
            onClick={onClosePreview}
            aria-label="关闭预览"
          >×</button>
        </div>
        <div className="chat-artifacts-content-actions">
          {showRevealAction && activeArtifact.relativePath && (
            <button
              type="button"
              className="chat-artifacts-action-btn"
              onClick={onRevealArtifact}
              title="在文件管理器中打开"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            </button>
          )}
          {isUrlArtifact && activeArtifactUrl && (
            <a
              className="chat-artifacts-action-btn"
              href={activeArtifactUrl}
              target="_blank"
              rel="noreferrer"
              title="打开端口页面"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            </a>
          )}
          {!isUrlArtifact && activeArtifactUrl && (
            <a
              className="chat-artifacts-action-btn"
              href={activeArtifactUrl}
              download={activeArtifact.name}
              title="下载"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </a>
          )}
        </div>
      </div>
      <div className="chat-artifacts-content-path">{activeArtifact.path}</div>
      <div className="chat-artifacts-content-preview">
        {isUrlArtifact ? (
          activeArtifactUrl ? (
            <iframe
              className="chat-artifacts-iframe"
              title={activeArtifact.name}
              src={activeArtifactUrl}
              sandbox="allow-same-origin allow-scripts"
            />
          ) : (
            <div className="chat-artifacts-content-empty">端口地址不可用</div>
          )
        ) : activeArtifactIsImage && activeArtifactUrl ? (
          <div className="chat-artifacts-image-wrap">
            <img src={activeArtifactUrl} alt={activeArtifact.name} className="chat-artifacts-image" />
          </div>
        ) : isTextPreview ? (
          <div className="chat-artifacts-text-preview-wrap">
            <div className="chat-artifacts-text-preview-toolbar">
              <span className="chat-artifacts-text-preview-label">
                代码视图 {normalizedExtension ? `(${normalizedExtension})` : ''}
              </span>
              {isHtmlArtifact && (
                <div className="chat-artifacts-html-toggle">
                  <button
                    type="button"
                    className={`chat-artifacts-html-toggle-btn ${htmlPreviewMode === 'code' ? 'active' : ''}`}
                    onClick={() => setHtmlPreviewMode('code')}
                  >
                    代码
                  </button>
                  <button
                    type="button"
                    className={`chat-artifacts-html-toggle-btn ${htmlPreviewMode === 'preview' ? 'active' : ''}`}
                    onClick={() => setHtmlPreviewMode('preview')}
                  >
                    预览
                  </button>
                </div>
              )}
            </div>
            {textLoading ? (
              <div className="chat-artifacts-content-empty">读取中…</div>
            ) : textError ? (
              <div className="chat-artifacts-placeholder error">{textError}</div>
            ) : isHtmlArtifact && htmlPreviewMode === 'preview' && activeArtifactUrl ? (
              <iframe
                className="chat-artifacts-iframe"
                title={activeArtifact.name}
                src={activeArtifactUrl}
                sandbox="allow-same-origin allow-scripts"
              />
            ) : (
              <textarea
                className="chat-artifacts-code-viewer"
                value={textContent}
                readOnly
                spellCheck={false}
              />
            )}
          </div>
        ) : activeArtifactUrl ? (
          <iframe
            className="chat-artifacts-iframe"
            title={activeArtifact.name}
            src={activeArtifactUrl}
            sandbox="allow-same-origin allow-scripts"
          />
        ) : (
          <div className="chat-artifacts-content-empty">无法预览此文件</div>
        )}
      </div>
    </>
  )
}

function ChatArtifactsPanel({
  open,
  artifactsTab,
  onTabChange,
  onClose,
  onRefresh,
  artifactsLoading,
  artifactsError,
  artifactSearchTerm,
  onArtifactSearchTermChange,
  filteredArtifactEntries,
  activeArtifactId,
  onSelectArtifact,
  formatFileSize,
  activeArtifact,
  activeArtifactUrl,
  activeArtifactRawUrl,
  activeArtifactExtension,
  activeArtifactIsImage,
  onClosePreview,
  onRevealArtifact,
}) {
  if (!open) return null

  return (
    <aside className="chat-artifacts-panel">
      <div className="chat-artifacts-header">
        <nav className="chat-artifacts-tabs">
          {['files', 'preview'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`chat-artifacts-tab ${artifactsTab === tab ? 'active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab === 'files' ? '文件' : '预览'}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="chat-artifacts-close"
          onClick={onClose}
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      {artifactsTab === 'files' && (
        <div className="chat-artifacts-body chat-artifacts-split">
          <div className="chat-artifacts-sidebar">
            <div className="chat-artifacts-sidebar-top">
              <span className="chat-artifacts-sidebar-title">Files</span>
              <button
                type="button"
                className="chat-artifacts-refresh-btn"
                onClick={onRefresh}
                disabled={artifactsLoading}
                aria-label="刷新"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
              </button>
            </div>
            <div className="chat-artifacts-search-wrap">
              <input
                type="text"
                className="chat-artifacts-search"
                placeholder="Search Files..."
                value={artifactSearchTerm}
                onChange={(e) => onArtifactSearchTermChange(e.target.value)}
              />
            </div>
            <div className="chat-artifacts-file-list">
              {artifactsLoading && filteredArtifactEntries.length === 0 && (
                <div className="chat-artifacts-placeholder">读取中…</div>
              )}
              {!artifactsLoading && artifactsError && (
                <div className="chat-artifacts-placeholder error">{artifactsError}</div>
              )}
              {!artifactsLoading && !artifactsError && filteredArtifactEntries.length === 0 && (
                <div className="chat-artifacts-placeholder">暂无当前会话文件或端口</div>
              )}
              {filteredArtifactEntries.map((entry) => {
                const isFolder = entry.type === 'folder'
                const isUrlArtifact = entry.artifactType === 'url'
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`chat-artifact-file ${entry.id === activeArtifactId ? 'active' : ''}`}
                    onClick={() => onSelectArtifact(entry.id)}
                  >
                    <span className="chat-artifact-file-icon">
                      <FileTypeIcon
                        pathValue={entry.relativePath || entry.path}
                        nameValue={entry.name}
                        isFolder={isFolder}
                        isUrl={isUrlArtifact}
                        className="chat-artifact-file-icon-image"
                      />
                    </span>
                    <span className="chat-artifact-file-name">{entry.name}</span>
                    {entry.size != null && (
                      <span className="chat-artifact-file-size">{formatFileSize(entry.size)}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="chat-artifacts-content">
            <ArtifactPreviewPane
              activeArtifact={activeArtifact}
              activeArtifactUrl={activeArtifactUrl}
              activeArtifactRawUrl={activeArtifactRawUrl}
              activeArtifactExtension={activeArtifactExtension}
              activeArtifactIsImage={activeArtifactIsImage}
              onClosePreview={onClosePreview}
              onRevealArtifact={onRevealArtifact}
            />
          </div>
        </div>
      )}

      {artifactsTab === 'preview' && (
        <div className="chat-artifacts-body">
          <div className="chat-artifacts-content" style={{ flex: 1 }}>
            <ArtifactPreviewPane
              activeArtifact={activeArtifact}
              activeArtifactUrl={activeArtifactUrl}
              activeArtifactRawUrl={activeArtifactRawUrl}
              activeArtifactExtension={activeArtifactExtension}
              activeArtifactIsImage={activeArtifactIsImage}
              onClosePreview={onClosePreview}
              onRevealArtifact={onRevealArtifact}
              showRevealAction
            />
          </div>
        </div>
      )}
    </aside>
  )
}

export default ChatArtifactsPanel
