import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { filesApi } from '../utils/api'
import './MainContent.css'
import Whiteboard, { isWhiteboardFile } from './Whiteboard'
import EnhancedWhiteboard from './EnhancedWhiteboard'
import ChatInterface from './ChatInterface'
import ChatComposer from './ChatComposer'
import Toolbar from './Toolbar'
import MarkdownPreview from './MarkdownPreview'
import MarkdownEditor from './MarkdownEditor'
import EditorOverlay from './EditorOverlay'
// 移除StyleEditor导入，改为使用StyleSidebar
import { buildMarkdownComponents } from './markdownComponents.jsx'
import { useAiStreaming } from './utils/useAiStreaming'
import { useKeyboardShortcuts } from './utils/useKeyboardShortcuts'
import { useImageHandling } from './utils/useImageHandling'
import { useScrollSync } from './utils/useScrollSync'
import { useTableOfContents } from './utils/useTableOfContents'
import { useMarkdownActions } from './utils/useMarkdownActions'
import { escapeHtml, findCurrentLineRange, isImageFile, getParentDirName, calculateStats } from './utils/editorHelpers'
import {
  CHAT_PROVIDER_OPTIONS,
  getAllChatModelOptions,
  getActiveChatModel,
  getActiveChatProvider,
  normalizeChatModel,
  normalizeChatProvider,
  resolveProviderForModel,
  setActiveChatModel,
  setActiveChatProvider,
} from '../utils/chatProvider'
import { markChatFileOpened } from '../utils/chatFiles'

// 检查是否为对话文件
const isChatFile = (filePath) => {
  return filePath && filePath.toLowerCase().endsWith('.moros')
}

const isMarkdownFile = (filePath) => {
  const value = String(filePath || '').toLowerCase()
  return value.endsWith('.md') || value.endsWith('.markdown')
}

const isPlainEditorOnlyFile = (filePath) => {
  const value = String(filePath || '').trim()
  if (!value) return false
  if (isMarkdownFile(value)) return false
  if (isImageFile(value)) return false
  if (isWhiteboardFile(value)) return false
  if (isChatFile(value)) return false
  return true
}

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/

const isAbsolutePath = (value) => ABSOLUTE_PATH_PATTERN.test(String(value || '').trim())

const normalizeDroppedPath = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^[A-Za-z]:\//.test(text)) {
    return text.replace(/\//g, '\\')
  }
  return text
}

const MOROS_ASCII_ART = [
  '███╗   ███╗ ██████╗ ██████╗  ██████╗ ███████╗',
  '████╗ ████║██╔═══██╗██╔══██╗██╔═══██╗██╔════╝',
  '██╔████╔██║██║   ██║██████╔╝██║   ██║███████╗',
  '██║╚██╔╝██║██║   ██║██╔══██╗██║   ██║╚════██║',
  '██║ ╚═╝ ██║╚██████╔╝██║  ██║╚██████╔╝███████║',
  '╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
].join('\n')

