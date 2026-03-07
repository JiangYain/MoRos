import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { chatWithDifyStreaming, getDifyApiKey } from '../utils/dify'
import {
  getGitHubCopilotAvailableModels,
  getValidGitHubCopilotCredentials,
  resolveGitHubCopilotModel,
} from '../utils/githubCopilot'
import { chatWithLocalCliStreaming, abortLocalCliSession, closeLocalCliSession } from '../utils/localCliAgent'
import { getValidOpenAICodexCredentials } from '../utils/openaiCodex'
import { getOpenCodeGoApiKey, getOpenCodeGoBaseUrl } from '../utils/opencodeGo'
import {
  CHAT_PROVIDER_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_PROVIDER,
  getAllChatModelOptions,
  normalizeChatModel,
  normalizeChatProvider,
  resolveProviderForModel,
  setActiveChatModel,
  setActiveChatProvider,
} from '../utils/chatProvider'
import { Streamdown } from 'streamdown'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { cjk } from '@streamdown/cjk'
import { useI18n } from '../utils/i18n'
import { filesApi } from '../utils/api'
import ChatComposer from './ChatComposer'
import MorosShapeIcon from './MorosShapeIcon'
import './ChatInterface.css'
import {
  appendAttachmentPathsToPrompt,
  ARTIFACT_FILE_EXTENSIONS,
  collectArtifactPathsFromMessages,
  isAbsolutePath,
  isArtifactWorkspaceCandidate,
  normalizeAttachmentPath,
  resolveAttachmentName,
  resolveAttachmentPath,
} from './chat-interface/artifacts'
import {
  buildSegmentsFromAgentPayload,
  cloneAssistantSegments,
  cloneToolEvents,
  extractAssistantErrorFromAgentEnd,
  extractTrailingErrorNote,
  flattenToolEventsFromSegments,
  mergeToolEvent,
  prependGlobalSystemPrompt,
  segmentsContainErrorNote,
} from './chat-interface/assistantSegments'
import { loadChatDraft, persistChatDraft } from './chat-interface/chatDraftStorage'
import ArtifactsToggleButton from './chat-interface/ArtifactsToggleButton'
import ChatArtifactsPanel from './chat-interface/ChatArtifactsPanel'
import ChatEmptyTerminalState from './chat-interface/ChatEmptyTerminalState'
import ToolExecutionTimeline from './chat-interface/ToolExecutionTimeline'

/**
 * ChatInterface 组件
 * 用于 .MoRos 文件的对话界面
 * 设计风格：简单主义，iOS感，适度留白，精致排版
 */
