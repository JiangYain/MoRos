import React from 'react'

function ArtifactPreviewPane({
  activeArtifact,
  activeArtifactUrl,
  activeArtifactIsImage,
  onClosePreview,
  onRevealArtifact,
  showRevealAction = false,
}) {
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
          {activeArtifactUrl && (
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
        {activeArtifactUrl ? (
          activeArtifactIsImage ? (
            <div className="chat-artifacts-image-wrap">
              <img src={activeArtifactUrl} alt={activeArtifact.name} className="chat-artifacts-image" />
            </div>
          ) : (
            <iframe
              className="chat-artifacts-iframe"
              title={activeArtifact.name}
              src={activeArtifactUrl}
              sandbox="allow-same-origin allow-scripts"
            />
          )
        ) : (
          <div className="chat-artifacts-content-empty">
            无法预览此文件
          </div>
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
                <div className="chat-artifacts-placeholder">暂无文件</div>
              )}
              {filteredArtifactEntries.map((entry) => {
                const isFolder = entry.type === 'folder'
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`chat-artifact-file ${entry.id === activeArtifactId ? 'active' : ''}`}
                    onClick={() => onSelectArtifact(entry.id)}
                  >
                    <span className="chat-artifact-file-icon">
                      {isFolder ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      )}
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
