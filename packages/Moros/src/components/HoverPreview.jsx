import React, { useState, useEffect, useRef } from 'react'
import { filesApi } from '../utils/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Eye, FileText, Clock } from 'lucide-react'
import './HoverPreview.css'

// 安全的Markdown渲染器，带错误边界
function SafeMarkdownRenderer({ content }) {
  const [renderError, setRenderError] = useState(false)
  
  useEffect(() => {
    setRenderError(false)
  }, [content])
  
  if (renderError) {
    return (
      <div className="preview-fallback">
        <div className="fallback-content">
          {String(content || '').slice(0, 500)}
          {content && content.length > 500 && <span className="fallback-more">...</span>}
        </div>
      </div>
    )
  }
  
  try {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 简化的组件，适合预览
          h1: ({ children }) => <h4 className="preview-h1">{children}</h4>,
          h2: ({ children }) => <h5 className="preview-h2">{children}</h5>,
          h3: ({ children }) => <h6 className="preview-h3">{children}</h6>,
          h4: ({ children }) => <h6 className="preview-h4">{children}</h6>,
          h5: ({ children }) => <h6 className="preview-h5">{children}</h6>,
          h6: ({ children }) => <h6 className="preview-h6">{children}</h6>,
          p: ({ children }) => <p className="preview-p">{children}</p>,
          ul: ({ children }) => <ul className="preview-ul">{children}</ul>,
          ol: ({ children }) => <ol className="preview-ol">{children}</ol>,
          li: ({ children }) => <li className="preview-li">{children}</li>,
          blockquote: ({ children }) => <blockquote className="preview-quote">{children}</blockquote>,
          code: ({ inline, children }) => 
            inline ? <code className="preview-code-inline">{children}</code> : 
            <pre className="preview-code-block"><code>{children}</code></pre>,
          pre: ({ children }) => <div className="preview-pre">{children}</div>,
          a: ({ href, children }) => <a href={href} className="preview-link" target="_blank" rel="noopener noreferrer">{children}</a>,
          img: ({ src, alt }) => <img src={src} alt={alt} className="preview-img" />,
          table: ({ children }) => <table className="preview-table">{children}</table>,
          thead: ({ children }) => <thead className="preview-thead">{children}</thead>,
          tbody: ({ children }) => <tbody className="preview-tbody">{children}</tbody>,
          tr: ({ children }) => <tr className="preview-tr">{children}</tr>,
          th: ({ children }) => <th className="preview-th">{children}</th>,
          td: ({ children }) => <td className="preview-td">{children}</td>,
        }}
        onError={() => setRenderError(true)}
      >
        {String(content || '').slice(0, 2000)}
      </ReactMarkdown>
    )
  } catch (error) {
    console.warn('Markdown渲染失败，使用纯文本显示:', error)
    return (
      <div className="preview-fallback">
        <div className="fallback-content">
          {String(content || '').slice(0, 500)}
          {content && content.length > 500 && <span className="fallback-more">...</span>}
        </div>
      </div>
    )
  }
}

function HoverPreview({ file, visible, position, onClose }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const previewRef = useRef(null)
  const closeTimerRef = useRef(null)

  // 加载文件内容
  useEffect(() => {
    if (!visible || !file?.path) {
      setContent('')
      setError(null)
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      return
    }

    // 只预览 Markdown 文件
    if (!file.name.toLowerCase().endsWith('.md')) {
      return
    }

    const loadContent = async () => {
      setLoading(true)
      setError(null)
      try {
        const fileContent = await filesApi.readFile(file.path)
        // 确保内容是有效字符串，并清理潜在的问题字符
        let cleanContent = String(fileContent || '')
        
        // 移除可能导致解析问题的控制字符
        cleanContent = cleanContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        
        setContent(cleanContent)
      } catch (err) {
        console.error('加载预览内容失败:', err)
        setError('加载失败')
      } finally {
        setLoading(false)
      }
    }

    loadContent()
  }, [visible, file?.path])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (event) => {
      if (previewRef.current && !previewRef.current.contains(event.target)) {
        onClose?.()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, onClose])

  if (!visible || !file) return null

  // 非 Markdown 文件显示简单信息
  if (!file.name.toLowerCase().endsWith('.md')) {
    return (
      <div 
        className="hover-preview non-markdown"
        ref={previewRef}
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        <div className="preview-header">
          <FileText size={14} />
          <span className="filename">{file.name}</span>
        </div>
        <div className="preview-content">
          <p className="no-preview">此文件类型不支持预览</p>
        </div>
      </div>
    )
  }

  // 处理预览组件的鼠标事件
  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    // 鼠标进入预览时，通知父组件取消关闭
    if (window.sidebarCancelClose) {
      window.sidebarCancelClose()
    }
  }

  const handleMouseLeave = () => {
    // 鼠标离开预览时，给更充足缓冲，避免瞬间消失
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    closeTimerRef.current = setTimeout(() => {
      onClose?.()
      closeTimerRef.current = null
    }, 450)
  }

  return (
    <div 
      className="hover-preview"
      ref={previewRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="preview-header">
        <Eye size={14} />
        <span className="filename">{file.name}</span>
        {loading && <Clock size={12} className="loading" />}
      </div>
      
      <div className="preview-content">
        {loading && (
          <div className="preview-loading">
            <Clock size={16} className="spinning" />
            <span>加载中...</span>
          </div>
        )}
        
        {error && (
          <div className="preview-error">
            <span>⚠️ {error}</span>
          </div>
        )}
        
        {!loading && !error && content && (
          <div className="markdown-preview">
            <SafeMarkdownRenderer content={content} />
            {content.length > 2000 && (
              <div className="preview-truncated">
                <span>... 内容已截断，点击文件查看完整内容</span>
              </div>
            )}
          </div>
        )}
        
        {!loading && !error && !content && (
          <div className="preview-empty">
            <span>📄 文件为空</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default HoverPreview
