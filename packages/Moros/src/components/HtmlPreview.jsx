import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js'
import EditorOverlay from './EditorOverlay'
import MarkdownEditor from './MarkdownEditor'
import { API_BASE, filesApi } from '../utils/api'
import { escapeHtml } from './utils/editorHelpers'
import './HtmlPreview.css'

const BASE_TAG_REGEX = /<base\s[^>]*>/i
const HEAD_OPEN_TAG_REGEX = /<head[^>]*>/i

function injectBaseTag(html, baseHref) {
  const source = String(html || '')
  if (!baseHref) return source

  const baseTag = `<base href="${baseHref}">`
  if (BASE_TAG_REGEX.test(source)) {
    return source.replace(BASE_TAG_REGEX, baseTag)
  }
  if (HEAD_OPEN_TAG_REGEX.test(source)) {
    return source.replace(HEAD_OPEN_TAG_REGEX, (matched) => `${matched}\n${baseTag}`)
  }
  return `${baseTag}\n${source}`
}

function HtmlPreview({
  currentFile,
  parentDirName,
  content,
  textareaRef,
  onChange,
  onKeyDown,
  onClick,
  onDrop,
  onDragOver,
  onScroll,
}) {
  const [panelMode, setPanelMode] = useState('split')
  const [absolutePath, setAbsolutePath] = useState('')
  const layerRef = useRef(null)
  const highlightRef = useRef(null)

  const deferredContent = useDeferredValue(content)

  useEffect(() => {
    let cancelled = false
    setPanelMode('split')
    setAbsolutePath('')

    if (!currentFile?.path) return undefined

    void filesApi.getAbsolutePath(currentFile.path)
      .then((resolvedPath) => {
        if (!cancelled) {
          setAbsolutePath(String(resolvedPath || ''))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAbsolutePath('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentFile?.path])

  const previewUrl = useMemo(() => {
    return absolutePath ? filesApi.getRawAbsoluteHtmlUrl(absolutePath) : ''
  }, [absolutePath])

  const baseHref = useMemo(() => {
    if (!absolutePath) return ''
    const directory = absolutePath.replace(/[\\/][^\\/]+$/, '')
    return `${API_BASE}/files/raw-absolute-root/${encodeURIComponent(directory)}/`
  }, [absolutePath])

  const previewDocument = useMemo(() => {
    return injectBaseTag(deferredContent, baseHref)
  }, [baseHref, deferredContent])

  const renderHighlighted = useMemo(() => {
    const source = String(content || '')
    if (!source) return ''

    try {
      const highlighted = hljs.highlight(source, { language: 'xml', ignoreIllegals: true }).value
      return `<span class="hljs">${highlighted}</span>`
    } catch {
      return escapeHtml(source)
    }
  }, [content])

  const showCode = panelMode === 'code' || panelMode === 'split'
  const showPreview = panelMode === 'preview' || panelMode === 'split'

  const handleCodeScroll = useCallback((event) => {
    const el = event?.target
    const layer = layerRef.current
    if (!el || !layer) return
    layer.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`
  }, [])

  return (
    <main className="main-content">
      <div className="content-toolbar">
        <div className="file-info">
          {parentDirName && <span className="folder-name">{parentDirName}</span>}
          {parentDirName && <span className="breadcrumb-sep">/</span>}
          <span className="file-name">{currentFile?.name}</span>
        </div>

        <div className="toolbar-meta html-refined-toolbar-meta">
          <div className="html-refined-mode-switch" role="tablist" aria-label="HTML view mode">
            <button
              type="button"
              className={`html-refined-mode-btn ${panelMode === 'code' ? 'active' : ''}`}
              onClick={() => setPanelMode('code')}
            >
              Code
            </button>
            <button
              type="button"
              className={`html-refined-mode-btn ${panelMode === 'split' ? 'active' : ''}`}
              onClick={() => setPanelMode('split')}
            >
              Split
            </button>
            <button
              type="button"
              className={`html-refined-mode-btn ${panelMode === 'preview' ? 'active' : ''}`}
              onClick={() => setPanelMode('preview')}
            >
              Preview
            </button>
          </div>
          {previewUrl && (
            <a className="html-refined-open-link" href={previewUrl} target="_blank" rel="noreferrer">
              Open separately
            </a>
          )}
        </div>
      </div>

      <div className="content-wrapper html-refined-wrapper">
        <section className={`html-refined-shell mode-${panelMode}`}>
          {showCode && (
            <section className="html-refined-pane html-refined-code-pane">
              <div className="html-refined-code-surface html-refined-editor-container">
                <EditorOverlay
                  layerRef={layerRef}
                  highlightRef={highlightRef}
                  renderHtml={renderHighlighted}
                />
                <MarkdownEditor
                  textareaRef={textareaRef}
                  value={content}
                  onChange={onChange}
                  placeholder="<!doctype html>"
                  onKeyDown={onKeyDown}
                  onClick={onClick}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onScroll={handleCodeScroll}
                  className="markdown-editor html-refined-code-editor"
                />
              </div>
            </section>
          )}

          {showPreview && (
            <section className="html-refined-pane html-refined-preview-pane">
              <div className="html-refined-preview-surface">
                {absolutePath ? (
                  <iframe
                    className="html-refined-iframe"
                    title={currentFile?.name || 'HTML preview'}
                    src={previewUrl || undefined}
                    srcDoc={previewDocument}
                    sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups"
                  />
                ) : (
                  <div className="html-refined-preview-empty">
                    Preparing preview...
                  </div>
                )}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  )
}

export default HtmlPreview
