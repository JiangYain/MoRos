import React, { useCallback, useState } from 'react'

const TOOL_DISPLAY = {
  bash: 'Bash', shell: 'Bash', Shell: 'Bash',
  read: 'Read', Read: 'Read',
  write: 'Write', Write: 'Write',
  StrReplace: 'Edit', str_replace: 'Edit',
  Grep: 'Search', grep: 'Search',
  Glob: 'Find', glob: 'Find',
  Delete: 'Delete', delete: 'Delete',
}

const extractToolArg = (tool) => {
  const raw = tool?.args
  if (!raw || typeof raw !== 'object') return ''
  if (raw.command) return String(raw.command).trim()
  if (raw.path) return String(raw.path).split(/[/\\]/).pop()
  if (raw.pattern) return String(raw.pattern).trim()
  if (raw.glob_pattern) return String(raw.glob_pattern).trim()
  if (raw.old_string) return String(raw.path || '').split(/[/\\]/).pop()
  return ''
}

const formatToolLabel = (tool) => {
  const name = String(tool?.toolName || 'tool')
  const display = TOOL_DISPLAY[name] || name
  const arg = extractToolArg(tool)
  if (arg) return { display, arg }
  return { display, arg: '' }
}

function ToolExecutionTimeline({ tools, isStreaming = false, isThinking = false }) {
  const hasTools = Array.isArray(tools) && tools.length > 0
  if (!hasTools && !isThinking) return null

  const running = hasTools ? tools.filter((t) => t?.status === 'running') : []
  const finished = hasTools ? tools.filter((t) => t?.status !== 'running') : []
  const showExploringLine = isThinking && running.length === 0
  const [expandedRowKeys, setExpandedRowKeys] = useState(() => new Set())

  const markRowExpanded = useCallback((rowKey) => {
    setExpandedRowKeys((prev) => {
      if (prev.has(rowKey)) return prev
      const next = new Set(prev)
      next.add(rowKey)
      return next
    })
  }, [])

  return (
    <div className={`chat-tool-events ${isStreaming ? 'streaming' : ''}`}>
      {showExploringLine && (
        <div className="tool-row tool-running" key="thinking-row">
          <span className="tool-row-name shimmer-text">Exploring</span>
        </div>
      )}
      {running.map((tool, index) => {
        const { display, arg } = formatToolLabel(tool)
        const rowKey = `running:${tool?.toolCallId || tool?.toolName || index}`
        const expanded = expandedRowKeys.has(rowKey)
        return (
          <div
            key={`running-${tool?.toolCallId || index}`}
            className={`tool-row tool-running${expanded ? ' tool-row-expanded' : ''}`}
            onMouseEnter={() => markRowExpanded(rowKey)}
          >
            <span className="tool-row-name shimmer-text">{display}</span>
            {arg && <span className="tool-row-arg shimmer-text">{arg}</span>}
          </div>
        )
      })}
      {finished.length > 0 && (
        <details className="tool-finished-group">
          <summary className="tool-finished-summary">
            <span className="tool-finished-label">Exploring</span>
            <svg className="tool-finished-chevron" width="10" height="10" viewBox="0 0 10 10">
              <path d="M2.5 3.5L5 6.5L7.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="tool-finished-body">
            {finished.map((tool, index) => {
              const { display, arg } = formatToolLabel(tool)
              const status = String(tool?.status || 'done')
              const rowKey = `finished:${tool?.toolCallId || tool?.toolName || index}`
              const expanded = expandedRowKeys.has(rowKey)
              return (
                <div
                  key={`${tool?.toolCallId || tool?.toolName || 'tool'}-${index}`}
                  className={`tool-row tool-done${status === 'error' ? ' tool-error' : ''}${expanded ? ' tool-row-expanded' : ''}`}
                  onMouseEnter={() => markRowExpanded(rowKey)}
                >
                  <span className="tool-row-name">{display}</span>
                  {arg && <span className="tool-row-arg">{arg}</span>}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}

export default ToolExecutionTimeline