function ChatInterface({
  currentFile,
  darkMode,
  avatar,
  username,
  skillPaths = [],
  globalSystemPrompt = '',
  onArtifactsVisibilityChange,
  artifactsCloseRequestSeq = 0,
}) {
  const { t, lang } = useI18n()
  const [messages, setMessages] = useState([])
  const [chatProvider, setChatProvider] = useState(DEFAULT_CHAT_PROVIDER)
  const [chatModel, setChatModel] = useState(DEFAULT_CHAT_MODEL)
  const [copilotAvailableModels, setCopilotAvailableModels] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState('')
  const [agentRuntimeSessionId, setAgentRuntimeSessionId] = useState('')
  const [agentSessionFile, setAgentSessionFile] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadingFiles, setUploadingFiles] = useState([])
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingSegments, setStreamingSegments] = useState([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [justFinished, setJustFinished] = useState(false)
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null)
  const justFinishedTimerRef = useRef(null)
  const copyMessageTimerRef = useRef(null)
  const [autoPrompt, setAutoPrompt] = useState('')
  const [autoPromptFiles, setAutoPromptFiles] = useState([])
  const [fromLanding, setFromLanding] = useState(false)
  const [artifactsOpen, setArtifactsOpen] = useState(() => {
    try {
      return localStorage.getItem('moros-chat-artifacts-open') === '1'
    } catch {
      return false
    }
  })
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState('')
  const [artifactEntries, setArtifactEntries] = useState([])
  const [activeArtifactId, setActiveArtifactId] = useState('')
  const [artifactsTab, setArtifactsTab] = useState('files')
  const [artifactSearchTerm, setArtifactSearchTerm] = useState('')
  const [sessionActionBusy, setSessionActionBusy] = useState(false)
  const [sessionPanelMessage, setSessionPanelMessage] = useState('')
  const timeLocale = lang === 'en' ? 'en-US' : 'zh-CN'
  const normalizedSkillPaths = useMemo(() => {
    if (!Array.isArray(skillPaths)) return []
    const cleaned = skillPaths
      .map((p) => String(p || '').trim())
      .filter(Boolean)
    return Array.from(new Set(cleaned))
  }, [skillPaths])
  
  // 将 \[...\]/\(...\) 转为 $$...$$/$...$，并避免代码块被误处理
  const normalizeMathDelimiters = useCallback((text) => {
    if (!text) return ''
    // 分块：简单按代码围栏切分，奇偶位为代码块外部
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts
      .map((part, idx) => {
        // 代码块原样返回
        if (part.startsWith('```')) return part
        // 块级公式 \[ ... \] -> $$ ... $$
        let out = part.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
        // 行内公式 \( ... \) -> $ ... $
        out = out.replace(/\\\(([^\n]*?)\\\)/g, (_, inner) => `$${inner}$`)
        return out
      })
      .join('')
  }, [])

  const normalizeCompactTableRows = useCallback((text) => {
    const source = String(text || '')
    if (!source) return ''
    const hasTableSeparator = /\|[\t ]*:?-{3,}:?[\t ]*(\|[\t ]*:?-{3,}:?[\t ]*)+/.test(source)
    if (!hasTableSeparator) return source
    return source
      .replace(/[ \t]+\|(?=\s*:?-{3,}:?\s*\|)/g, '\n|')
      .replace(/[ \t]+\|(?=\s*\d+\s*\|)/g, '\n|')
  }, [])

  const normalizeMarkdownForRender = useCallback((text) => {
    if (!text) return ''
    const normalizedMath = normalizeMathDelimiters(text)
    const parts = normalizedMath.split(/(```[\s\S]*?```)/g)
    return parts
      .map((part) => (part.startsWith('```') ? part : normalizeCompactTableRows(part)))
      .join('')
  }, [normalizeMathDelimiters, normalizeCompactTableRows])

  const normalizeBrandText = useCallback((text) => {
    return String(text || '').replace(/markov/gi, 'MoRos')
  }, [])
  
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const streamHandleRef = useRef(null) // 用于停止流式响应
  const loadTokenRef = useRef(0)
  const thinkingStartedAtRef = useRef(0)
  const thinkingHideTimerRef = useRef(null)
  const firstTokenSeenRef = useRef(false)
  const streamingSegmentsRef = useRef([])
  const draftPathRef = useRef('')
  const skipNextDraftPersistRef = useRef(false)

  const resetStreamingSegments = useCallback(() => {
    streamingSegmentsRef.current = []
    setStreamingSegments([])
  }, [])

  const appendStreamingToolSegment = useCallback((event) => {
    const next = cloneAssistantSegments(streamingSegmentsRef.current)
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
    streamingSegmentsRef.current = next
    setStreamingSegments(next)
  }, [])

  const appendStreamingTextSegment = useCallback((chunk) => {
    const text = String(chunk || '')
    if (!text) return
    const next = cloneAssistantSegments(streamingSegmentsRef.current)
    const lastIndex = next.length - 1
    const lastSegment = next[lastIndex]
    if (lastSegment?.type === 'text') {
      next[lastIndex] = {
        type: 'text',
        content: `${String(lastSegment.content || '')}${text}`,
      }
    } else {
      next.push({
        type: 'text',
        content: text,
      })
    }
    streamingSegmentsRef.current = next
    setStreamingSegments(next)
  }, [])

  const snapshotStreamingSegments = useCallback(() => {
    return cloneAssistantSegments(streamingSegmentsRef.current)
  }, [])

  const normalizeAssistantSegmentsForPersist = useCallback((segments) => {
    const cloned = cloneAssistantSegments(segments)
    return cloned
      .map((segment) => {
        if (segment.type === 'tools') {
          const tools = cloneToolEvents(segment.tools)
          if (tools.length === 0) return null
          return { type: 'tools', tools }
        }
        if (segment.type === 'text') {
          const text = normalizeMarkdownForRender(normalizeBrandText(segment.content || ''))
          if (!String(text).trim()) return null
          return { type: 'text', content: text }
        }
        return null
      })
      .filter(Boolean)
  }, [normalizeBrandText, normalizeMarkdownForRender])

  const consumePendingPromptForFile = useCallback((targetPath) => {
    try {
      const raw = sessionStorage.getItem('moros-pending-chat')
      if (!raw) return { prompt: '', files: [] }
      const pending = JSON.parse(raw)
      const prompt = String(pending?.prompt || '').trim()
      const files = Array.isArray(pending?.files)
        ? pending.files
            .map((item) => ({
              type: 'path',
              transfer_method: 'local_path',
              path: normalizeAttachmentPath(item?.path),
              name: String(item?.name || '').trim(),
            }))
            .filter((item) => item.path)
        : []
      if ((!prompt && files.length === 0) || pending?.path !== targetPath) {
        return { prompt: '', files: [] }
      }
      sessionStorage.removeItem('moros-pending-chat')
      return { prompt, files }
    } catch {
      return { prompt: '', files: [] }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (thinkingHideTimerRef.current) {
        clearTimeout(thinkingHideTimerRef.current)
      }
    }
  }, [])

  // 从文件内容加载对话历史
  useEffect(() => {
    if (!currentFile?.path) return
    resetStreamingSegments()
    setStreamingContent('')
    setSessionPanelMessage('')
    setAutoPrompt('')
    setAutoPromptFiles([])
    const token = ++loadTokenRef.current
    let disposed = false
    const isStale = () => disposed || token !== loadTokenRef.current

    const loadChatHistory = async () => {
      try {
        const { filesApi } = await import('../utils/api')
        const content = await filesApi.readFile(currentFile.path)
        if (isStale()) return
        
        if (content) {
          const data = JSON.parse(content)
          const providerFromFile = normalizeChatProvider(data?.provider)
          setChatProvider(providerFromFile)
          setChatModel(normalizeChatModel(data?.model, providerFromFile))
          const normalizedMessages = (data.messages || []).map((msg) => {
            if (!msg || typeof msg !== 'object') return msg
            const normalizedContent =
              typeof msg.content === 'string' ? normalizeBrandText(msg.content) : msg.content
            const normalizedSegments = Array.isArray(msg.segments)
              ? msg.segments.map((segment) => {
                  if (segment?.type !== 'text') return segment
                  const normalizedText = normalizeBrandText(segment.content || '')
                  return normalizedText === segment.content
                    ? segment
                    : { ...segment, content: normalizedText }
                })
              : msg.segments
            if (normalizedContent === msg.content && normalizedSegments === msg.segments) return msg
            return {
              ...msg,
              content: normalizedContent,
              segments: normalizedSegments,
            }
          })
          setMessages(normalizedMessages)
          setConversationId(data.conversationId || '')
          setAgentRuntimeSessionId(data.agentRuntimeSessionId || '')
          setAgentSessionFile(data.agentSessionFile || '')
        } else {
          setChatProvider(DEFAULT_CHAT_PROVIDER)
          setChatModel(DEFAULT_CHAT_MODEL)
          setMessages([])
          setConversationId('')
          setAgentRuntimeSessionId('')
          setAgentSessionFile('')
        }

        const pendingPayload = consumePendingPromptForFile(currentFile.path)
        if (pendingPayload.prompt || pendingPayload.files.length > 0) {
          setAutoPrompt(pendingPayload.prompt)
          setAutoPromptFiles(pendingPayload.files)
          setFromLanding(true)
        }
      } catch (error) {
        if (isStale()) return
        console.error('加载对话历史失败:', error)
        setChatProvider(DEFAULT_CHAT_PROVIDER)
        setChatModel(DEFAULT_CHAT_MODEL)
        setMessages([])
        setConversationId('')
        setAgentRuntimeSessionId('')
        setAgentSessionFile('')
      }
    }
    
    loadChatHistory()
    return () => {
      disposed = true
    }
  }, [currentFile?.path, normalizeBrandText, consumePendingPromptForFile, resetStreamingSegments])

  useEffect(() => {
    const currentPath = String(currentFile?.path || '').trim()
    if (!currentPath) return
    draftPathRef.current = currentPath
    skipNextDraftPersistRef.current = true
    setInputValue(loadChatDraft(currentPath))
  }, [currentFile?.path])

  useEffect(() => {
    const currentPath = String(currentFile?.path || '').trim()
    if (!currentPath || draftPathRef.current !== currentPath) return
    if (skipNextDraftPersistRef.current) {
      skipNextDraftPersistRef.current = false
      return
    }
    persistChatDraft(currentPath, inputValue)
  }, [currentFile?.path, inputValue])

  // 保存对话历史到文件
  const saveChatHistory = useCallback(async (msgs, convId, overrides = {}) => {
    if (!currentFile?.path) return
    
    try {
      const { filesApi } = await import('../utils/api')
      const provider = normalizeChatProvider(overrides.provider ?? chatProvider)
      const model = normalizeChatModel(overrides.model ?? chatModel, provider)
      const runtimeSessionId = String((overrides.agentRuntimeSessionId ?? agentRuntimeSessionId) || '').trim()
      const sessionFile = String((overrides.agentSessionFile ?? agentSessionFile) || '').trim()
      const data = {
        type: 'moroschat',
        version: 1,
        provider,
        model,
        conversationId: convId,
        agentRuntimeSessionId: runtimeSessionId || undefined,
        agentSessionFile: sessionFile || undefined,
        messages: msgs,
        updatedAt: new Date().toISOString()
      }
      await filesApi.saveFile(currentFile.path, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('保存对话历史失败:', error)
    }
  }, [currentFile, chatProvider, chatModel, agentRuntimeSessionId, agentSessionFile])

  const persistChatMeta = useCallback((provider, model) => {
    const normalizedProvider = normalizeChatProvider(provider)
    const normalizedModel = normalizeChatModel(model, normalizedProvider)
    saveChatHistory(messages, conversationId, {
      provider: normalizedProvider,
      model: normalizedModel,
    })
  }, [messages, conversationId, saveChatHistory])

  const persistAgentSessionMeta = useCallback((runtimeSessionIdValue, sessionFileValue) => {
    saveChatHistory(messages, conversationId, {
      provider: chatProvider,
      model: chatModel,
      agentRuntimeSessionId: runtimeSessionIdValue,
      agentSessionFile: sessionFileValue,
    })
  }, [messages, conversationId, chatProvider, chatModel, saveChatHistory])

  const handleChatProviderChange = useCallback((provider) => {
    const nextProvider = normalizeChatProvider(provider)
    const nextModel = normalizeChatModel(chatModel, nextProvider)
    setChatProvider(nextProvider)
    setChatModel(nextModel)
    setActiveChatProvider(nextProvider)
    setActiveChatModel(nextModel, nextProvider)
    // provider 切换后清理待发送附件，避免跨 provider 残留格式不兼容
    setUploadedFiles([])
    setUploadingFiles([])
    persistChatMeta(nextProvider, nextModel)
  }, [chatModel, persistChatMeta])

  const handleChatModelChange = useCallback((model) => {
    const nextProvider = resolveProviderForModel(model, chatProvider)
    const nextModel = normalizeChatModel(model, nextProvider)
    if (nextProvider !== chatProvider) {
      setChatProvider(nextProvider)
      setActiveChatProvider(nextProvider)
      // 自动切 provider 时，清理待发送附件，避免跨 provider 兼容问题
      setUploadedFiles([])
      setUploadingFiles([])
    }
    setChatModel(nextModel)
    setActiveChatModel(nextModel, nextProvider)
    persistChatMeta(nextProvider, nextModel)
  }, [chatProvider, persistChatMeta])

  useEffect(() => {
    let disposed = false
    const syncCopilotModels = async () => {
      if (chatProvider !== 'github-copilot') {
        if (!disposed) setCopilotAvailableModels([])
        return
      }
      const credentials = await getValidGitHubCopilotCredentials()
      if (!credentials || disposed) {
        if (!disposed) setCopilotAvailableModels([])
        return
      }
      try {
        const availableModels = await getGitHubCopilotAvailableModels(credentials)
        if (disposed) return
        setCopilotAvailableModels(availableModels)
        if (!availableModels.length) return
        const resolved = await resolveGitHubCopilotModel(chatModel, credentials, availableModels)
        if (!disposed && resolved.model && resolved.model !== chatModel) {
          const nextModel = normalizeChatModel(resolved.model, 'github-copilot')
          setChatModel(nextModel)
          setActiveChatModel(nextModel, 'github-copilot')
        }
      } catch {
        if (!disposed) setCopilotAvailableModels([])
      }
    }

    syncCopilotModels()
    return () => {
      disposed = true
    }
  }, [chatProvider, chatModel])

  const resolveAttachmentAbsolutePath = useCallback(async (fileLike) => {
    const candidatePath = resolveAttachmentPath(fileLike)
    if (!candidatePath) return ''
    if (isAbsolutePath(candidatePath)) {
      return normalizeAttachmentPath(candidatePath)
    }
    try {
      const absolutePath = await filesApi.getAbsolutePath(candidatePath)
      if (absolutePath) return normalizeAttachmentPath(absolutePath)
    } catch {}
    return normalizeAttachmentPath(candidatePath)
  }, [])

  const attachFilesByPath = useCallback(async (files) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : []
    if (normalizedFiles.length === 0) return
    const entries = []
    for (const fileLike of normalizedFiles) {
      const absolutePath = await resolveAttachmentAbsolutePath(fileLike)
      if (!absolutePath) continue
      entries.push({
        type: 'path',
        transfer_method: 'local_path',
        path: absolutePath,
        name: resolveAttachmentName(fileLike, absolutePath),
      })
    }
    if (entries.length === 0) return
    setUploadedFiles((prev) => {
      const next = Array.isArray(prev) ? [...prev] : []
      const existingPathSet = new Set(
        next.map((item) => String(item?.path || '').trim().toLowerCase()).filter(Boolean),
      )
      for (const entry of entries) {
        const pathValue = String(entry.path || '').trim()
        if (!pathValue) continue
        const pathKey = pathValue.toLowerCase()
        if (existingPathSet.has(pathKey)) continue
        existingPathSet.add(pathKey)
        next.push(entry)
      }
      return next
    })
  }, [resolveAttachmentAbsolutePath])

  useEffect(() => {
    const handleSidebarAttachment = (event) => {
      const detail = event?.detail || {}
      const pathValue = resolveAttachmentPath(detail)
      if (!pathValue) return
      void attachFilesByPath([{ path: pathValue, name: detail?.name }])
    }
    window.addEventListener('moros:add-chat-attachment', handleSidebarAttachment)
    return () => {
      window.removeEventListener('moros:add-chat-attachment', handleSidebarAttachment)
    }
  }, [attachFilesByPath])

  const handleOpenUploadPicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleComposerAddMenuSelect = useCallback((optionId) => {
    if (optionId === 'action:upload') {
      handleOpenUploadPicker()
      return
    }
    if (optionId.startsWith('provider:')) {
      handleChatProviderChange(optionId.replace('provider:', ''))
      return
    }
    if (optionId.startsWith('model:')) {
      handleChatModelChange(optionId.replace('model:', ''))
    }
  }, [handleOpenUploadPicker, handleChatProviderChange, handleChatModelChange])

  const composerAddMenuOptions = useMemo(() => {
    return [
      {
        id: 'action:upload',
        label: 'Attach file path',
      },
      { id: 'separator:provider', type: 'separator' },
      ...CHAT_PROVIDER_OPTIONS.map((providerOption) => ({
        id: `provider:${providerOption.id}`,
        label: providerOption.label,
        selected: chatProvider === providerOption.id,
      })),
      { id: 'separator:model', type: 'separator' },
      ...getAllChatModelOptions().map((modelOption) => {
        return {
        id: `model:${modelOption.id}`,
        label: modelOption.label,
        selected: chatModel === modelOption.id,
        }
      }),
    ]
  }, [chatProvider, chatModel])

  useEffect(() => {
    try {
      localStorage.setItem('moros-chat-artifacts-open', artifactsOpen ? '1' : '0')
    } catch {}
  }, [artifactsOpen])

  useEffect(() => {
    onArtifactsVisibilityChange?.(Boolean(artifactsOpen))
  }, [artifactsOpen, onArtifactsVisibilityChange])

  useEffect(() => {
    if (!artifactsCloseRequestSeq) return
    setArtifactsOpen(false)
  }, [artifactsCloseRequestSeq])

  useEffect(() => {
    return () => {
      onArtifactsVisibilityChange?.(false)
    }
  }, [onArtifactsVisibilityChange])

  const refreshArtifacts = useCallback(async () => {
    setArtifactsLoading(true)
    setArtifactsError('')
    try {
      const messageArtifactPaths = collectArtifactPathsFromMessages(messages)
      const tree = await filesApi.getFileTree()
      const workspaceCandidates = (Array.isArray(tree) ? tree : [])
        .filter(isArtifactWorkspaceCandidate)
        .slice(0, 80)
      const workspaceEntries = await Promise.all(
        workspaceCandidates.map(async (item) => {
          const relativePath = String(item?.path || '').replace(/\\/g, '/').trim()
          if (!relativePath) return null
          let absolutePath = ''
          try {
            absolutePath = normalizeAttachmentPath(await filesApi.getAbsolutePath(relativePath))
          } catch {}
          return {
            id: `workspace:${relativePath}`,
            name: String(item?.name || '').trim() || relativePath.split('/').pop() || relativePath,
            path: absolutePath || relativePath,
            relativePath,
            source: 'workspace',
          }
        }),
      )

      const mergedMap = new Map()
      const upsertEntry = (entry) => {
        if (!entry) return
        const key = String(entry.path || entry.relativePath || '').trim().toLowerCase()
        if (!key) return
        if (!mergedMap.has(key)) {
          mergedMap.set(key, entry)
          return
        }
        const existing = mergedMap.get(key)
        const source = existing.source === entry.source ? existing.source : 'workspace+chat'
        mergedMap.set(key, {
          ...existing,
          ...entry,
          source,
          relativePath: existing.relativePath || entry.relativePath,
          path: existing.path || entry.path,
        })
      }

      for (const entry of workspaceEntries) {
        upsertEntry(entry)
      }
      for (const pathValue of messageArtifactPaths) {
        upsertEntry({
          id: `chat:${pathValue}`,
          name: resolveAttachmentName({}, pathValue),
          path: pathValue,
          relativePath: undefined,
          source: 'chat',
        })
      }

      const nextEntries = [...mergedMap.values()].sort((a, b) => {
        const aWorkspace = String(a?.source || '').includes('workspace') ? 0 : 1
        const bWorkspace = String(b?.source || '').includes('workspace') ? 0 : 1
        if (aWorkspace !== bWorkspace) return aWorkspace - bWorkspace
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN')
      })

      setArtifactEntries(nextEntries)
      setActiveArtifactId((prevId) => {
        if (nextEntries.some((entry) => entry.id === prevId)) return prevId
        return nextEntries[0]?.id || ''
      })
    } catch (error) {
      setArtifactsError(String(error?.message || '读取 Artifacts 失败'))
      setArtifactEntries([])
      setActiveArtifactId('')
    } finally {
      setArtifactsLoading(false)
    }
  }, [messages])

  useEffect(() => {
    if (!artifactsOpen) return
    void refreshArtifacts()
  }, [artifactsOpen, refreshArtifacts])

  const activeArtifact = useMemo(() => {
    return artifactEntries.find((entry) => entry.id === activeArtifactId) || null
  }, [artifactEntries, activeArtifactId])

  const activeArtifactUrl = useMemo(() => {
    const relativePath = String(activeArtifact?.relativePath || '').trim()
    if (relativePath) return filesApi.getRawFileUrl(relativePath)

    const absolutePath = normalizeAttachmentPath(activeArtifact?.path)
    if (absolutePath && isAbsolutePath(absolutePath)) {
      const normalizedPath = absolutePath.toLowerCase()
      if (normalizedPath.endsWith('.html') || normalizedPath.endsWith('.htm')) {
        return filesApi.getRawAbsoluteHtmlUrl(absolutePath)
      }
      return filesApi.getRawAbsoluteFileUrl(absolutePath)
    }
    return ''
  }, [activeArtifact?.relativePath, activeArtifact?.path])

  // 流式结束后保留呼吸圆点淡出过渡
  const prevStreamingRef = useRef('')
  useEffect(() => {
    if (prevStreamingRef.current && !streamingContent) {
      if (justFinishedTimerRef.current) clearTimeout(justFinishedTimerRef.current)
      setJustFinished(true)
      justFinishedTimerRef.current = setTimeout(() => {
        setJustFinished(false)
        justFinishedTimerRef.current = null
      }, 1200)
    }
    prevStreamingRef.current = streamingContent
  }, [streamingContent])

  useEffect(() => {
    return () => {
      if (justFinishedTimerRef.current) clearTimeout(justFinishedTimerRef.current)
      if (copyMessageTimerRef.current) clearTimeout(copyMessageTimerRef.current)
    }
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking, streamingContent, streamingSegments])

  // 表格按钮：复制直接为 Markdown，下载直接为 CSV，不弹出菜单
  useEffect(() => {
    const el = document.querySelector('.chat-messages')
    if (!el) return
    const handler = (e) => {
      const copyBtn = e.target.closest?.('button[title="Copy table"]')
      if (copyBtn) {
        e.stopImmediatePropagation()
        e.preventDefault()
        const wrapper = copyBtn.closest('[data-streamdown="table-wrapper"]')
        const table = wrapper?.querySelector('table')
        if (!table) return
        const rows = Array.from(table.querySelectorAll('tr'))
        const data = rows.map(r =>
          Array.from(r.querySelectorAll('th, td')).map(c => c.textContent?.trim() || '')
        )
        if (data.length === 0) return
        const hdr = data[0]
        const sep = hdr.map(() => '---')
        const md = [hdr, sep, ...data.slice(1)]
          .map(r => '| ' + r.join(' | ') + ' |')
          .join('\n')
        navigator.clipboard.writeText(md).catch(() => {})
        return
      }
      const dlBtn = e.target.closest?.('button[title="Download table"]')
      if (dlBtn) {
        e.stopImmediatePropagation()
        e.preventDefault()
        const wrapper = dlBtn.closest('[data-streamdown="table-wrapper"]')
        const table = wrapper?.querySelector('table')
        if (!table) return
        const rows = Array.from(table.querySelectorAll('tr'))
        const data = rows.map(r =>
          Array.from(r.querySelectorAll('th, td')).map(c => c.textContent?.trim() || '')
        )
        const csv = data
          .map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))
          .join('\n')
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'table.csv'
        a.click()
        URL.revokeObjectURL(url)
        return
      }
    }
    el.addEventListener('click', handler, true)
    return () => el.removeEventListener('click', handler, true)
  }, [])

  // 处理文件上传
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    await attachFilesByPath(files)
    e.target.value = ''
  }

  // 处理剪贴板粘贴文件
  const handleComposerPaste = useCallback((e) => {
    const clipboard = e.clipboardData
    if (!clipboard) return

    const itemFiles = Array.from(clipboard.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean)
    const clipboardFiles = itemFiles.length > 0
      ? itemFiles
      : Array.from(clipboard.files || [])
    if (clipboardFiles.length === 0) return
    e.preventDefault()
    void attachFilesByPath(clipboardFiles)
  }, [attachFilesByPath])

  // 移除已上传的文件
  const removeUploadedFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // 处理拖拽进入输入区域
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 支持侧边栏拖拽文本标记与系统文件拖拽
    const types = Array.from(e.dataTransfer.types || [])
    if (types.includes('text/plain') || types.includes('Files')) {
      setIsDragOver(true)
    }
  }

  // 处理拖拽悬停
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  // 处理拖拽离开
  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 只有当真正离开输入容器时才清除状态
    const container = e.currentTarget
    const relatedTarget = e.relatedTarget
    
    if (!container.contains(relatedTarget)) {
      setIsDragOver(false)
    }
  }

  // 处理文件拖拽放下
  const handleDrop = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    try {
      const droppedFiles = Array.from(e.dataTransfer.files || [])
      if (droppedFiles.length > 0) {
        await attachFilesByPath(droppedFiles)
        return
      }

      // 尝试获取侧边栏拖拽的文件数据
      const dataText = e.dataTransfer.getData('text/plain')
      if (dataText) {
        let dragData = null
        try {
          dragData = JSON.parse(dataText)
        } catch {
          dragData = null
        }
        if (dragData?.path) {
          await attachFilesByPath([{ path: dragData.path, name: dragData.name }])
        }
      }
    } catch (error) {
      console.error('处理拖拽文件失败:', error)
      alert(t('chat.add_file_failed', { msg: error.message }))
    }
  }

  // 发送消息 (流式)
  const handleSend = async (overrideQuery, baseMessagesOverride, filesOverride) => {
    const query = String(overrideQuery ?? inputValue ?? '').trim()
    const overrideFiles = Array.isArray(filesOverride)
      ? filesOverride
          .map((item) => ({
            ...item,
            path: normalizeAttachmentPath(item?.path),
            name: String(item?.name || '').trim(),
          }))
          .filter((item) => item.path)
      : []
    const filesForRequest = overrideFiles.length > 0 ? overrideFiles : uploadedFiles
    if (!query && filesForRequest.length === 0) return
    if (isLoading) return

    // 立即添加用户消息（确保即时反馈）
    const userMessage = {
      role: 'user',
      content: query || t('chat.attachment_placeholder'),
      files: filesForRequest.length > 0 ? [...filesForRequest] : undefined,
      timestamp: new Date().toISOString()
    }

    const baseMessages = Array.isArray(baseMessagesOverride) ? baseMessagesOverride : messages
    const newMessages = [...baseMessages, userMessage]
    setMessages(newMessages)
    saveChatHistory(newMessages, conversationId, {
      provider: chatProvider,
      model: chatModel,
      agentRuntimeSessionId,
      agentSessionFile,
    })
    setInputValue('')
    if (fromLanding) {
      setFromLanding(false)
    }
    setSessionPanelMessage('')

    const filesToSend = filesForRequest.length > 0 ? [...filesForRequest] : undefined
    const requestMessageBase = appendAttachmentPathsToPrompt(
      query || t('chat.attachment_placeholder'),
      filesToSend,
    )
    const requestMessage = prependGlobalSystemPrompt(requestMessageBase, globalSystemPrompt)
    setUploadedFiles([])
    setIsLoading(true)
    if (thinkingHideTimerRef.current) {
      clearTimeout(thinkingHideTimerRef.current)
      thinkingHideTimerRef.current = null
    }
    firstTokenSeenRef.current = false
    thinkingStartedAtRef.current = Date.now()
    setIsThinking(true)
    setStreamingContent('')
    resetStreamingSegments()

    let streamedText = ''
    let newConversationId = conversationId
    const resolveFinalSegments = (rawPayload) => {
      let finalSegments = normalizeAssistantSegmentsForPersist(snapshotStreamingSegments())
      if (finalSegments.length === 0) {
        const recoveredFromRaw = normalizeAssistantSegmentsForPersist(
          buildSegmentsFromAgentPayload(rawPayload?.details || rawPayload || {}),
        )
        if (recoveredFromRaw.length > 0) {
          finalSegments = recoveredFromRaw
        }
      }
      return finalSegments
    }

    const isLocalCliProvider =
      chatProvider === 'github-copilot' || chatProvider === 'openai-codex' || chatProvider === 'opencode-go'
    if (isLocalCliProvider) {
      let requestModel = normalizeChatModel(chatModel, chatProvider)
      let copilotAccessToken = ''
      let openaiCodexCredentials = null
      let opencodeApiKey = ''
      let opencodeGoBaseUrl = ''
      if (chatProvider === 'github-copilot') {
        const credentials = await getValidGitHubCopilotCredentials()
        if (!credentials) {
          const authErrorMessage = {
            role: 'assistant',
            content: '请先在 Settings -> Integrations 中完成 GitHub Copilot OAuth 登录。',
            error: true,
            timestamp: new Date().toISOString()
          }
          setMessages([...newMessages, authErrorMessage])
          setSessionPanelMessage('未检测到 GitHub Copilot 登录')
          setStreamingContent('')
          setIsLoading(false)
          setIsThinking(false)
          streamHandleRef.current = null
          saveChatHistory([...newMessages, authErrorMessage], conversationId, {
            provider: chatProvider,
            model: chatModel,
            agentRuntimeSessionId,
            agentSessionFile,
          })
          return
        }

        copilotAccessToken = credentials.access
        try {
          const resolvedModel = await resolveGitHubCopilotModel(chatModel, credentials, copilotAvailableModels)
          if (resolvedModel.availableModels.length > 0) {
            setCopilotAvailableModels(resolvedModel.availableModels)
          }
          if (resolvedModel.model) {
            requestModel = resolvedModel.model
          }
          if (resolvedModel.model && resolvedModel.model !== chatModel) {
            const nextModel = normalizeChatModel(resolvedModel.model, 'github-copilot')
            setChatModel(nextModel)
            setActiveChatModel(nextModel, 'github-copilot')
            saveChatHistory(newMessages, conversationId, {
              provider: chatProvider,
              model: nextModel,
            })
          }
        } catch {}
      }
      if (chatProvider === 'openai-codex') {
        openaiCodexCredentials = await getValidOpenAICodexCredentials()
        if (!openaiCodexCredentials) {
          const authErrorMessage = {
            role: 'assistant',
            content: '请先在 Settings -> Integrations 中完成 OpenAI Codex OAuth 登录。',
            error: true,
            timestamp: new Date().toISOString()
          }
          setMessages([...newMessages, authErrorMessage])
          setSessionPanelMessage('未检测到 OpenAI Codex 登录')
          setStreamingContent('')
          setIsLoading(false)
          setIsThinking(false)
          streamHandleRef.current = null
          saveChatHistory([...newMessages, authErrorMessage], conversationId, {
            provider: chatProvider,
            model: chatModel,
            agentRuntimeSessionId,
            agentSessionFile,
          })
          return
        }
      }
      if (chatProvider === 'opencode-go') {
        opencodeApiKey = String(getOpenCodeGoApiKey() || '').trim()
        opencodeGoBaseUrl = String(getOpenCodeGoBaseUrl() || '').trim()
        if (!opencodeApiKey) {
          const authErrorMessage = {
            role: 'assistant',
            content: '请先在 Settings -> Integrations 中配置 OpenCode Go API Key（OPENCODE_API_KEY）。',
            error: true,
            timestamp: new Date().toISOString()
          }
          setMessages([...newMessages, authErrorMessage])
          setSessionPanelMessage('未检测到 OpenCode Go API Key')
          setStreamingContent('')
          setIsLoading(false)
          setIsThinking(false)
          streamHandleRef.current = null
          saveChatHistory([...newMessages, authErrorMessage], conversationId, {
            provider: chatProvider,
            model: chatModel,
            agentRuntimeSessionId,
            agentSessionFile,
          })
          return
        }
      }

      let nextRuntimeSessionId = agentRuntimeSessionId
      let nextSessionFile = agentSessionFile

      try {
        const handle = chatWithLocalCliStreaming(
          {
            provider: chatProvider,
            model: requestModel,
            message: requestMessage,
            copilotToken: copilotAccessToken,
            openaiCodexCredentials: openaiCodexCredentials || undefined,
            opencodeApiKey,
            opencodeGoBaseUrl,
            runtimeSessionId: nextRuntimeSessionId || undefined,
            resumeSessionFile: nextSessionFile || undefined,
            skillPaths: normalizedSkillPaths.length > 0 ? normalizedSkillPaths : undefined,
            chatFilePath: String(currentFile?.path || ''),
          },
          (event) => {
            if (event.event === 'session_meta') {
              if (event.runtimeSessionId && event.runtimeSessionId !== nextRuntimeSessionId) {
                nextRuntimeSessionId = event.runtimeSessionId
                setAgentRuntimeSessionId(event.runtimeSessionId)
              }
              if (event.sessionFile && event.sessionFile !== nextSessionFile) {
                nextSessionFile = event.sessionFile
                setAgentSessionFile(event.sessionFile)
              }
              if (event.created) {
                setSessionPanelMessage('已创建新的 CLI 会话')
              } else if (event.runtimeSessionId) {
                setSessionPanelMessage('已复用现有 CLI 会话')
              }
              const providerFromEvent = event.currentProvider
                ? normalizeChatProvider(event.currentProvider)
                : chatProvider
              if (providerFromEvent !== chatProvider) {
                setChatProvider(providerFromEvent)
                setActiveChatProvider(providerFromEvent)
              }
              if (event.currentModel && event.currentModel !== chatModel) {
                const nextModel = normalizeChatModel(event.currentModel, providerFromEvent)
                setChatModel(nextModel)
                setActiveChatModel(nextModel, providerFromEvent)
              }
              return
            }

            if (event.event === 'retry') {
              streamedText = ''
              resetStreamingSegments()
              setStreamingContent('')
              firstTokenSeenRef.current = false
              thinkingStartedAtRef.current = Date.now()
              setIsThinking(true)
              return
            }

            if (event.event === 'tool_event') {
              if (!firstTokenSeenRef.current) {
                firstTokenSeenRef.current = true
                const elapsed = Date.now() - thinkingStartedAtRef.current
                const remaining = Math.max(0, 250 - elapsed)
                if (remaining === 0) {
                  setIsThinking(false)
                } else {
                  thinkingHideTimerRef.current = setTimeout(() => {
                    setIsThinking(false)
                    thinkingHideTimerRef.current = null
                  }, remaining)
                }
              }
              appendStreamingToolSegment(event)
              return
            }

            if (event.event === 'message') {
              if (!firstTokenSeenRef.current) {
                firstTokenSeenRef.current = true
                const elapsed = Date.now() - thinkingStartedAtRef.current
                const remaining = Math.max(0, 250 - elapsed)
                if (remaining === 0) {
                  setIsThinking(false)
                } else {
                  thinkingHideTimerRef.current = setTimeout(() => {
                    setIsThinking(false)
                    thinkingHideTimerRef.current = null
                  }, remaining)
                }
              }
              const nextChunk = normalizeBrandText(event.answer || '')
              streamedText += nextChunk
              appendStreamingTextSegment(nextChunk)
              setStreamingContent(normalizeMarkdownForRender(streamedText))
            } else if (event.event === 'message_end') {
              if (thinkingHideTimerRef.current) {
                clearTimeout(thinkingHideTimerRef.current)
                thinkingHideTimerRef.current = null
              }
              const finalSegments = resolveFinalSegments(event.raw)
              const finalToolEvents = flattenToolEventsFromSegments(finalSegments)
              const assistantErrorFromRaw = extractAssistantErrorFromAgentEnd(event.raw)
              if (!streamedText && !event.assistantText && assistantErrorFromRaw) {
                const recoveredText = finalSegments
                  .filter((segment) => segment.type === 'text')
                  .map((segment) => segment.content)
                  .join('')
                const errorText = `${t('chat.error_prefix')}: ${normalizeBrandText(assistantErrorFromRaw)}`
                const errorMessage = {
                  role: 'assistant',
                  content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
                  error: true,
                  segments: finalSegments.length > 0 ? finalSegments : undefined,
                  tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
                  timestamp: new Date().toISOString()
                }
                setMessages([...newMessages, errorMessage])
                setStreamingContent('')
                setIsLoading(false)
                setIsThinking(false)
                streamHandleRef.current = null
                saveChatHistory([...newMessages, errorMessage], conversationId, {
                  provider: chatProvider,
                  model: requestModel,
                  agentRuntimeSessionId: nextRuntimeSessionId,
                  agentSessionFile: nextSessionFile,
                })
                resetStreamingSegments()
                return
              }
              const fallbackFinalText = normalizeMarkdownForRender(
                normalizeBrandText(streamedText || event.assistantText || ''),
              )
              const textFromSegments = finalSegments
                .filter((segment) => segment.type === 'text')
                .map((segment) => segment.content)
                .join('')
              const finalText = textFromSegments || fallbackFinalText
              const aiMessage = {
                role: 'assistant',
                content: finalText || '（无文本输出）',
                segments: finalSegments.length > 0 ? finalSegments : undefined,
                tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
                timestamp: new Date().toISOString()
              }
              const updatedMessages = [...newMessages, aiMessage]
              setMessages(updatedMessages)
              setStreamingContent('')
              setIsLoading(false)
              setIsThinking(false)
              streamHandleRef.current = null
              saveChatHistory(updatedMessages, conversationId, {
                provider: chatProvider,
                model: requestModel,
                agentRuntimeSessionId: nextRuntimeSessionId,
                agentSessionFile: nextSessionFile,
              })
              resetStreamingSegments()
            } else if (event.event === 'error') {
              if (thinkingHideTimerRef.current) {
                clearTimeout(thinkingHideTimerRef.current)
                thinkingHideTimerRef.current = null
              }
              const finalSegments = resolveFinalSegments(event.raw)
              const finalToolEvents = flattenToolEventsFromSegments(finalSegments)
              const recoveredText = finalSegments
                .filter((segment) => segment.type === 'text')
                .map((segment) => segment.content)
                .join('')
              const errorText = `${t('chat.error_prefix')}: ${normalizeBrandText(event.message || '')}`
              const errorMessage = {
                role: 'assistant',
                content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
                error: true,
                segments: finalSegments.length > 0 ? finalSegments : undefined,
                tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
                timestamp: new Date().toISOString()
              }
              setMessages([...newMessages, errorMessage])
              setStreamingContent('')
              setIsLoading(false)
              setIsThinking(false)
              streamHandleRef.current = null
              saveChatHistory([...newMessages, errorMessage], conversationId, {
                provider: chatProvider,
                model: requestModel,
                agentRuntimeSessionId: nextRuntimeSessionId,
                agentSessionFile: nextSessionFile,
              })
              resetStreamingSegments()
            }
          }
        )
        streamHandleRef.current = handle
      } catch (error) {
        console.error('发送消息失败:', error)
        if (thinkingHideTimerRef.current) {
          clearTimeout(thinkingHideTimerRef.current)
          thinkingHideTimerRef.current = null
        }
        const finalSegments = normalizeAssistantSegmentsForPersist(snapshotStreamingSegments())
        const finalToolEvents = flattenToolEventsFromSegments(finalSegments)
        const recoveredText = finalSegments
          .filter((segment) => segment.type === 'text')
          .map((segment) => segment.content)
          .join('')
        const errorText = `${t('chat.error_prefix')}: ${normalizeBrandText(error.message || '')}`
        const errorMessage = {
          role: 'assistant',
          content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
          error: true,
          segments: finalSegments.length > 0 ? finalSegments : undefined,
          tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
          timestamp: new Date().toISOString()
        }
        setMessages([...newMessages, errorMessage])
        setStreamingContent('')
        setIsLoading(false)
        setIsThinking(false)
        streamHandleRef.current = null
        saveChatHistory([...newMessages, errorMessage], conversationId, {
          provider: chatProvider,
          model: requestModel,
          agentRuntimeSessionId: nextRuntimeSessionId,
          agentSessionFile: nextSessionFile,
        })
        resetStreamingSegments()
      }
      return
    }

    const apiKey = getDifyApiKey()
    
    if (!apiKey) {
      alert(t('chat.configure_api_first'))
      setStreamingContent('')
      setIsLoading(false)
      setIsThinking(false)
      streamHandleRef.current = null
      saveChatHistory(newMessages, conversationId)
      return
    }

    // 调用 Dify API (流式模式)
    try {
      const handle = chatWithDifyStreaming(
        {
          query: requestMessage,
          conversationId,
        },
        (event) => {
          if (event.event === 'message') {
            // 累积流式文本
            if (!firstTokenSeenRef.current) {
              firstTokenSeenRef.current = true
              const elapsed = Date.now() - thinkingStartedAtRef.current
              const remaining = Math.max(0, 250 - elapsed)
              if (remaining === 0) {
                setIsThinking(false)
              } else {
                thinkingHideTimerRef.current = setTimeout(() => {
                  setIsThinking(false)
                  thinkingHideTimerRef.current = null
                }, remaining)
              }
            }
            const nextChunk = normalizeBrandText(event.answer || '')
            streamedText += nextChunk
            appendStreamingTextSegment(nextChunk)
            setStreamingContent(normalizeMarkdownForRender(streamedText))
          } else if (event.event === 'message_end') {
            // 流式结束
            if (thinkingHideTimerRef.current) {
              clearTimeout(thinkingHideTimerRef.current)
              thinkingHideTimerRef.current = null
            }
            const finalSegments = normalizeAssistantSegmentsForPersist(snapshotStreamingSegments())
            const textFromSegments = finalSegments
              .filter((segment) => segment.type === 'text')
              .map((segment) => segment.content)
              .join('')
            const fallbackFinalText = normalizeMarkdownForRender(normalizeBrandText(streamedText))
            const aiMessage = {
              role: 'assistant',
              content: textFromSegments || fallbackFinalText || '（无文本输出）',
              segments: finalSegments.length > 0 ? finalSegments : undefined,
              timestamp: new Date().toISOString()
            }

            const updatedMessages = [...newMessages, aiMessage]
            setMessages(updatedMessages)
            setStreamingContent('')
            setIsLoading(false)
            setIsThinking(false)
            streamHandleRef.current = null
            resetStreamingSegments()

            // 保存对话ID
            if (event.conversation_id) {
              newConversationId = event.conversation_id
              setConversationId(newConversationId)
            }
            saveChatHistory(updatedMessages, newConversationId)
          } else if (event.event === 'error') {
            // 错误处理
            if (thinkingHideTimerRef.current) {
              clearTimeout(thinkingHideTimerRef.current)
              thinkingHideTimerRef.current = null
            }
            console.error('流式响应错误:', event)
            const errorSegments = normalizeAssistantSegmentsForPersist(snapshotStreamingSegments())
            const recoveredText = errorSegments
              .filter((segment) => segment.type === 'text')
              .map((segment) => segment.content)
              .join('')
            const errorText = `${t('chat.error_prefix')}: ${normalizeBrandText(event.message || '')}`
            const errorMessage = {
              role: 'assistant',
              content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
              error: true,
              segments: errorSegments.length > 0 ? errorSegments : undefined,
              timestamp: new Date().toISOString()
            }
            setMessages([...newMessages, errorMessage])
            setStreamingContent('')
            setIsLoading(false)
            setIsThinking(false)
            streamHandleRef.current = null
            saveChatHistory([...newMessages, errorMessage], newConversationId)
            resetStreamingSegments()
          }
        }
      )

      streamHandleRef.current = handle
    } catch (error) {
      console.error('发送消息失败:', error)
      if (thinkingHideTimerRef.current) {
        clearTimeout(thinkingHideTimerRef.current)
        thinkingHideTimerRef.current = null
      }
      
      // 添加错误消息
      const errorSegments = normalizeAssistantSegmentsForPersist(snapshotStreamingSegments())
      const recoveredText = errorSegments
        .filter((segment) => segment.type === 'text')
        .map((segment) => segment.content)
        .join('')
      const errorText = `${t('chat.error_prefix')}: ${normalizeBrandText(error.message || '')}`
      const errorMessage = {
        role: 'assistant',
        content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
        error: true,
        segments: errorSegments.length > 0 ? errorSegments : undefined,
        timestamp: new Date().toISOString()
      }
      
      setMessages([...newMessages, errorMessage])
      setStreamingContent('')
      setIsLoading(false)
      setIsThinking(false)
      streamHandleRef.current = null
      saveChatHistory([...newMessages, errorMessage], newConversationId)
      resetStreamingSegments()
    }
  }

  // Landing 页面跳转到 chat 文件后，自动发送首条消息
  useEffect(() => {
    if ((!autoPrompt && autoPromptFiles.length === 0) || isLoading) return
    const prompt = autoPrompt
    const files = autoPromptFiles
    setAutoPrompt('')
    setAutoPromptFiles([])
    handleSend(prompt, messages, files)
  }, [autoPrompt, autoPromptFiles, isLoading, messages])

  // 停止流式响应
  const handleStop = () => {
    if (streamHandleRef.current) {
      streamHandleRef.current.abort()
      streamHandleRef.current = null
      if (agentRuntimeSessionId) {
        void abortLocalCliSession(agentRuntimeSessionId).catch((error) => {
          console.error('中断 CLI 会话失败:', error)
        })
      }
      if (thinkingHideTimerRef.current) {
        clearTimeout(thinkingHideTimerRef.current)
        thinkingHideTimerRef.current = null
      }
      setIsLoading(false)
      setIsThinking(false)
      
      // 保存当前流式内容
      const stoppedSegments = normalizeAssistantSegmentsForPersist(snapshotStreamingSegments())
      const stopNote = '_[已停止]_'
      const enrichedSegments = [...stoppedSegments]
      if (enrichedSegments.length > 0 && enrichedSegments[enrichedSegments.length - 1]?.type === 'text') {
        const last = enrichedSegments[enrichedSegments.length - 1]
        enrichedSegments[enrichedSegments.length - 1] = {
          type: 'text',
          content: `${last.content}\n\n${stopNote}`,
        }
      } else if (streamingContent) {
        enrichedSegments.push({
          type: 'text',
          content: `${streamingContent}\n\n${stopNote}`,
        })
      } else if (enrichedSegments.length > 0) {
        enrichedSegments.push({
          type: 'text',
          content: stopNote,
        })
      }
      const stoppedToolEvents = flattenToolEventsFromSegments(enrichedSegments)
      const stoppedText = enrichedSegments
        .filter((segment) => segment.type === 'text')
        .map((segment) => segment.content)
        .join('')
      if (stoppedText || stoppedToolEvents.length > 0) {
        const aiMessage = {
          role: 'assistant',
          content: stoppedText || stopNote,
          segments: enrichedSegments.length > 0 ? enrichedSegments : undefined,
          tools: stoppedToolEvents.length > 0 ? stoppedToolEvents : undefined,
          timestamp: new Date().toISOString()
        }
        const updatedMessages = [...messages, aiMessage]
        setMessages(updatedMessages)
        saveChatHistory(updatedMessages, conversationId, {
          provider: chatProvider,
          model: chatModel,
          agentRuntimeSessionId,
          agentSessionFile,
        })
      }
      
      setStreamingContent('')
      resetStreamingSegments()
    }
  }

  const handleReconnectCliSession = useCallback(() => {
    if (isLoading || sessionActionBusy) return
    setAgentRuntimeSessionId('')
    setAgentSessionFile('')
    setSessionPanelMessage('下条消息将创建新的 CLI 会话')
    persistAgentSessionMeta('', '')
  }, [isLoading, sessionActionBusy, persistAgentSessionMeta])

  const handleCloseCliSession = useCallback(async () => {
    if (isLoading || sessionActionBusy) return
    if (!agentRuntimeSessionId) {
      setSessionPanelMessage('当前没有可关闭的 CLI 会话')
      return
    }
    setSessionActionBusy(true)
    try {
      await closeLocalCliSession(agentRuntimeSessionId)
      setAgentRuntimeSessionId('')
      setAgentSessionFile('')
      setSessionPanelMessage('CLI 会话已关闭')
      persistAgentSessionMeta('', '')
    } catch (error) {
      const message = error?.message || '未知错误'
      setSessionPanelMessage(`关闭失败: ${message}`)
    } finally {
      setSessionActionBusy(false)
    }
  }, [isLoading, sessionActionBusy, agentRuntimeSessionId, persistAgentSessionMeta])

  const cliSessionStatusText = useMemo(() => {
    if (!agentRuntimeSessionId) return '未连接'
    if (isLoading) return '执行中'
    return '已连接'
  }, [agentRuntimeSessionId, isLoading])


  // 快捷键支持
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      handleSend()
    }
  }

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

  const activeArtifactExtension = useMemo(() => {
    const pathValue = String(activeArtifact?.path || activeArtifact?.relativePath || '').toLowerCase()
    const matchedExt = ARTIFACT_FILE_EXTENSIONS.find((ext) => pathValue.endsWith(ext))
    return matchedExt || ''
  }, [activeArtifact?.path, activeArtifact?.relativePath])

  const activeArtifactIsImage = useMemo(() => {
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(activeArtifactExtension)
  }, [activeArtifactExtension])

  const filteredArtifactEntries = useMemo(() => {
    const q = artifactSearchTerm.trim().toLowerCase()
    if (!q) return artifactEntries
    return artifactEntries.filter((e) =>
      String(e.name || '').toLowerCase().includes(q) ||
      String(e.path || '').toLowerCase().includes(q)
    )
  }, [artifactEntries, artifactSearchTerm])

  const formatFileSize = useCallback((size) => {
    if (size == null || size < 0) return ''
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  const handleCopyArtifactPath = useCallback(async (pathValue) => {
    const normalized = String(pathValue || '').trim()
    if (!normalized) return
    try {
      await navigator.clipboard.writeText(normalized)
    } catch (error) {
      console.error('复制 Artifact 路径失败:', error)
    }
  }, [])

  const handleRevealArtifact = useCallback(async (entry) => {
    const relativePath = String(entry?.relativePath || '').trim()
    if (!relativePath) return
    try {
      await filesApi.revealInFileExplorer(relativePath)
    } catch (error) {
      console.error('打开 Artifact 位置失败:', error)
    }
  }, [])

  return (
    <div className={`chat-interface ${darkMode ? 'dark' : 'light'} ${fromLanding ? 'from-landing' : ''}`}>
      <div className={`chat-shell ${artifactsOpen ? 'artifacts-open' : ''}`}>
        <div className="chat-main-column">
          <div className="chat-top-actions">
            <div className="chat-top-actions-inner">
              <ArtifactsToggleButton
                open={artifactsOpen}
                artifactCount={artifactEntries.length}
                onToggle={() => setArtifactsOpen((open) => !open)}
              />
            </div>
          </div>

          {/* 消息列表 */}
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
                              minute: '2-digit'
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
                
                {/* 统一的 AI 响应气泡：Thinking → Tool → Streaming 全在一个气泡内 */}
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

          {/* 输入区域 */}
          <div 
            className="chat-input-container"
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* session panel hidden for minimal UX; session state managed internally */}

            {/* 已上传文件列表 + 上传中文件 */}
            {(uploadedFiles.length > 0 || uploadingFiles.length > 0) && (
              <div className="chat-uploaded-files">
                {/* 正在上传的文件 */}
                {uploadingFiles.map((file) => (
                  <div key={file.id} className="chat-uploaded-file uploading">
                    <div className="upload-progress-ring">
                      <svg width="20" height="20" viewBox="0 0 20 20">
                        <circle
                          cx="10"
                          cy="10"
                          r="8"
                          fill="none"
                          stroke="var(--border-subtle)"
                          strokeWidth="2"
                        />
                        <circle
                          cx="10"
                          cy="10"
                          r="8"
                          fill="none"
                          stroke="var(--accent-color)"
                          strokeWidth="2"
                          strokeDasharray={`${2 * Math.PI * 8}`}
                          strokeDashoffset={`${2 * Math.PI * 8 * (1 - file.progress / 100)}`}
                          strokeLinecap="round"
                          transform="rotate(-90 10 10)"
                          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                        />
                      </svg>
                    </div>
                    <span className="chat-uploaded-file-name">{file.name}</span>
                  </div>
                ))}
                
                {/* 已上传完成的文件 */}
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="chat-uploaded-file">
                    <span className="chat-uploaded-file-name">{file.name}</span>
                    <button 
                      className="chat-uploaded-file-remove"
                      onClick={() => removeUploadedFile(index)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              onChange={handleFileUpload}
            />

            <ChatComposer
              value={inputValue}
              onValueChange={setInputValue}
              onSubmit={handleSend}
              onStop={handleStop}
              onPaste={handleComposerPaste}
              onAttach={handleOpenUploadPicker}
              addMenuOptions={composerAddMenuOptions}
              onAddMenuSelect={handleComposerAddMenuSelect}
              placeholder={t('chat.ask_anything')}
              canSubmit={Boolean(inputValue.trim() || uploadedFiles.length > 0)}
              isLoading={isLoading}
              multiline
              rows={1}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
              dragOver={isDragOver}
              attachTitle="Add options"
              submitTitle={t('chat.send_message')}
              stopTitle={t('chat.stop_generating')}
            />
          </div>
        </div>

        <ChatArtifactsPanel
          open={artifactsOpen}
          artifactsTab={artifactsTab}
          onTabChange={setArtifactsTab}
          onClose={() => setArtifactsOpen(false)}
          onRefresh={() => void refreshArtifacts()}
          artifactsLoading={artifactsLoading}
          artifactsError={artifactsError}
          artifactSearchTerm={artifactSearchTerm}
          onArtifactSearchTermChange={setArtifactSearchTerm}
          filteredArtifactEntries={filteredArtifactEntries}
          activeArtifactId={activeArtifactId}
          onSelectArtifact={(artifactId) => {
            setActiveArtifactId(artifactId)
            setArtifactsTab('preview')
          }}
          formatFileSize={formatFileSize}
          activeArtifact={activeArtifact}
          activeArtifactUrl={activeArtifactUrl}
          activeArtifactIsImage={activeArtifactIsImage}
          onClosePreview={() => setActiveArtifactId('')}
          onRevealArtifact={() => void handleRevealArtifact(activeArtifact)}
        />
      </div>
    </div>
  )
}

export default ChatInterface

