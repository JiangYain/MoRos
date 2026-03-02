import React, { useMemo, useEffect } from 'react'
import { renderNiceHtml } from '../utils/mdnice/parser'
import unifiedThemeCSS from '../utils/mdnice/unified-theme.js'
import './RichHtmlPreview.css'

function RichHtmlPreview({ content, paneRef, onScroll, customCSS = null }) {
  // 简化版本：固定使用 highlight 模式以支持 atom-one-dark 主题
  const html = useMemo(() => {
    return renderNiceHtml(content || '', { codeStyle: 'highlight' })
  }, [content])

  useEffect(() => {
    // 注入CSS主题（支持自定义CSS）
    const styleId = 'mdnice-unified-theme-style'
    const el = document.getElementById(styleId) || document.createElement('style')
    el.id = styleId
    // 使用自定义CSS或默认主题CSS
    el.innerHTML = customCSS || unifiedThemeCSS
    document.head.appendChild(el)
    return () => {}
  }, [customCSS])

  return (
    <div className="preview-pane rich-html-pane" ref={paneRef} onScroll={onScroll}>
      <article className="markdown-content">
        <section id="nice" data-tool="mdnice">
          {/* eslint-disable-next-line react/no-danger */}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      </article>
    </div>
  )
}

export default RichHtmlPreview
