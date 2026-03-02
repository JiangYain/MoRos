import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

function MarkdownPreview({ content, components, paneRef, onScroll, articleClassName = 'markdown-content', bare = false }) {
  const article = (
    <article className={articleClassName}>
      {content.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      ) : null}
    </article>
  )

  if (bare) return article

  return (
    <div className="preview-pane" ref={paneRef} onScroll={onScroll}>
      {article}
    </div>
  )
}

export default MarkdownPreview


