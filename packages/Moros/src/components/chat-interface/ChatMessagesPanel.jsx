import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { cjk } from '@streamdown/cjk'
import MorosShapeIcon from '../MorosShapeIcon'
import ChatEmptyTerminalState from './ChatEmptyTerminalState'
import ToolExecutionTimeline from './ToolExecutionTimeline'
import {
  cloneAssistantSegments,
  extractTrailingErrorNote,
  segmentsContainErrorNote,
} from './assistantSegments'

function ChatMessagesPanel({
  messages,
  streamingSegments,
  isThinking,
  streamingContent,
  justFinished,
  normalizeMarkdownForRender,
  t,
  avatar,
  username,
  timeLocale,
  messagesEndRef,
}) {
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null)
  const copyMessageTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (copyMessageTimerRef.current) {
        clearTimeout(copyMessageTimerRef.current)
      }
    }
  }, [])

  const resolveMessageMarkdownForCopy = useCallback((message) => {
    if (!message || typeof message !== 'object') return ''
    const directContent = String(message.content || '')
    if (directContent && directContent !== '（无文本输出）') {
      return directContent
    }
    const segmentText = cloneAssistantSegments(message.segments)
      .filter((segment) => segment.type === 'text')
      .map((segment) => String(segment.content || ''))
      .join('')
    return segmentText
  }, [])

  const handleCopyMessage = useCallback(async (message, messageIndex) => {
    const markdown = resolveMessageMarkdownForCopy(message)
    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      setCopiedMessageIndex(messageIndex)
      if (copyMessageTimerRef.current) {
        clearTimeout(copyMessageTimerRef.current)
      }
      copyMessageTimerRef.current = setTimeout(() => {
        setCopiedMessageIndex(null)
        copyMessageTimerRef.current = null
      }, 1200)
    } catch (error) {
      console.error('复制消息失败:', error)
    }
  }, [resolveMessageMarkdownForCopy])

  const renderAssistantSegments = useCallback((segments, options = {}) => {
    const { isStreaming = false, showThinking = false } = options
    const normalizedSegments = cloneAssistantSegments(segments)
    if (normalizedSegments.length === 0) {
      return (
        <ToolExecutionTimeline
          tools={[]}
          isStreaming={isStreaming}
          isThinking={showThinking}
        />
      )
    }

    const lastSegmentIndex = normalizedSegments.length - 1
    return normalizedSegments.map((segment, index) => {
      if (segment.type === 'tools') {
        return (
          <ToolExecutionTimeline
            key={`segment-tools-${index}`}
            tools={segment.tools}
            isStreaming={isStreaming}
          />
        )
      }
      if (segment.type === 'text') {
        const text = normalizeMarkdownForRender(segment.content || '')
        if (!String(text).trim()) return null
        const showTypingIndicator = isStreaming && index === lastSegmentIndex
        return (
          <React.Fragment key={`segment-text-${index}`}>
            <div className="chat-message-text">
              <Streamdown
                className="prose markdown-content"
                plugins={{ code, math, cjk }}
                animated={isStreaming}
                isAnimating={isStreaming}
              >
                {text}
              </Streamdown>
            </div>
            {showTypingIndicator && (
              <div className="chat-message-time streaming-indicator">
                <span className="streaming-typing shimmer-text">{t('chat.typing')}</span>
              </div>
            )}
          </React.Fragment>
        )
      }
      return null
    })
  }, [normalizeMarkdownForRender, t])

  return (
    <div className="chat-messages">
      {messages.length === 0 && streamingSegments.length === 0 && !isThinking ? (
        <div className="chat-empty">
          <ChatEmptyTerminalState />
        </div>
      ) : (
        <>
          {messages.map((msg, index) => {
            const messageSegments = msg.role === 'assistant' ? cloneAssistantSegments(msg.segments) : []
            const hasMessageSegments = messageSegments.length > 0
            const trailingErrorNote = msg.error ? extractTrailingErrorNote(msg.content) : ''
            const shouldRenderErrorNoteAfterSegments =
              msg.role === 'assistant' &&
              hasMessageSegments &&
              msg.error &&
              Boolean(trailingErrorNote) &&
              !segmentsContainErrorNote(messageSegments)
            return (
              <div key={index} className={`chat-message ${msg.role} ${msg.error ? 'error' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="chat-message-avatar">
                    <MorosShapeIcon className="chat-ai-avatar-mark" />
                  </div>
                )}
                <div className="chat-message-content">
                  {msg.role === 'assistant' ? (
                    hasMessageSegments ? (
                      <>
                        {renderAssistantSegments(messageSegments)}
                        {shouldRenderErrorNoteAfterSegments && (
                          <div className="chat-message-text chat-error-note">
                            <Streamdown
                              className="prose markdown-content"
                              plugins={{ code, math, cjk }}
                            >
                              {normalizeMarkdownForRender(trailingErrorNote)}
                            </Streamdown>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {Array.isArray(msg.tools) && msg.tools.length > 0 && (
                          <ToolExecutionTimeline tools={msg.tools} />
                        )}
                        <div className="chat-message-text">
                          <Streamdown
                            className="prose markdown-content"
                            plugins={{ code, math, cjk }}
                          >
                            {normalizeMarkdownForRender(msg.content || '（无文本输出）')}
                          </Streamdown>
                        </div>
                      </>
                    )
                  ) : (
                    <div className="chat-message-text">{msg.content || ''}</div>
                  )}
                  {msg.files && msg.files.length > 0 && (
                    <div className="chat-message-files">
                      {msg.files.map((file, i) => (
                        <div key={i} className="chat-uploaded-file" title={file.name}>
                          <span className="chat-uploaded-file-name">{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="chat-message-meta">
                    <div className="chat-message-time">
                      {new Date(msg.timestamp).toLocaleTimeString(timeLocale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    {msg.role === 'assistant' && (
                      <button
                        type="button"
                        className={`chat-message-copy-btn ${copiedMessageIndex === index ? 'copied' : ''}`}
                        onClick={() => handleCopyMessage(msg, index)}
                        title={copiedMessageIndex === index ? 'Copied' : 'Copy markdown'}
                        aria-label={copiedMessageIndex === index ? 'Copied' : 'Copy markdown'}
                      >
                        {copiedMessageIndex === index ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="chat-message-avatar">
                    {avatar ? (
                      <img src={avatar} alt={username || t('chat.avatar_alt')} />
                    ) : (
                      <img src="/favicon.svg" alt={username || t('chat.avatar_alt')} />
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {(isThinking || streamingSegments.length > 0) && (
            <div className={`chat-message assistant ${streamingContent ? 'streaming' : ''} ${isThinking && streamingSegments.length === 0 ? 'thinking' : ''}`}>
              <div className="chat-message-avatar">
                <MorosShapeIcon className="chat-ai-avatar-mark" />
              </div>
              <div className="chat-message-content">
                {renderAssistantSegments(streamingSegments, {
                  isStreaming: true,
                  showThinking: isThinking && streamingSegments.length === 0,
                })}
              </div>
            </div>
          )}

          {justFinished && !streamingContent && !isThinking && (
            <div className="streaming-finished-dot">
              <span className="streaming-dot fade-out"></span>
            </div>
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}

export default ChatMessagesPanel
