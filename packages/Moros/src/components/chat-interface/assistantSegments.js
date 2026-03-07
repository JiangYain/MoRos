const TOOL_OUTPUT_MAX_CHARS = 2400
const TOOL_ARGS_MAX_CHARS = 1200
const ERROR_NOTE_REGEX = /(?:^|\n\n)_?(?:Error|错误)[:：][\s\S]*$/i

const truncateForDisplay = (text, maxChars) => {
  const normalized = String(text || '')
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars)}\n...[输出已截断]...`
}

const stringifyForDisplay = (value, maxChars) => {
  try {
    return truncateForDisplay(JSON.stringify(value, null, 2), maxChars)
  } catch {
    return truncateForDisplay(String(value || ''), maxChars)
  }
}

const extractTextFromToolResult = (result) => {
  if (!result || typeof result !== 'object') return ''
  if (!Array.isArray(result.content)) return ''
  return result.content
    .filter((block) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block) => String(block.text))
    .join('\n')
}

export const prependGlobalSystemPrompt = (message, systemPrompt) => {
  const normalizedMessage = String(message || '')
  const normalizedSystemPrompt = String(systemPrompt || '').trim()
  if (!normalizedSystemPrompt) return normalizedMessage
  return [
    '[Global System Prompt]',
    normalizedSystemPrompt,
    '',
    '[User Message]',
    normalizedMessage,
  ].join('\n')
}

export const extractAssistantErrorFromAgentEnd = (payload) => {
  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  const assistant = [...messages].reverse().find((message) => message?.role === 'assistant')
  if (!assistant) return ''
  const assistantText = String(
    Array.isArray(assistant?.content)
      ? assistant.content
          .filter((block) => block?.type === 'text' && typeof block?.text === 'string')
          .map((block) => String(block.text))
          .join('')
      : '',
  ).trim()
  const errorMessage = String(assistant?.errorMessage || '').trim()
  const normalizedErrorMessage = errorMessage.toLowerCase()
  const isGenericProviderError =
    normalizedErrorMessage === 'an unknown error occurred' ||
    normalizedErrorMessage === 'model request failed with stopreason=error'
  if (errorMessage) {
    if (assistantText && isGenericProviderError) return ''
    return errorMessage
  }
  if (String(assistant?.stopReason || '').toLowerCase() === 'error') {
    if (assistantText) return ''
    return '模型请求失败（stopReason=error）'
  }
  return ''
}

export const mergeToolEvent = (prev, event) => {
  const toolName = String(event?.toolName || 'tool')
  const callId = String(event?.toolCallId || '').trim()
  const nowIso = new Date().toISOString()
  const next = Array.isArray(prev) ? [...prev] : []

  let targetIndex = -1
  if (callId) {
    targetIndex = next.findIndex((item) => item.toolCallId === callId)
  } else {
    targetIndex = [...next]
      .reverse()
      .findIndex((item) => item.toolName === toolName && item.status === 'running')
    if (targetIndex !== -1) {
      targetIndex = next.length - 1 - targetIndex
    }
  }

  const baseItem =
    targetIndex >= 0
      ? next[targetIndex]
      : {
          toolCallId: callId || `anonymous-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          toolName,
          status: 'running',
          startedAt: nowIso,
          args: undefined,
          argsPreview: '',
          output: '',
          outputPreview: '',
          details: undefined,
          endedAt: undefined,
        }

  const item = {
    ...baseItem,
    toolName,
  }

  if (event?.args !== undefined) {
    item.args = event.args
    item.argsPreview = stringifyForDisplay(event.args, TOOL_ARGS_MAX_CHARS)
  }

  if (event?.result !== undefined) {
    const outputText = extractTextFromToolResult(event.result)
    if (outputText) {
      item.output = outputText
      item.outputPreview = truncateForDisplay(outputText, TOOL_OUTPUT_MAX_CHARS)
    }
    if (event.result?.details !== undefined) {
      item.details = event.result.details
    }
  }

  if (event?.phase === 'start') {
    item.status = 'running'
  } else if (event?.phase === 'end') {
    item.status = event?.isError ? 'error' : 'done'
    item.endedAt = nowIso
  } else if (!item.status) {
    item.status = 'running'
  }

  if (targetIndex >= 0) {
    next[targetIndex] = item
  } else {
    next.push(item)
  }

  return next
}

