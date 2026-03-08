import React from 'react'

export const buildMarkdownComponents = () => {
  return {
    h1: ({ children, ...props }) => (
      <h1 className="heading heading-1" {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="heading heading-2" {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="heading heading-3" {...props}>{children}</h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 className="heading heading-4" {...props}>{children}</h4>
    ),
    h5: ({ children, ...props }) => (
      <h5 className="heading heading-5" {...props}>{children}</h5>
    ),
    h6: ({ children, ...props }) => (
      <h6 className="heading heading-6" {...props}>{children}</h6>
    ),
    code: ({ inline, className, children, ...props }) => {
      if (inline) {
        return <code className="inline-code" {...props}>{children}</code>
      }
      return (
        <code className={className} {...props}>{children}</code>
      )
    },
    pre: ({ children, ...props }) => {
      const [copyState, setCopyState] = React.useState('idle') // 'idle' | 'copied' | 'error'

      const normalizeEdgeBlankLines = (nodeChildren) => {
        const list = React.Children.toArray(nodeChildren)
        if (list.length === 0) return nodeChildren
        const normalized = [...list]
        if (typeof normalized[0] === 'string') {
          normalized[0] = normalized[0].replace(/^\n+/, '')
        }
        const lastIndex = normalized.length - 1
        if (typeof normalized[lastIndex] === 'string') {
          normalized[lastIndex] = normalized[lastIndex].replace(/\n+$/, '')
        }
        while (normalized.length > 1 && normalized[0] === '') normalized.shift()
        while (normalized.length > 1 && normalized[normalized.length - 1] === '') normalized.pop()
        return normalized
      }

      const extractText = (node) => {
        if (typeof node === 'string' || typeof node === 'number') return String(node)
        if (Array.isArray(node)) return node.map(extractText).join('')
        if (React.isValidElement(node)) return extractText(node.props?.children)
        return ''
      }

      const childrenArray = React.Children.toArray(children)
      const codeChild = childrenArray.find((child) => React.isValidElement(child)) || childrenArray[0]
      const className = (React.isValidElement(codeChild) ? codeChild.props?.className : '') || ''
      const match = String(className).match(/language-([a-z0-9_-]+)/i)
      const languageLabel = match?.[1]
        ? String(match[1]).replace(/[_-]/g, ' ').toUpperCase()
        : 'TEXT'

      const normalizedCodeChildren = React.isValidElement(codeChild)
        ? normalizeEdgeBlankLines(codeChild.props?.children)
        : normalizeEdgeBlankLines(children)
      const raw = extractText(normalizedCodeChildren).replace(/^\n+/, '').replace(/\n+$/, '')

      const renderedCode = React.isValidElement(codeChild)
        ? React.cloneElement(codeChild, { children: normalizedCodeChildren })
        : codeChild

      const handleCopy = async () => {
        try {
          await navigator.clipboard.writeText(raw)
          setCopyState('copied')
        } catch (_) {
          setCopyState('error')
        } finally {
          setTimeout(() => setCopyState('idle'), 1400)
        }
      }

      return (
        <div className="code-block-wrapper">
          <div className="code-block-header">
            <span className="code-block-lang">{languageLabel}</span>
            <button
              type="button"
              className={`copy-code-btn ${copyState === 'copied' ? 'copied' : ''} ${copyState === 'error' ? 'copy-error' : ''}`}
              onClick={handleCopy}
              title={copyState === 'copied' ? 'Copied' : (copyState === 'error' ? 'Copy failed' : 'Copy')}
              aria-label={copyState === 'copied' ? 'Copied' : (copyState === 'error' ? 'Copy failed' : 'Copy')}
            >
              {copyState === 'copied' ? 'Copied' : (copyState === 'error' ? 'Copy failed' : 'Copy')}
            </button>
          </div>
          <pre className="code-block" {...props}>{renderedCode || children}</pre>
        </div>
      )
    },
    blockquote: ({ children, ...props }) => (
      <blockquote className="blockquote" {...props}>{children}</blockquote>
    ),
    ul: ({ children, ...props }) => (
      <ul className="list list-unordered" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list list-ordered" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }) => (
      <li className="list-item" {...props}>{children}</li>
    ),
    table: ({ children, ...props }) => (
      <div className="table-wrapper">
        <table className="table" {...props}>{children}</table>
      </div>
    ),
    a: ({ children, href, ...props }) => (
      <a className="link" href={href} {...props}>{children}</a>
    ),
  }
}
