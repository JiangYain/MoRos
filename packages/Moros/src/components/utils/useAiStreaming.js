import { useRef, useState } from 'react'
import { chatWithDifyStreaming } from '../../utils/dify'

export function useAiStreaming({ getConversationId, setConversationId, clearConversationId, currentFile, language }) {
  const aiHandleRef = useRef(null)
  const aiBuffersRef = useRef({ before: '', after: '', stream: '' })
  const aiTypewriterRef = useRef({ queue: '', output: '', raf: 0, ended: false, lastTime: 0, acc: 0, pauseUntil: 0 })
  const [aiStatus, setAiStatus] = useState('idle')
  const [aiPos, setAiPos] = useState({ top: 0, left: 0 })
  const normalizeBrandText = (text = '') => String(text).replace(/markov/gi, 'MoRos')

  const stopTypewriter = () => {
    const tw = aiTypewriterRef.current
    if (tw.raf) cancelAnimationFrame(tw.raf)
    aiTypewriterRef.current = { queue: '', output: '', raf: 0, ended: false, lastTime: 0, acc: 0, pauseUntil: 0 }
  }

  const runTypewriter = (setContent) => {
    const tw = aiTypewriterRef.current
    if (tw.raf) return
    const step = (ts) => {
      const twi = aiTypewriterRef.current
      if (twi.pauseUntil && ts < twi.pauseUntil) {
        twi.raf = requestAnimationFrame(step)
        return
      }
      const dt = twi.lastTime ? Math.min(100, ts - twi.lastTime) : 16
      twi.lastTime = ts
      const baseCps = 110
      const backlogBoost = Math.min(160, Math.floor(twi.queue.length / 8))
      const cps = baseCps + backlogBoost
      twi.acc += (cps * dt) / 1000
      let take = 0
      if (twi.acc >= 1) {
        take = Math.floor(twi.acc)
        twi.acc -= take
      }
      if (twi.queue.length > 0 && take > 0) {
        const emit = twi.queue.slice(0, take)
        twi.queue = twi.queue.slice(take)
        twi.output += emit
        aiBuffersRef.current.stream = twi.output
        const next = aiBuffersRef.current.before + aiBuffersRef.current.stream + aiBuffersRef.current.after
        setContent(next)
        const lastChar = emit[emit.length - 1]
        if (lastChar) {
          const hardStops = '。！？!?'
          const softStops = '，、；;：:,.，'
          if (hardStops.includes(lastChar)) {
            twi.pauseUntil = ts + 120
          } else if (softStops.includes(lastChar) || lastChar === '\n') {
            twi.pauseUntil = ts + 60
          } else {
            twi.pauseUntil = 0
          }
        }
      }
      if (twi.queue.length === 0 && twi.ended) {
        if (twi.raf) cancelAnimationFrame(twi.raf)
        twi.raf = 0
        twi.lastTime = 0
        twi.acc = 0
        twi.pauseUntil = 0
        aiHandleRef.current = null
        setAiStatus('idle')
        return
      }
      twi.raf = requestAnimationFrame(step)
    }
    aiTypewriterRef.current.raf = requestAnimationFrame(step)
  }

  const startStreaming = ({
    mentionQuery,
    contextBefore,
    before,
    after,
    setContent,
    anchorHtml,
    renderHighlighted,
    highlightRef,
    attachedFiles = [],
  }) => {
    aiBuffersRef.current = { before: before + '\n\n', after, stream: '' }
    setContent(aiBuffersRef.current.before + aiBuffersRef.current.after)
    setAiStatus('streaming')

    try {
      const hi = highlightRef.current
      if (hi) {
        const tmpHtml = anchorHtml
        hi.innerHTML = tmpHtml
        const r1 = hi.getBoundingClientRect()
        const r2 = hi.querySelector('.caret-anchor')?.getBoundingClientRect()
        if (r2) setAiPos({ top: r2.top - r1.top - 0, left: r2.left - r1.left + 4 })
        hi.innerHTML = renderHighlighted
      }
    } catch {}

    const convoKey = currentFile?.path || '__global__'
    
    // 检查是否应该清空上下文：
    // 1. 文档内容为空或只有空白字符
    // 2. 上下文内容为空或只有空白字符
    const isContentEmpty = !contextBefore || contextBefore.trim() === ''
    const shouldClearContext = isContentEmpty
    
    // 如果需要清空上下文，则使用空的 conversation_id 开始新对话
    const currentConversationId = shouldClearContext ? '' : getConversationId(convoKey)
    
    // 如果清空了上下文，同时清理本地存储的 conversation_id
    if (shouldClearContext && clearConversationId) {
      clearConversationId(convoKey)
    }

    aiHandleRef.current = chatWithDifyStreaming(
      {
        query: mentionQuery,
        inputs: {
          context: contextBefore,
          file_path: currentFile?.path || '',
          file_name: currentFile?.name || '',
          language: language || '',
        },
        conversationId: currentConversationId,
        user: 'moros-local',
        autoGenerateName: false,
        files: attachedFiles, // 传递附加的文件
      },
      (evt) => {
        if (evt.event === 'message') {
          const chunk = normalizeBrandText(evt.answer || '')
          aiTypewriterRef.current.queue += chunk
          runTypewriter(setContent)
          if (evt.conversation_id) setConversationId(convoKey, evt.conversation_id)
        } else if (evt.event === 'message_end') {
          aiTypewriterRef.current.ended = true
          runTypewriter(setContent)
          if (evt.conversation_id) setConversationId(convoKey, evt.conversation_id)
        } else if (evt.event === 'error') {
          aiTypewriterRef.current.queue += `\n\n> 错误：${normalizeBrandText(evt.message || '未知错误')}`
          aiTypewriterRef.current.ended = true
          runTypewriter(setContent)
        }
      }
    )
  }

  // 手动清空当前文件的 AI 上下文
  const clearCurrentContext = () => {
    const convoKey = currentFile?.path || '__global__'
    if (clearConversationId) {
      clearConversationId(convoKey)
    }
  }

  return {
    aiHandleRef,
    aiBuffersRef,
    aiTypewriterRef,
    aiStatus,
    setAiStatus,
    aiPos,
    setAiPos,
    startStreaming,
    stopTypewriter,
    clearCurrentContext,
  }
}

