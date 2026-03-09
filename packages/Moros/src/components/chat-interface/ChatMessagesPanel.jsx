import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { cjk } from '@streamdown/cjk'
import { filesApi } from '../../utils/api'
import MorosShapeIcon from '../MorosShapeIcon'
import ChatEmptyTerminalState from './ChatEmptyTerminalState'
import ToolExecutionTimeline from './ToolExecutionTimeline'
import {
  cloneAssistantSegments,
  extractTrailingErrorNote,
  flattenToolEventsFromSegments,
  segmentsContainErrorNote,
} from './assistantSegments'
import {
  collectArtifactPathsFromToolEvents,
  isAbsolutePath,
  isImageArtifactPath,
  normalizeAttachmentPath,
  sanitizeArtifactPathCandidate,
  resolveAttachmentName,
} from './artifacts'

function ChatMessagesPanel({
  messages,
  streamingSegments,
  isThinking,
  streamingContent,
  justFinished,
  thinkingState = 'idle',
  normalizeMarkdownForRender,
  t,
  avatar,
  username,
  timeLocale,
  messagesEndRef,
  onOpenArtifact,
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

  const resolveMessageArtifacts = useCallback((message) => {
    const providedFiles = Array.isArray(message?.files) ? message.files : []
    const shouldFallbackToToolEvents = providedFiles.length === 0
    const toolEvents = (() => {
      if (!shouldFallbackToToolEvents) return []
      if (Array.isArray(message?.segments)) {
        return flattenToolEventsFromSegments(cloneAssistantSegments(message.segments))
      }
      return Array.isArray(message?.tools) ? message.tools : []
    })()
    const derivedPaths = shouldFallbackToToolEvents
      ? collectArtifactPathsFromToolEvents(toolEvents, { includeRelative: true })
      : []

    const merged = []
    const seen = new Set()
    const pushFile = (input) => {
      const rawPath = normalizeAttachmentPath(input?.path || '')
      const pathCandidate = sanitizeArtifactPathCandidate(rawPath, { includeRelative: true })
      const relativeCandidate = sanitizeArtifactPathCandidate(input?.relativePath, { includeRelative: true })
      let relativePath = ''
      let absolutePath = ''
      const applyCandidate = (candidate) => {
        const normalized = normalizeAttachmentPath(candidate)
        if (!normalized) return
        if (isAbsolutePath(normalized)) {
          if (!absolutePath) {
            absolutePath = normalized
          }
          return
        }
        const normalizedRelative = normalized
          .replace(/\\/g, '/')
          .replace(/^\.\//, '')
          .trim()
        if (!normalizedRelative) return
        if (!relativePath) {
          relativePath = normalizedRelative
        }
      }
      applyCandidate(pathCandidate)
      applyCandidate(relativeCandidate)
      const resolvedPath = String(absolutePath || relativePath || '').trim()
      const fallbackName = String(input?.name || '').trim()
      if (!resolvedPath && !fallbackName) return
      const key = resolvedPath ? resolvedPath.toLowerCase() : `name:${fallbackName.toLowerCase()}`
      if (seen.has(key)) return
      seen.add(key)

      const isImage = Boolean(input?.isImage) || isImageArtifactPath(resolvedPath)
      const previewUrl = isImage
        ? (relativePath
            ? filesApi.getRawFileUrl(relativePath)
            : (absolutePath ? filesApi.getRawAbsoluteFileUrl(absolutePath) : ''))
        : ''
      merged.push({
        name: fallbackName || resolveAttachmentName({}, resolvedPath),
        path: absolutePath || resolvedPath,
        relativePath: relativePath || undefined,
        isImage,
        previewUrl,
      })
    }

    for (const file of providedFiles) {
      pushFile(file)
    }
    for (const pathValue of derivedPaths) {
      pushFile({
        path: pathValue,
        name: resolveAttachmentName({}, pathValue),
      })
    }
    const isMarkovDataRootFile = (file) => {
      const normalizedPath = String(file?.relativePath || file?.path || '')
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .toLowerCase()
      const markerMatch = normalizedPath.match(/(?:^|\/)markov-data\/(.+)$/)
      if (!markerMatch) return false
      const restPath = String(markerMatch[1] || '')
      return Boolean(restPath) && !restPath.includes('/')
    }
    const rootFallbackNameSet = new Set()
    const groupedByName = new Map()
    for (const file of merged) {
      const nameKey = String(file?.name || '').trim().toLowerCase()
      if (!nameKey) continue
      if (!groupedByName.has(nameKey)) {
        groupedByName.set(nameKey, [])
      }
      groupedByName.get(nameKey).push(file)
    }
    for (const sameNameFiles of groupedByName.values()) {
      if (!Array.isArray(sameNameFiles) || sameNameFiles.length < 2) continue
      const hasNested = sameNameFiles.some((file) => !isMarkovDataRootFile(file))
      if (!hasNested) continue
      for (const file of sameNameFiles) {
        if (isMarkovDataRootFile(file)) {
          const key = String(file.path || file.relativePath || file.name || '').toLowerCase()
          if (key) rootFallbackNameSet.add(key)
        }
      }
    }
    const pruned = merged.filter((file) => {
      const key = String(file.path || file.relativePath || file.name || '').toLowerCase()
      return !rootFallbackNameSet.has(key)
    })
    return pruned.slice(0, 8)
  }, [])

  const renderAssistantSegments = useCallback((segments, options = {}) => {
    const { isStreaming = false, showThinking = false, thinkingState: segmentThinkingState = 'idle' } = options
    const normalizedSegments = cloneAssistantSegments(segments)
    if (normalizedSegments.length === 0) {
      return (
        <ToolExecutionTimeline
          tools={[]}
          isStreaming={isStreaming}
          isThinking={showThinking}
          thinkingState={segmentThinkingState}
          loadingLabel={t('chat.loading_line')}
          exploringLabel={t('chat.exploring')}
          exploredLabel={t('chat.explored')}
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
            thinkingState={segmentThinkingState}
            loadingLabel={t('chat.loading_line')}
            exploringLabel={t('chat.exploring')}
            exploredLabel={t('chat.explored')}
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
            const messageArtifacts = resolveMessageArtifacts(msg)
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
                          <ToolExecutionTimeline
                            tools={msg.tools}
                            loadingLabel={t('chat.loading_line')}
                            exploringLabel={t('chat.exploring')}
                            exploredLabel={t('chat.explored')}
                          />
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
                  {messageArtifacts.length > 0 && (
                    <div className="chat-message-files">
                      {messageArtifacts.map((file, i) => (
                        <button
                          key={`${file.path || file.relativePath || file.name}-${i}`}
                          type="button"
                          className={`chat-uploaded-file chat-message-artifact-file ${file.isImage ? 'is-image' : ''}`}
                          title={file.name}
                          onClick={() => onOpenArtifact?.(file)}
                        >
                          {file.isImage && file.previewUrl ? (
                            <img
                              src={file.previewUrl}
                              alt={file.name}
                              className="chat-message-artifact-thumb"
                            />
                          ) : (
                            <span className="chat-message-artifact-dot" aria-hidden />
                          )}
                          <span className="chat-uploaded-file-name">{file.name}</span>
                        </button>
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
                  thinkingState,
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
