import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { filesApi } from '../utils/api'
import './MarkdownCard.css'

/**
 * 精致的Markdown卡片组件
 * 用于在Excalidraw画板中显示Markdown文件内容
 */
function MarkdownCard({ 
  filePath, 
  fileName, 
  x, 
  y, 
  width = 320, 
  height = 240,
  onResize,
  onMove,
  onRemove,
  onOpenFile,
  isSelected = false,
  zIndex = 1
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const cardRef = useRef(null)

  // 加载Markdown内容
  useEffect(() => {
    if (!filePath) return

    const loadContent = async () => {
      setLoading(true)
      setError(null)
      try {
        const fileContent = await filesApi.readFile(filePath)
        setContent(fileContent || '')
      } catch (err) {
        console.error('加载Markdown内容失败:', err)
        setError('加载失败')
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [filePath])

  // 鼠标拖拽处理
  const handleMouseDown = (e) => {
    if (e.target.closest('.card-controls') || e.target.closest('.card-content')) {
      return // 点击控制按钮或内容区域时不拖拽
    }

    setIsDragging(true)
    setDragStart({
      x: e.clientX - x,
      y: e.clientY - y
    })
    e.preventDefault()
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return

    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    onMove?.(newX, newY)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart, x, y])

  // 截取内容预览
  const getPreviewContent = () => {
    if (!content) return ''
    // 移除标题标记，取前300个字符
    const cleanContent = content.replace(/^#+\s+/gm, '').replace(/\*\*/g, '').replace(/\*/g, '')
    return cleanContent.slice(0, 300)
  }

  // 获取第一个标题作为卡片标题
  const getCardTitle = () => {
    if (!content) return fileName
    const firstLine = content.split('\n')[0]
    if (firstLine.startsWith('#')) {
      return firstLine.replace(/^#+\s+/, '').trim() || fileName
    }
    return fileName
  }

  return (
    <div
      ref={cardRef}
      className={`markdown-card ${isSelected ? 'selected' : ''} ${expanded ? 'expanded' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: expanded ? width * 1.5 : width,
        height: expanded ? height * 1.8 : height,
        zIndex: isDragging ? 1000 : zIndex,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation()
        // 这里可以添加选中逻辑，暂时留空
      }}
    >
      {/* 卡片头部 */}
      <div className="card-header">
        <div className="card-icon">
          <FileText size={16} />
        </div>
        <div className="card-title">
          <span title={getCardTitle()}>{getCardTitle()}</span>
        </div>
        <div className="card-controls">
          <button
            className="card-btn"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            title={expanded ? "收起" : "展开"}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            className="card-btn"
            onClick={(e) => {
              e.stopPropagation()
              onOpenFile?.(filePath)
            }}
            title="打开文件"
          >
            <ExternalLink size={14} />
          </button>
          <button
            className="card-btn remove-btn"
            onClick={(e) => {
              e.stopPropagation()
              onRemove?.()
            }}
            title="移除卡片"
          >
            ×
          </button>
        </div>
      </div>

      {/* 卡片内容 */}
      <div className="card-content">
        {loading && (
          <div className="card-loading">
            <div className="loading-spinner" />
            <span>加载中...</span>
          </div>
        )}

        {error && (
          <div className="card-error">
            <span>⚠️ {error}</span>
          </div>
        )}

        {!loading && !error && (
          <div className="markdown-content">
            {expanded ? (
              // 展开模式：显示完整的Markdown渲染
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h4 className="card-h1">{children}</h4>,
                  h2: ({ children }) => <h5 className="card-h2">{children}</h5>,
                  h3: ({ children }) => <h6 className="card-h3">{children}</h6>,
                  h4: ({ children }) => <h6 className="card-h4">{children}</h6>,
                  h5: ({ children }) => <h6 className="card-h5">{children}</h6>,
                  h6: ({ children }) => <h6 className="card-h6">{children}</h6>,
                  p: ({ children }) => <p className="card-p">{children}</p>,
                  ul: ({ children }) => <ul className="card-ul">{children}</ul>,
                  ol: ({ children }) => <ol className="card-ol">{children}</ol>,
                  li: ({ children }) => <li className="card-li">{children}</li>,
                  blockquote: ({ children }) => <blockquote className="card-quote">{children}</blockquote>,
                  code: ({ inline, children }) => 
                    inline ? <code className="card-code-inline">{children}</code> : 
                    <pre className="card-code-block"><code>{children}</code></pre>,
                  a: ({ href, children }) => (
                    <a href={href} className="card-link" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      {children}
                    </a>
                  ),
                  img: ({ src, alt }) => <img src={src} alt={alt} className="card-img" />
                }}
              >
                {content.slice(0, 2000)} {/* 限制长度避免性能问题 */}
              </ReactMarkdown>
            ) : (
              // 收起模式：显示纯文本预览
              <div className="content-preview">
                <p>{getPreviewContent()}</p>
                {content.length > 300 && (
                  <div className="content-truncated">
                    ... 点击展开查看更多
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 卡片底部信息 */}
      <div className="card-footer">
        <span className="file-path" title={filePath}>
          {filePath.split('/').slice(-2).join('/')}
        </span>
        <span className="char-count">
          {content.length} 字符
        </span>
      </div>

      {/* 选中指示器 */}
      {isSelected && <div className="selection-indicator" />}
    </div>
  )
}

export default MarkdownCard