export const cloneToolEvents = (tools) => {
  if (!Array.isArray(tools)) return []
  return tools.map((tool) => ({ ...tool }))
}

export const cloneAssistantSegments = (segments) => {
  if (!Array.isArray(segments)) return []
  return segments
    .map((segment) => {
      if (!segment || typeof segment !== 'object') return null
      if (segment.type === 'tools') {
        const clonedTools = cloneToolEvents(segment.tools)
        if (clonedTools.length === 0) return null
        return { type: 'tools', tools: clonedTools }
      }
      if (segment.type === 'text') {
        const text = String(segment.content || '')
        if (!text) return null
        return { type: 'text', content: text }
      }
      return null
    })
    .filter(Boolean)
}

export const flattenToolEventsFromSegments = (segments) => {
  if (!Array.isArray(segments)) return []
  return segments
    .filter((segment) => segment?.type === 'tools' && Array.isArray(segment?.tools))
    .flatMap((segment) => cloneToolEvents(segment.tools))
}

const appendTextSegmentEntry = (segments, text) => {
  const value = String(text || '')
  if (!value) return Array.isArray(segments) ? [...segments] : []
  const next = Array.isArray(segments) ? [...segments] : []
  const lastIndex = next.length - 1
  const lastSegment = next[lastIndex]
  if (lastSegment?.type === 'text') {
    next[lastIndex] = {
      type: 'text',
      content: `${String(lastSegment.content || '')}${value}`,
    }
  } else {
    next.push({
      type: 'text',
      content: value,
    })
  }
  return next
}

const appendToolEventSegmentEntry = (segments, event) => {
  const next = Array.isArray(segments) ? [...segments] : []
  const lastIndex = next.length - 1
  const lastSegment = next[lastIndex]
  if (lastSegment?.type === 'tools') {
    next[lastIndex] = {
      type: 'tools',
      tools: mergeToolEvent(lastSegment.tools, event),
    }
  } else {
    next.push({
      type: 'tools',
      tools: mergeToolEvent([], event),
    })
  }
  return next
}

export const buildSegmentsFromAgentPayload = (payload) => {
  const rawMessages = Array.isArray(payload?.messages)
    ? payload.messages
    : Array.isArray(payload?.event?.messages)
      ? payload.event.messages
      : []
  if (rawMessages.length === 0) return []

  const lastUserIndex = rawMessages.reduce((latestIndex, message, index) => {
    if (String(message?.role || '') === 'user') return index
    return latestIndex
  }, -1)
  const turnMessages = lastUserIndex >= 0 ? rawMessages.slice(lastUserIndex + 1) : rawMessages

  let segments = []
  for (const message of turnMessages) {
    const role = String(message?.role || '')
    if (role === 'assistant') {
      const blocks = Array.isArray(message?.content) ? message.content : []
      for (const block of blocks) {
        if (block?.type === 'text' && typeof block?.text === 'string') {
          segments = appendTextSegmentEntry(segments, block.text)
          continue
        }
        if (block?.type === 'toolCall') {
          segments = appendToolEventSegmentEntry(segments, {
            phase: 'start',
            toolCallId: block?.id,
            toolName: block?.name,
            args: block?.arguments,
          })
        }
      }
      continue
    }

    if (role === 'toolResult') {
      segments = appendToolEventSegmentEntry(segments, {
        phase: 'end',
        toolCallId: message?.toolCallId,
        toolName: message?.toolName,
        result: {
          content: Array.isArray(message?.content) ? message.content : undefined,
          details: message?.details,
        },
        isError: Boolean(message?.isError),
      })
    }
  }

  return cloneAssistantSegments(segments)
}

export const extractTrailingErrorNote = (value) => {
  const text = String(value || '')
  if (!text) return ''
  const matched = text.match(ERROR_NOTE_REGEX)
  return matched ? String(matched[0] || '').trim() : ''
}

export const segmentsContainErrorNote = (segments) => {
  if (!Array.isArray(segments) || segments.length === 0) return false
  const joined = segments
    .filter((segment) => segment?.type === 'text')
    .map((segment) => String(segment?.content || ''))
    .join('\n')
  return ERROR_NOTE_REGEX.test(joined)
}
