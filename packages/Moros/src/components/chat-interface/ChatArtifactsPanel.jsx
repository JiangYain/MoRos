import React, { useEffect, useMemo, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import { filesApi } from '../../utils/api'
import { isTextArtifactPath } from './artifacts'
import FileTypeIcon from './FileTypeIcon'
import '@excalidraw/excalidraw/index.css'

function ArtifactPreviewPane({
  activeArtifact,
  activeArtifactId,
  previewTabs,
  activeArtifactUrl,
  activeArtifactRawUrl,
  activeArtifactExtension,
  activeArtifactIsImage,
  onSelectPreviewTab,
  onClosePreviewTab,
  onRevealArtifact,
  showRevealAction = false,
}) {
  const [textContent, setTextContent] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState('')
  const [textPreviewMode, setTextPreviewMode] = useState('code')

  const isUrlArtifact = activeArtifact?.artifactType === 'url'
  const normalizedExtension = String(activeArtifactExtension || '').toLowerCase()
  const isHtmlArtifact = normalizedExtension === '.html' || normalizedExtension === '.htm'
  const isExcalidrawArtifact = normalizedExtension === '.excalidraw'
  const supportsRichPreview = isHtmlArtifact || isExcalidrawArtifact
  const isTextPreview = useMemo(() => {
    if (!activeArtifact) return false
    if (isUrlArtifact) return false
    if (activeArtifactIsImage) return false
    return isTextArtifactPath(activeArtifactExtension || activeArtifact?.path || activeArtifact?.relativePath || '')
  }, [activeArtifact, isUrlArtifact, activeArtifactIsImage, activeArtifactExtension])

  useEffect(() => {
    setTextPreviewMode(supportsRichPreview ? 'preview' : 'code')
  }, [activeArtifact?.id, supportsRichPreview])

  const excalidrawPreviewData = useMemo(() => {
    if (!isExcalidrawArtifact || !textContent) return null
    try {
      const parsed = JSON.parse(String(textContent || '{}'))
      const elements = Array.isArray(parsed?.elements) ? parsed.elements : []
      const files = parsed?.files && typeof parsed.files === 'object' ? parsed.files : {}
      const appState = parsed?.appState && typeof parsed.appState === 'object'
        ? parsed.appState
        : {}
      return {
        type: 'excalidraw',
        version: 2,
        elements,
        files,
        appState: {
          ...appState,
          collaborators: [],
          viewModeEnabled: true,
        },
      }
    } catch {
      return null
    }
  }, [isExcalidrawArtifact, textContent])

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
        <div className="chat-artifacts-content-tabs">
          {previewTabs.map((tab) => {
            const isActive = tab.id === activeArtifactId
            const tabPathValue = tab.relativePath || tab.path
            return (
              <div
                key={tab.id}
                className={`chat-artifacts-content-tab ${isActive ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPreviewTab?.(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onSelectPreviewTab?.(tab.id)
                  }
                }}
                title={tab.name}
              >
                <span className="chat-artifacts-content-tab-icon">
                  <FileTypeIcon
                    pathValue={tabPathValue}
                    nameValue={tab.name}
                    isFolder={false}
                    isUrl={tab.artifactType === 'url'}
                    className="chat-artifact-file-icon-image"
                  />
                </span>
                <span className="chat-artifacts-content-tab-name">{tab.name}</span>
                <button
                  type="button"
                  className="chat-artifacts-tab-close"
                  onClick={(event) => {
                    event.stopPropagation()
                    onClosePreviewTab?.(tab.id)
                  }}
                  aria-label={`关闭 ${tab.name}`}
                >
                  ×
                </button>
              </div>
            )
          })}
          {previewTabs.length === 0 && (
            <div className="chat-artifacts-content-tab empty">
              <span className="chat-artifacts-content-tab-name">未打开预览标签</span>
            </div>
          )}
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
                {textPreviewMode === 'preview' ? '预览视图' : '代码视图'} {normalizedExtension ? `(${normalizedExtension})` : ''}
              </span>
              {supportsRichPreview && (
                <div className="chat-artifacts-html-toggle">
                  <button
                    type="button"
                    className={`chat-artifacts-html-toggle-btn ${textPreviewMode === 'code' ? 'active' : ''}`}
                    onClick={() => setTextPreviewMode('code')}
                  >
                    代码
                  </button>
                  <button
                    type="button"
                    className={`chat-artifacts-html-toggle-btn ${textPreviewMode === 'preview' ? 'active' : ''}`}
                    onClick={() => setTextPreviewMode('preview')}
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
            ) : textPreviewMode === 'preview' && isHtmlArtifact && activeArtifactUrl ? (
              <iframe
                className="chat-artifacts-iframe"
                title={activeArtifact.name}
                src={activeArtifactUrl}
                sandbox="allow-same-origin allow-scripts"
              />
            ) : textPreviewMode === 'preview' && isExcalidrawArtifact ? (
              excalidrawPreviewData ? (
                <div className="chat-artifacts-excalidraw-preview">
                  <Excalidraw
                    viewModeEnabled
                    initialData={excalidrawPreviewData}
                    UIOptions={{
                      canvasActions: {
                        changeViewBackgroundColor: false,
                        clearCanvas: false,
                        export: false,
                        loadScene: false,
                        saveAsImage: false,
                        saveToActiveFile: false,
                        toggleTheme: false,
                      },
                    }}
                  />
                </div>
              ) : (
                <div className="chat-artifacts-content-empty">Excalidraw 文件内容无效，无法预览</div>
              )
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
  artifactEntries,
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
  const [previewTabIds, setPreviewTabIds] = useState([])

  useEffect(() => {
    if (!activeArtifactId) return
    setPreviewTabIds((prev) => (prev.includes(activeArtifactId) ? prev : [...prev, activeArtifactId]))
  }, [activeArtifactId])

  useEffect(() => {
    const validIds = new Set((artifactEntries || []).map((entry) => entry.id))
    setPreviewTabIds((prev) => prev.filter((id) => validIds.has(id)))
  }, [artifactEntries])

  const previewTabs = useMemo(() => {
    const entryMap = new Map((artifactEntries || []).map((entry) => [entry.id, entry]))
    return previewTabIds
      .map((tabId) => entryMap.get(tabId))
      .filter(Boolean)
  }, [artifactEntries, previewTabIds])

  const handleSelectPreviewTab = (artifactId) => {
    if (!artifactId) return
    onSelectArtifact?.(artifactId)
    onTabChange?.('preview')
  }

  const handleClosePreviewTab = (artifactId) => {
    if (!artifactId) return
    setPreviewTabIds((prev) => {
      const currentIndex = prev.indexOf(artifactId)
      if (currentIndex < 0) return prev
      const next = prev.filter((id) => id !== artifactId)
      if (artifactId === activeArtifactId) {
        const fallbackId = next[currentIndex] || next[currentIndex - 1] || ''
        if (fallbackId) {
          onSelectArtifact?.(fallbackId)
          onTabChange?.('preview')
        } else {
          onClosePreview?.()
        }
      }
      return next
    })
  }

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
              activeArtifactId={activeArtifactId}
              previewTabs={previewTabs}
              activeArtifactUrl={activeArtifactUrl}
              activeArtifactRawUrl={activeArtifactRawUrl}
              activeArtifactExtension={activeArtifactExtension}
              activeArtifactIsImage={activeArtifactIsImage}
              onSelectPreviewTab={handleSelectPreviewTab}
              onClosePreviewTab={handleClosePreviewTab}
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
              activeArtifactId={activeArtifactId}
              previewTabs={previewTabs}
              activeArtifactUrl={activeArtifactUrl}
              activeArtifactRawUrl={activeArtifactRawUrl}
              activeArtifactExtension={activeArtifactExtension}
              activeArtifactIsImage={activeArtifactIsImage}
              onSelectPreviewTab={handleSelectPreviewTab}
              onClosePreviewTab={handleClosePreviewTab}
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
