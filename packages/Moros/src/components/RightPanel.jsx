import React, { useEffect, useState, useMemo } from 'react'
import MarkdownPreview from './MarkdownPreview'
import RichHtmlPreview from './RichHtmlPreview'
import ExportToolbar from './ExportToolbar'
import { buildMarkdownComponents } from './markdownComponents.jsx'
import './RightPanel.css'

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])
const HTML_EXTENSIONS = new Set(['html', 'htm'])
const CODE_LANGUAGE_MAP = {
  js: 'javascript',
  cjs: 'javascript',
  mjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  rb: 'ruby',
  php: 'php',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  env: 'bash',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  xml: 'xml',
  sql: 'sql',
  vue: 'vue',
  svelte: 'svelte',
}

const getFileExtension = (currentFile) => {
  const filePath = String(currentFile?.path || currentFile?.name || '').trim()
  if (!filePath) return ''
  const parts = filePath.split('.')
  if (parts.length < 2) return ''
  return String(parts.pop() || '').toLowerCase()
}

const resolvePreviewKind = (currentFile) => {
  const extension = getFileExtension(currentFile)
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
  if (HTML_EXTENSIONS.has(extension)) return 'html'
  return 'code'
}

const resolveCodeLanguage = (currentFile) => {
  const extension = getFileExtension(currentFile)
  if (extension && CODE_LANGUAGE_MAP[extension]) return CODE_LANGUAGE_MAP[extension]
  const filename = String(currentFile?.name || '').toLowerCase()
  if (filename === 'dockerfile') return 'dockerfile'
  return extension || 'text'
}

function RightPanel({ currentFile, content, viewMode, previewPaneRef, onPreviewScroll, onEditStyles, customCSS, onCloseStylePanel }) {
  const components = useMemo(() => buildMarkdownComponents(), [])
  const [previewMode, setPreviewMode] = useState('markdown')
  const previewKind = useMemo(() => resolvePreviewKind(currentFile), [currentFile])
  const showExportToolbar = previewKind === 'markdown'
  const activePreviewMode = previewKind === 'markdown' ? previewMode : previewKind
  const previewKey = `${activePreviewMode}:${String(currentFile?.path || currentFile?.name || '')}`
  const codePreviewContent = useMemo(() => {
    if (previewKind !== 'code') return ''
    const language = resolveCodeLanguage(currentFile)
    const body = String(content || '')
    return `~~~${language}\n${body}\n~~~`
  }, [content, currentFile, previewKind])

  useEffect(() => {
    if (previewKind !== 'markdown') {
      onCloseStylePanel?.()
    }
  }, [onCloseStylePanel, previewKind])
  
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
        {showExportToolbar && (
          <ExportToolbar
            currentFile={currentFile}
            previewPaneRef={previewPaneRef}
            previewMode={previewMode}
            onChangePreviewMode={handlePreviewModeChange}
            onEditStyles={onEditStyles}
          />
        )}
        <div className={`preview-content-wrapper${showExportToolbar ? '' : ' without-toolbar'}`} key={previewKey}>
          <div className={`preview-content-inner preview-${activePreviewMode}`}>
            {previewKind === 'html' ? (
              <div className="preview-pane html-preview-pane" ref={previewPaneRef} onScroll={handlePreviewScroll}>
                <iframe
                  className="html-preview-frame"
                  title={`${currentFile?.name || 'document'} preview`}
                  srcDoc={String(content || '')}
                  sandbox="allow-same-origin allow-scripts"
                />
              </div>
            ) : previewKind === 'code' ? (
              <MarkdownPreview
                content={codePreviewContent}
                components={components}
                paneRef={previewPaneRef}
                onScroll={handlePreviewScroll}
              />
            ) : previewMode === 'rich-html' ? (
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