function MainContent({
  currentFile,
  onSectionChange,
  onFileSave,
  onContentChange,
  darkMode,
  language,
  viewMode,
  setViewMode,
  onFileClick,
  editorRef,
  previewPaneRef,
  onPreviewScroll,
  onOverlayChange,
  avatar,
  username,
  skillPaths = [],
  globalSystemPrompt = '',
  onChatArtifactsVisibilityChange,
  artifactsCloseRequestSeq = 0,
}) {
  const contentRef = useRef(null)
  // 使用父级传入的 editorRef 作为编辑器 ref，若未传则使用本地 ref
  const textareaRef = editorRef || useRef(null)
  
  // 会话上下文（按文件路径维持 conversation_id）需在 AI Hook 之前声明
  const conversationMapRef = useRef({})
  const getConversationId = (key) => {
    return conversationMapRef.current[key] || localStorage.getItem('markov-conv:' + key) || ''
  }
  const setConversationId = (key, id) => {
    conversationMapRef.current[key] = id || ''
    try { localStorage.setItem('markov-conv:' + key, id || '') } catch {}
  }
  const clearConversationId = (key) => {
    conversationMapRef.current[key] = ''
    try { localStorage.removeItem('markov-conv:' + key) } catch {}
  }
  
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [landingInput, setLandingInput] = useState('')
  const [landingCreating, setLandingCreating] = useState(false)
  const [landingDragOver, setLandingDragOver] = useState(false)
  const [landingAttachments, setLandingAttachments] = useState([])
  const [landingProvider, setLandingProviderState] = useState(() => getActiveChatProvider())
  const [landingModel, setLandingModelState] = useState(() => getActiveChatModel())
  const highlightRef = useRef(null)
  const layerRef = useRef(null)
  // AI 流式插入（自定义 Hook）
  const {
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
  } = useAiStreaming({ getConversationId, setConversationId, clearConversationId, currentFile, language })
  const parentDirName = React.useMemo(() => getParentDirName(currentFile), [currentFile?.path])

  // 仅保留 preview 与 split 两种模式，isEditing 等价于 split
  const isEditing = viewMode === 'split'

  // 检查是否为图片文件：使用工具函数 isImageFile

  // 加载文件内容（非白板/图片）
  useEffect(() => {
    const loadFileContent = async () => {
      if (currentFile?.path) {
        // 白板文件由 Whiteboard 自行加载与渲染
        if (isWhiteboardFile(currentFile.path)) {
          setContent('')
          setOriginalContent('')
          // 原始内容已更新为最新
          setViewMode('preview')
          return
        }
        // 如果是对话文件，由 ChatInterface 自行加载与渲染
        if (isChatFile(currentFile.path)) {
          setContent('')
          setOriginalContent('')
          setViewMode('preview')
          return
        }
        // 如果是图片文件，不需要加载文本内容
        if (isImageFile(currentFile.path)) {
          setContent('')
          setOriginalContent('')
          setViewMode('preview')
          return
        }

        try {
          const fileContent = await filesApi.readFile(currentFile.path)
          setContent(fileContent)
          setOriginalContent(fileContent)
          // Markdown 默认进入预览模式，其它文本文件保持分屏
          if (isMarkdownFile(currentFile.path)) {
            setViewMode('preview')
          } else {
            setViewMode('split')
          }
        } catch (error) {
          console.error('加载文件内容失败:', error)
          setContent('')
          setOriginalContent('')
          setViewMode('preview')
        }
      } else {
        setContent('')
        setOriginalContent('')
        setViewMode('preview')
      }
    }

     loadFileContent()
     // 文件切换后延迟更新一次覆盖层
     setTimeout(() => {
       if (window.updateOverlay) {
         window.updateOverlay()
       }
     }, 100)
   }, [currentFile])

  // 计算是否有变更（派生值，避免额外渲染）
  const hasChanges = useMemo(() => content !== originalContent, [content, originalContent])

  // 组件卸载时停止打字机
  useEffect(() => {
    return () => {
      stopTypewriter()
    }
  }, [])

   // 预览滚动时也要刷新覆盖层（父组件会传 onPreviewScroll 调用）
   useEffect(() => {
     const handler = () => {
       if (window.updateOverlay) {
         window.updateOverlay()
       }
     }
     // 预览滚动由父层传入 onPreviewScroll('preview')，这里不直接监听 DOM
     // 但为了稳妥，在窗口尺寸变化时也刷新一次
     window.addEventListener('resize', handler)
     return () => window.removeEventListener('resize', handler)
   }, [])

  // 保存文件
  const handleSave = async () => {
    if (!currentFile?.path || content === originalContent) return

    try {
      setSaving(true)
      await filesApi.saveFile(currentFile.path, content)
       setOriginalContent(content)
      onFileSave?.(currentFile, content)
    } catch (error) {
      console.error('保存文件失败:', error)
      alert('保存失败: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  // 自动保存：停止输入 2s 后保存（仅文本/Markdown）
  useEffect(() => {
    if (!currentFile?.path) return
    if (isWhiteboardFile(currentFile.path)) return
    if (content === originalContent) return
    const t = setTimeout(() => { handleSave() }, 2000)
    return () => clearTimeout(t)
  }, [content, originalContent, currentFile?.path])

  // Markdown 行为拆分为 hook（需先于快捷键注册，以供快捷键使用）
  const {
    insertAtCursor,
    applyInlineWrap,
    applyLineTransform,
    toggleHeading,
    toggleUnorderedList,
    toggleOrderedList,
    toggleChecklist,
    toggleQuote,
    insertCodeBlock,
    insertLink,
    triggerImageUpload,
    insertTable,
    insertHr,
  } = useMarkdownActions(textareaRef, content, setContent, currentFile)

  // 键盘快捷键
  useKeyboardShortcuts({ handleSave, setViewMode, applyInlineWrap })

  // 分屏（编辑）模式自动聚焦（仅在从非分屏 -> 分屏时触发）
  const lastIsEditingRef = useRef(false)
  useEffect(() => {
    if (isEditing && !lastIsEditingRef.current && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      try { el.setSelectionRange(content.length, content.length) } catch {}
    }
    lastIsEditingRef.current = isEditing
  }, [isEditing])

  // 将内容变更同步给父组件（用于右侧目录）
  // 仅在 content 变化时触发，避免因回调引用变化造成的重复触发/循环渲染
  const lastSentRef = useRef(null)
  useEffect(() => {
    if (lastSentRef.current === content) return
    lastSentRef.current = content
    onContentChange?.(content)
  }, [content, onContentChange])

  // 当从设置视图切回编辑器视图时，强制同步一次内容到父组件，
  // 以避免父组件在先前被清空后（例如 setCurrentContent('')）保持空白。
  useEffect(() => {
    lastSentRef.current = null
    onContentChange?.(content)
  }, [])

  // 监控文档内容清空，自动清理 AI 上下文
  const previousContentRef = useRef('')
  useEffect(() => {
    const prevContent = previousContentRef.current
    const currentContent = content || ''
    
    // 检测从有内容变为空内容的情况
    const wasNotEmpty = prevContent.trim() !== ''
    const isNowEmpty = currentContent.trim() === ''
    
    if (wasNotEmpty && isNowEmpty && currentFile?.path) {
      // 文档被清空，清理 AI 上下文
      clearCurrentContext()
    }
    
    previousContentRef.current = currentContent
  }, [content, currentFile?.path, clearCurrentContext])

  // 目录跳转：监听 activeSection 变更由父层驱动（通过 onRequestScrollTo）

  // 图片粘贴与拖拽上传
  const { handleEditorDrop, handleEditorDragOver } = useImageHandling({ isEditing, currentFile, textareaRef, content, setContent })

  // 目录与标题 ID
  useTableOfContents({ content, isEditing, viewMode, previewPaneRef, contentRef, onSectionChange })

  // 分屏滚动同步（在分屏模式下，编辑器在MainContent，预览在RightPanel）
  const { syncScroll, restoreScroll } = useScrollSync(viewMode, textareaRef, previewPaneRef, currentFile?.path)
  
  // 将滚动同步函数暴露给全局，供RightPanel使用
  useEffect(() => {
    window.syncScroll = syncScroll
    window.updateOverlay = updateOverlay
    // 文件切换或首次进入分屏时，恢复左右滚动位置
    requestAnimationFrame(() => restoreScroll())
    return () => {
      delete window.syncScroll
      delete window.updateOverlay
    }
  }, [syncScroll, restoreScroll, currentFile?.path])

  // 自定义 Markdown 渲染组件
  const components = useMemo(() => buildMarkdownComponents(), [])

  // 文本统计
  const stats = useMemo(() => calculateStats(content), [content])

  // 输入变更：同步内容和光标位置
  const handleEditorChange = (e) => {
    setContent(e.target.value)
    requestAnimationFrame(updateOverlay)
  }

   // 编辑器点击事件：更新覆盖层
   const handleEditorClick = () => {
     requestAnimationFrame(updateOverlay)
   }

   // 编辑器 Tab 缩进/反缩进 & 拖拽图片
   const handleEditorKeyDown = (e) => {
    // Tab：缩进/反缩进
    if (e.key === 'Tab') {
      const el = textareaRef.current
      if (!el) return
      e.preventDefault()
      const start = el.selectionStart || 0
      const end = el.selectionEnd || 0
      const selStartLineIdx = (content.slice(0, start).lastIndexOf('\n')) + 1
      const selectedText = content.slice(selStartLineIdx, end)
      const lines = selectedText.split('\n')
      const indented = lines.map((line) => {
        if (e.shiftKey) {
          if (/^\t/.test(line)) return line.replace(/^\t/, '')
          return line.replace(/^ {1,2}/, '')
        }
        return '  ' + line
      }).join('\n')
      const next = content.slice(0, selStartLineIdx) + indented + content.slice(end)
      if (next !== content) setContent(next)
      requestAnimationFrame(() => {
        const newSelStart = selStartLineIdx
        const newSelEnd = selStartLineIdx + indented.length
        try { el.setSelectionRange(newSelStart, newSelEnd) } catch {}
      })
    }
    // 发送到 AI（Ctrl+Enter）
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const el = textareaRef.current
      if (!el) return
      e.preventDefault()
      sendLineToAI()
      return
    }
    // 方向键/回车等导致光标位移，更新覆盖层
    requestAnimationFrame(updateOverlay)
  }

  // 同步高亮层滚动和分屏滚动同步
  const handleEditorScroll = () => {
    const el = textareaRef.current
    const layer = layerRef.current
    if (!el || !layer) return
    const y = el.scrollTop
    // 整个覆盖层随内容滚动，内部的高亮与提示共同平移
    const nextTransform = `translateY(${-y}px)`
    if (layer.style.transform !== nextTransform) {
      layer.style.transform = nextTransform
    }
    // 分屏滚动同步
    syncScroll('editor')
    // 同步覆盖层
    requestAnimationFrame(updateOverlay)
  }

  const renderHighlighted = useMemo(() => {
    return escapeHtml(content)
  }, [content])

  // 计算编辑器当前行在高亮层中的 Y 位置
   const getEditorLineY = () => {
    try {
      const hi = highlightRef.current
      const el = textareaRef.current
      if (!hi || !el) return null

      const { lineStart, lineEnd, cursor } = findCurrentLineRange(textareaRef, content)
      const beforeLine = escapeHtml(content.slice(0, lineStart))
      const beforeCaret = escapeHtml(content.slice(lineStart, cursor))
      const afterCaretRaw = content.slice(cursor, lineEnd)
      const afterCaret = escapeHtml(afterCaretRaw)
      const needsPlaceholder = !beforeCaret && !afterCaret
      const lineHtml = `${beforeCaret}<span class="split-cursor-anchor"></span>${afterCaret || (needsPlaceholder ? '&nbsp;' : '')}`
      const remainder = escapeHtml(content.slice(lineEnd))
      const tmp = `${beforeLine}<span class="split-line-measure">${lineHtml}</span>${remainder}`
      const prevHtml = hi.innerHTML
      hi.innerHTML = tmp

      const containerRect = hi.getBoundingClientRect()
      const lineNode = hi.querySelector('.split-line-measure')
      const anchorNode = hi.querySelector('.split-cursor-anchor')
      const lineRect = lineNode?.getBoundingClientRect()
      const anchorRect = anchorNode?.getBoundingClientRect()

      hi.innerHTML = prevHtml

      const targetRect = anchorRect || lineRect
      if (!targetRect) return null

      let lineHeight = targetRect.height
      if (!lineHeight || !Number.isFinite(lineHeight) || lineHeight <= 0) {
        const backup = (anchorRect && Number.isFinite(anchorRect.height) ? anchorRect.height : null) || (lineRect && Number.isFinite(lineRect.height) ? lineRect.height : null)
        if (backup && Number.isFinite(backup) && backup > 0) {
          lineHeight = backup
        } else {
          const computed = window.getComputedStyle(hi)
          const lineHeightValue = parseFloat(computed.lineHeight)
          if (Number.isFinite(lineHeightValue) && lineHeightValue > 0) {
            lineHeight = lineHeightValue
          } else {
            const fontSizeValue = parseFloat(computed.fontSize)
            lineHeight = Number.isFinite(fontSizeValue) && fontSizeValue > 0 ? fontSizeValue * 1.6 : 24
          }
        }
      }

      const y = targetRect.bottom - containerRect.top + 1
      // console.log('split-editor-line-bottom', { y, lineStart, lineEnd, cursor, lineHeight })
      return y
    } catch (e) {
      console.error('getEditorLineY error:', e)
      return null
    }
  }

  // 计算编辑器当前行在高亮层中的光标 X 位置
  const getEditorCaretX = () => {
    try {
      const hi = highlightRef.current
      const el = textareaRef.current
      if (!hi || !el) return null

      const { lineStart, lineEnd, cursor } = findCurrentLineRange(textareaRef, content)
      const beforeLine = escapeHtml(content.slice(0, lineStart))
      const beforeCaret = escapeHtml(content.slice(lineStart, cursor))
      const afterCaretRaw = content.slice(cursor, lineEnd)
      const afterCaret = escapeHtml(afterCaretRaw)
      const needsPlaceholder = !beforeCaret && !afterCaret
      const lineHtml = `${beforeCaret}<span class="split-cursor-anchor"></span>${afterCaret || (needsPlaceholder ? '&nbsp;' : '')}`
      const remainder = escapeHtml(content.slice(lineEnd))
      const tmp = `${beforeLine}<span class="split-line-measure">${lineHtml}</span>${remainder}`
      const prevHtml = hi.innerHTML
      hi.innerHTML = tmp

      const containerRect = hi.getBoundingClientRect()
      const lineNode = hi.querySelector('.split-line-measure')
      const anchorNode = hi.querySelector('.split-cursor-anchor')
      const lineRect = lineNode?.getBoundingClientRect()
      const anchorRect = anchorNode?.getBoundingClientRect()

      hi.innerHTML = prevHtml

      const targetRect = anchorRect || lineRect
      if (!targetRect) return null

      const x = targetRect.left - containerRect.left
      return x
    } catch (e) {
      console.error('getEditorCaretX error:', e)
      return null
    }
  }

  const findPreviewMatchY = () => {
    try {
      const preview = previewPaneRef?.current
      if (!preview || viewMode !== 'split') return null

      const { lineStart, lineEnd, cursor } = findCurrentLineRange(textareaRef, content)
      const rawLine = content.slice(lineStart, lineEnd) || ''
      const trimmedLine = rawLine.trim()
      // console.log('split-preview raw line', rawLine)

      if (!trimmedLine) {
        return null
      }

      // 位置先验：用当前行序号在全文的比例估算预期 Y，用于区分重复文本
      const allLines = content.split('\n')
      const totalLines = Math.max(allLines.length, 1)
      const currentLineIndex = content.slice(0, lineStart).split('\n').length - 1
      const expectedY = Math.min(preview.scrollHeight, (currentLineIndex + 1) * (preview.scrollHeight / totalLines))

      const isHeading = /^#{1,6}\s+/.test(trimmedLine)
      if (isHeading) {
        const text = trimmedLine.replace(/^#{1,6}\s+/, '').trim()
        const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6')
        for (const h of headings) {
          const t = (h.textContent || '').trim()
          if (t === text) {
            const pr = preview.getBoundingClientRect()
            const hr = h.getBoundingClientRect()
            const y = hr.bottom - pr.top + preview.scrollTop
            // console.log('split-preview heading match', { y, text })
            return y
          }
        }
      }

      // 识别表格对齐行（---|---）直接跳过
      const isTableSeparator = /^(\s*\|)?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+(\|\s*)?$/.test(trimmedLine)
      if (isTableSeparator) {
        return null
      }

      // 标记类型
      const isBlockquote = /^\s*>+/.test(trimmedLine)
      const isListItem = /^\s*(?:[\*\-\+]|\d+[\.)])\s+/.test(trimmedLine)

      // 表格：根据光标所在单元格匹配
      const looksLikeTableRow = /\|/.test(rawLine)
      if (looksLikeTableRow && !/^\s*`{3,}/.test(trimmedLine)) {
        const lineOffset = Math.max(0, (cursor || lineStart) - lineStart)
        const segments = rawLine.split('|')
        let acc = 0
        let cellIndex = 0
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i]
          const nextAcc = acc + seg.length
          if (lineOffset <= nextAcc + (i < segments.length - 1 ? 1 : 0)) {
            cellIndex = i
            break
          }
          acc = nextAcc + 1
        }
        let cellText = (segments[cellIndex] || '').trim()
        if (!cellText) cellText = (segments.find(s => s.trim()) || '').trim()
        const cellProbe = cellText.slice(0, Math.min(24, cellText.length)).trim()
        if (cellProbe) {
          const cells = preview.querySelectorAll('td, th')
          let best = { score: -1, y: null }
          const pr = preview.getBoundingClientRect()
          for (const c of cells) {
            const t = (c.textContent || '').trim()
            if (!t) continue
            if (t.startsWith(cellProbe) || (cellProbe.length >= 4 && t.includes(cellProbe))) {
              const cr = c.getBoundingClientRect()
              const y = cr.bottom - pr.top + preview.scrollTop
              const posBoost = Math.max(0, 800 - Math.abs(y - expectedY) / 2)
              const score = (t.startsWith(cellProbe) ? 1200 : 800) + posBoost
              if (score > best.score) best = { score, y }
            }
          }
          if (best.y != null) {
            // console.log('split-preview table cell match', { cellProbe, y: best.y })
            return best.y
          }
        }
      }

      // 正文/引用/列表：更鲁棒的探针
      // 处理强调符号（*、**、_、__）包裹的文本，如 *当前状态*、**当前状态**
      // 尝试在去除外围强调后进行比较
      const cleaned = trimmedLine
        .replace(/^\s*>+\s*/, '')                 // blockquote
        .replace(/^\s*(?:[\*\-\+]|\d+[\.)])\s+/, '') // list bullet
        .replace(/^\s*\[(?:x|X| )\]\s*/, '')     // task checkbox - [ ] / - [x]
        .replace(/^\s*\|\s*/, '')                 // table leading pipe
        .replace(/\s*\|\s*/g, ' ')               // table cell separators
        .replace(/\*\*(.*?)\*\*/g, '$1')        // remove strong **text**
        .replace(/\*(.*?)\*/g, '$1')             // remove em *text*
        .replace(/__(.*?)__/g, '$1')               // remove __text__
        .replace(/_(.*?)_/g, '$1')                 // remove _text_
        .replace(/`+/g, '')                        // backticks
        .trim()

      const probe = cleaned.slice(0, Math.min(30, cleaned.length)).trim()
      const normalizedProbe = probe.replace(/\s+/g, ' ').toLowerCase()
      // console.log('split-preview probe', { probe, rawLine })
      if (!probe) return null

      // 检测"字段：值"格式，优先精确匹配字段名
      const isFieldValueLine = /^([^:：\s]{1,12})\s*[：:]\s*(.*)/.test(cleaned)
      let fieldLabel = null
      let fieldValue = null
      if (isFieldValueLine) {
        const match = cleaned.match(/^([^:：\s]{1,12})\s*[：:]\s*(.*)/)
        if (match) {
          fieldLabel = match[1].trim()
          fieldValue = match[2].trim()
        }
      }

      const pickBestMatchY = (nodes) => {
        let best = { score: -1, y: null }
        const pr = preview.getBoundingClientRect()
        for (const c of nodes) {
          const text = (c.textContent || '').trim()
          if (!text) continue
          const tn = text.replace(/\s+/g, ' ').toLowerCase()
          let score = 0
          
          // 字段标签精确匹配优先级最高
          if (fieldLabel && tn.includes(fieldLabel.toLowerCase())) {
            score = 2000 + fieldLabel.length * 50
            // 如果还包含字段值，额外加分
            if (fieldValue && fieldValue.length >= 2 && tn.includes(fieldValue.toLowerCase())) {
              score += 500
            }
          } else {
            // 常规文本匹配
            if (tn.startsWith(normalizedProbe)) score = 1000 + normalizedProbe.length
            else if (normalizedProbe.length >= 5 && tn.includes(normalizedProbe)) score = 500 + normalizedProbe.length
            else {
              // 前缀相似度（字符逐位比较）
              let pref = 0
              for (let i = 0; i < Math.min(tn.length, normalizedProbe.length); i++) {
                if (tn[i] === normalizedProbe[i]) pref++
                else break
              }
              score = pref
            }
          }
          
          const cr = c.getBoundingClientRect()
          const y = cr.bottom - pr.top + preview.scrollTop
          // 位置先验加权：越接近 expectedY 得分越高，用于区分重复文本的上/下两处
          const posBonus = Math.max(0, 400 - Math.abs(y - expectedY) / 3)
          const finalScore = score + posBonus
          if (finalScore > best.score) {
            best = { score: finalScore, y }
          }
        }
        // console.log('split-preview best match', { fieldLabel, fieldValue, score: best.score, probe })
        return best.y
      }

      if (isBlockquote) {
        const candidates = preview.querySelectorAll('blockquote, blockquote p, blockquote li')
        const y = pickBestMatchY(candidates)
        if (y != null) return y
      }

      if (isListItem) {
        const candidates = preview.querySelectorAll('li, p label, p')
        const y = pickBestMatchY(candidates)
        if (y != null) return y
      }

      const candidates = preview.querySelectorAll('p, li, blockquote, pre, td, th, h1, h2, h3, h4, h5, h6')
      const y = pickBestMatchY(candidates)
      if (y != null) return y

      // console.log('split-preview estimated bottom', { expectedY, currentLineIndex, totalLines })
      return expectedY
    } catch (e) {
      console.error('findPreviewMatchY error:', e)
      return null
    }
  }

  const updateOverlay = () => {
    if (viewMode !== 'split') {
      onOverlayChange?.({ visible: false })
      return
    }
    const editor = textareaRef.current
    const preview = previewPaneRef?.current
    const hi = highlightRef.current
    if (!editor || !preview || !hi) {
      // console.log('split-overlay missing elements', { editor: !!editor, preview: !!preview, hi: !!hi })
      onOverlayChange?.({ visible: false })
      return
    }
    const editorRect = editor.getBoundingClientRect()
    const previewRect = preview.getBoundingClientRect()
    const yEditorLocal = getEditorLineY()
    const xEditorLocal = getEditorCaretX()
    const yPreviewScroll = findPreviewMatchY()
    // console.log('split-overlay debug', { yEditorLocal, xEditorLocal, yPreviewScroll, viewMode, editorRect, previewRect })
    if (yEditorLocal == null || xEditorLocal == null || yPreviewScroll == null) {
      // console.log('split-overlay hidden: no match')
      onOverlayChange?.({ visible: false })
      return
    }
    const hiRect = hi.getBoundingClientRect()
    const yEditor = hiRect.top + yEditorLocal
    const xEditor = hiRect.left + xEditorLocal
    const yPreview = previewRect.top + yPreviewScroll - preview.scrollTop
    // console.log('split-overlay visible', { xEditor, yEditor, yPreview, yEditorLocal, xEditorLocal, yPreviewScroll, scrollTop: preview.scrollTop })
    onOverlayChange?.({
      visible: true,
      editorRect,
      previewRect,
      yEditor,
      yPreview,
      xEditor,
    })
  }

  const sendLineToAI = async () => {
    if (aiHandleRef.current) return
    // 重置打字机
    stopTypewriter()

    const { lineStart, lineEnd } = findCurrentLineRange(textareaRef, content)
    const line = content.slice(lineStart, lineEnd)
    const query = line.trim()
    if (!query) return
    const contextBefore = content.slice(0, lineStart)
    const before = content.slice(0, lineEnd)
    const after = content.slice(lineEnd)

    // 立即设置光标并显示 Thinking 状态
    const el = textareaRef.current
    let insertPos = (before + '\n\n').length
    
    // 1. 立即跳转光标
    if (el) {
      el.focus()
      el.setSelectionRange(insertPos, insertPos)
    }

    // 2. 立即显示 Thinking
    setAiStatus('streaming')
    
    // 3. 计算并显示 AI 指示点
    let anchorHtml = ''
    try {
      const lastCharIdx = lineEnd
      anchorHtml = escapeHtml(content.slice(0, lastCharIdx)) + '<span class="caret-anchor"></span>' + escapeHtml(content.slice(lastCharIdx))
    } catch {}

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

    startStreaming({
      mentionQuery: query,
      contextBefore,
      before,
      after,
      setContent,
      anchorHtml,
      renderHighlighted,
      highlightRef,
      attachedFiles: [],
    })
  }

  // runTypewriter 已抽离到 useAiStreaming
  // 最近文件处理功能 [[memory:5684211]]
  const getRecentFiles = () => {
    try {
      const recent = localStorage.getItem('markov-recent-files')
      return recent ? JSON.parse(recent) : []
    } catch {
      return []
    }
  }

  const addToRecentFiles = (file) => {
    try {
      const recent = getRecentFiles()
      const filtered = recent.filter(f => f.path !== file.path)
      const updated = [file, ...filtered].slice(0, 8) // 保留最近8个文件
      localStorage.setItem('markov-recent-files', JSON.stringify(updated))
    } catch {}
  }

  // 当文件被点击时，添加到最近列表
  useEffect(() => {
    if (currentFile?.path) {
      addToRecentFiles(currentFile)
    }
  }, [currentFile?.path])

  const handleOpenFile = () => {
    // 创建一个隐藏的文件输入元素
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.txt,.excalidraw'
    input.style.display = 'none'
    
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      
      try {
        const content = await file.text()
        const newFile = await filesApi.createFile(file.name, content)
        onFileClick(newFile)
      } catch (error) {
        console.error('导入文件失败:', error)
        alert('导入文件失败: ' + error.message)
      }
    }
    
    document.body.appendChild(input)
    input.click()
    document.body.removeChild(input)
  }

  const handleLandingProviderChange = (provider) => {
    const nextProvider = normalizeChatProvider(provider)
    const nextModel = normalizeChatModel(landingModel, nextProvider)
    setLandingProviderState(nextProvider)
    setLandingModelState(nextModel)
    setActiveChatProvider(nextProvider)
    setActiveChatModel(nextModel, nextProvider)
  }

  const handleLandingModelChange = (model) => {
    const nextProvider = resolveProviderForModel(model, landingProvider)
    const nextModel = normalizeChatModel(model, nextProvider)
    if (nextProvider !== landingProvider) {
      setLandingProviderState(nextProvider)
      setActiveChatProvider(nextProvider)
    }
    setLandingModelState(nextModel)
    setActiveChatModel(nextModel, nextProvider)
  }

  const resolveLandingAbsolutePath = useCallback(async (fileLike) => {
    const candidatePath = String(
      fileLike?.path ||
      fileLike?.absolutePath ||
      fileLike?.webkitRelativePath ||
      '',
    ).trim()
    if (!candidatePath) return ''
    if (isAbsolutePath(candidatePath)) return normalizeDroppedPath(candidatePath)
    try {
      const absolutePath = await filesApi.getAbsolutePath(candidatePath)
      if (absolutePath) return normalizeDroppedPath(absolutePath)
    } catch {}
    return normalizeDroppedPath(candidatePath)
  }, [])

  const appendLandingAttachments = useCallback((items) => {
    const incoming = Array.isArray(items) ? items.filter(Boolean) : []
    if (incoming.length === 0) return
    setLandingAttachments((prev) => {
      const next = Array.isArray(prev) ? [...prev] : []
      const seen = new Set(next.map((item) => String(item?.path || '').trim().toLowerCase()).filter(Boolean))
      for (const item of incoming) {
        const pathValue = String(item?.path || '').trim()
        if (!pathValue) continue
        const key = pathValue.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        next.push({
          path: pathValue,
          name: String(item?.name || '').trim() || pathValue.split(/[/\\]/).pop() || pathValue,
        })
      }
      return next
    })
  }, [])

  const handleLandingDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const types = Array.from(e.dataTransfer?.types || [])
    if (types.includes('text/plain') || types.includes('Files')) {
      setLandingDragOver(true)
    }
  }

  const handleLandingDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleLandingDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const container = e.currentTarget
    const relatedTarget = e.relatedTarget
    if (!container.contains(relatedTarget)) {
      setLandingDragOver(false)
    }
  }

  const handleLandingDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setLandingDragOver(false)
    try {
      const droppedFiles = Array.from(e.dataTransfer?.files || [])
      const normalized = []
      for (const droppedFile of droppedFiles) {
        const absolutePath = await resolveLandingAbsolutePath(droppedFile)
        if (!absolutePath) continue
        normalized.push({
          path: absolutePath,
          name: String(droppedFile?.name || '').trim(),
        })
      }

      const plainText = String(e.dataTransfer?.getData('text/plain') || '').trim()
      if (plainText) {
        let parsed = null
        try {
          parsed = JSON.parse(plainText)
        } catch {
          parsed = null
        }
        if (parsed?.path) {
          const absolutePath = await resolveLandingAbsolutePath(parsed)
          if (absolutePath) {
            normalized.push({
              path: absolutePath,
              name: String(parsed?.name || '').trim(),
            })
          }
        } else if (isAbsolutePath(plainText)) {
          normalized.push({
            path: normalizeDroppedPath(plainText),
            name: '',
          })
        }
      }

      appendLandingAttachments(normalized)
    } catch (error) {
      console.error('处理落地页拖拽失败:', error)
      alert('处理拖拽文件失败: ' + (error?.message || '未知错误'))
    }
  }

  const removeLandingAttachment = (index) => {
    setLandingAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleLandingAddMenuSelect = (optionId) => {
    if (optionId.startsWith('provider:')) {
      const nextProvider = optionId.replace('provider:', '')
      handleLandingProviderChange(nextProvider)
      return
    }
    if (optionId.startsWith('model:')) {
      const nextModel = optionId.replace('model:', '')
      handleLandingModelChange(nextModel)
    }
  }

  const landingAddMenuOptions = useMemo(() => {
    return [
      ...CHAT_PROVIDER_OPTIONS.map((providerOption) => ({
        id: `provider:${providerOption.id}`,
        label: providerOption.label,
        selected: landingProvider === providerOption.id,
      })),
      { id: 'separator:model', type: 'separator' },
      ...getAllChatModelOptions().map((modelOption) => ({
        id: `model:${modelOption.id}`,
        label: modelOption.label,
        selected: landingModel === modelOption.id,
      })),
    ]
  }, [landingProvider, landingModel])

  const buildMorosChatFileName = () => {
    const now = new Date()
    const pad = (value) => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}.MoRos`
  }

  const handleCreateChatFromLanding = async (promptText = '') => {
    const prompt = String(promptText || '').trim()
    const pendingFiles = Array.isArray(landingAttachments)
      ? landingAttachments
          .map((item) => ({
            type: 'path',
            transfer_method: 'local_path',
            path: String(item?.path || '').trim(),
            name: String(item?.name || '').trim(),
          }))
          .filter((item) => item.path)
      : []
    if (!prompt && pendingFiles.length === 0) return
    if (landingCreating) return
    try {
      setLandingCreating(true)
      const nowIso = new Date().toISOString()
      const baseName = buildMorosChatFileName()
      const initialContent = JSON.stringify({
        type: 'moroschat',
        version: 1,
        provider: landingProvider,
        model: landingModel,
        conversationId: '',
        messages: [],
        createdAt: nowIso,
        updatedAt: nowIso
      }, null, 2)
      const file = await filesApi.createFile(baseName, initialContent)
      markChatFileOpened(file?.path)
      try {
        sessionStorage.setItem(
          'moros-pending-chat',
          JSON.stringify({
            path: file.path,
            prompt,
            files: pendingFiles,
            provider: landingProvider,
            model: landingModel,
          }),
        )
      } catch {}
      setLandingInput('')
      setLandingAttachments([])
      setLandingDragOver(false)
      onFileClick?.(file)
    } catch (error) {
      console.error('创建对话失败:', error)
      alert('创建对话失败: ' + error.message)
    } finally {
      setLandingCreating(false)
    }
  }

  // 移除样式编辑模式，改为使用侧边栏

  if (!currentFile) {
    return (
      <main className="main-content">
        <div className="content-wrapper chat-landing-wrapper">
          <div className="chat-landing-screen">
            <div className="chat-landing-ascii" aria-hidden="true">
              <div className="chat-empty-ascii-wrapper">
                <pre className="chat-empty-ascii" role="img" aria-label="MoRos">{MOROS_ASCII_ART}</pre>
                <pre className="chat-empty-ascii-glow" aria-hidden="true">{MOROS_ASCII_ART}</pre>
              </div>
            </div>
            <ChatComposer
              value={landingInput}
              onValueChange={setLandingInput}
              onSubmit={() => handleCreateChatFromLanding(landingInput)}
              onDragEnter={handleLandingDragEnter}
              onDragOver={handleLandingDragOver}
              onDragLeave={handleLandingDragLeave}
              onDrop={handleLandingDrop}
              onAttach={handleOpenFile}
              addMenuOptions={landingAddMenuOptions}
              onAddMenuSelect={handleLandingAddMenuSelect}
              placeholder="Assign a task or ask anything"
              disabled={landingCreating}
              canSubmit={Boolean(landingInput.trim() || landingAttachments.length > 0)}
              autoFocus
              dragOver={landingDragOver}
              attachTitle="Chat options"
              submitTitle="Start chat"
              stopTitle="Start chat"
            />
            {landingAttachments.length > 0 && (
              <div className="landing-uploaded-files">
                {landingAttachments.map((file, index) => (
                  <div key={`${file.path}-${index}`} className="landing-uploaded-file">
                    <span className="landing-uploaded-file-name" title={file.path}>{file.name || file.path}</span>
                    <button
                      type="button"
                      className="landing-uploaded-file-remove"
                      onClick={() => removeLandingAttachment(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    )
  }

  // 如果是图片文件，显示图片预览（极简，无动效、无外链）
  if (isImageFile(currentFile.path)) {
    const imageUrl = filesApi.getRawFileUrl(currentFile.path)
    return (
      <main className="main-content">
        <div className="content-toolbar">
          <div className="file-info">
            {parentDirName && <span className="folder-name">{parentDirName}</span>}
            {parentDirName && <span className="breadcrumb-sep">›</span>}
            <span className="file-name">{currentFile.name}</span>
          </div>
        </div>

        <div className="content-wrapper">
          <div className="image-preview minimal">
            <img 
              src={imageUrl} 
              alt={currentFile.name}
              className="preview-image minimal"
              onError={(e) => {
                e.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'image-error', textContent: '无法加载图片' }))
              }}
            />
          </div>
        </div>
      </main>
    )
  }

  // 如果是白板文件，使用 Excalidraw 渲染
  if (isWhiteboardFile(currentFile.path)) {
    return (
      <main className="main-content">
        <div className="content-wrapper whiteboard-wrapper" style={{ padding: 0, maxWidth: 'none', width: '100%', height: '100%' }}>
          <EnhancedWhiteboard currentFile={currentFile} onFileSave={onFileSave} theme={darkMode ? 'dark' : 'light'} language={language} onFileClick={onFileClick} />
        </div>
      </main>
    )
  }

  // 如果是对话文件，使用 ChatInterface 渲染
  if (isChatFile(currentFile.path)) {
    return (
      <main className="main-content">
        <div className="content-wrapper chat-wrapper" style={{ padding: 0, maxWidth: 'none', width: '100%', height: '100%' }}>
          <ChatInterface
            currentFile={currentFile}
            darkMode={darkMode}
            avatar={avatar}
            username={username}
            skillPaths={skillPaths}
            globalSystemPrompt={globalSystemPrompt}
            onArtifactsVisibilityChange={onChatArtifactsVisibilityChange}
            artifactsCloseRequestSeq={artifactsCloseRequestSeq}
          />
        </div>
      </main>
    )
  }

  if (isPlainEditorOnlyFile(currentFile.path)) {
    return (
      <main className="main-content">
        <div className="content-wrapper plain-editor-wrapper" ref={contentRef}>
          <div className="editor-container plain-editor-mode">
            <EditorOverlay
              layerRef={layerRef}
              highlightRef={highlightRef}
              renderHtml={renderHighlighted}
              aiStatus={aiStatus}
              aiPos={aiPos}
            />
            <MarkdownEditor
              textareaRef={textareaRef}
              value={content}
              onChange={handleEditorChange}
              placeholder="Start writing..."
              onKeyDown={handleEditorKeyDown}
              onClick={handleEditorClick}
              onDrop={handleEditorDrop}
              onDragOver={handleEditorDragOver}
              onScroll={handleEditorScroll}
            />
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="main-content">
      <Toolbar
        parentDirName={parentDirName}
        currentFileName={currentFile.name}
        hasChanges={hasChanges}
        onSave={handleSave}
        saving={saving}
        stats={stats}
        viewMode={viewMode}
        setViewMode={setViewMode}
        applyInlineWrap={applyInlineWrap}
        toggleHeading={toggleHeading}
        toggleUnorderedList={toggleUnorderedList}
        toggleOrderedList={toggleOrderedList}
        toggleChecklist={toggleChecklist}
        toggleQuote={toggleQuote}
        insertLink={insertLink}
        triggerImageUpload={triggerImageUpload}
        insertCodeBlock={insertCodeBlock}
        insertTable={insertTable}
        insertHr={insertHr}
        clearCurrentContext={clearCurrentContext}
      />

      <div className="content-wrapper" ref={contentRef}>
        {isEditing ? (
            <div className="editor-container">
              <EditorOverlay
                layerRef={layerRef}
                highlightRef={highlightRef}
                renderHtml={renderHighlighted}
                aiStatus={aiStatus}
                aiPos={aiPos}
              />
              <MarkdownEditor
                textareaRef={textareaRef}
              value={content}
              onChange={handleEditorChange}
              placeholder="开始编写你的 Markdown 内容..."
              onKeyDown={handleEditorKeyDown}
              onClick={handleEditorClick}
              onDrop={handleEditorDrop}
              onDragOver={handleEditorDragOver}
              onScroll={handleEditorScroll}
            />
          </div>
        ) : (
          <MarkdownPreview
            content={content}
            components={components}
            bare
          />
        )}
      </div>
    </main>
  )
}

export default MainContent

