import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { chatWithDifyStreaming, getDifyApiKey } from '../utils/dify'
import {
  getGitHubCopilotCredentials,
  getGitHubCopilotAvailableModels,
  getValidGitHubCopilotCredentials,
  resolveGitHubCopilotModel,
} from '../utils/githubCopilot'
import { chatWithLocalCliStreaming, abortLocalCliSession } from '../utils/localCliAgent'
import { getOpenAICodexCredentials, getValidOpenAICodexCredentials } from '../utils/openaiCodex'
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
import { useI18n } from '../utils/i18n'
import { filesApi } from '../utils/api'
import './ChatInterface.css'
import {
  appendAttachmentPathsToPrompt,
  collectArtifactPathsFromToolEvents,
  createWorkspaceArtifactLookup,
  isImageArtifactPath,
  isAbsolutePath,
  normalizeAttachmentPath,
  resolveArtifactFileReference,
  resolveAttachmentName,
  resolveAttachmentPath,
} from './chat-interface/artifacts'
import {
  buildSegmentsFromAgentPayload,
  cloneAssistantSegments,
  cloneToolEvents,
  extractAssistantErrorFromAgentEnd,
  flattenToolEventsFromSegments,
  mergeToolEvent,
  prependGlobalSystemPrompt,
} from './chat-interface/assistantSegments'
import {
  normalizeBrandText,
  normalizeMarkdownForRender,
} from './chat-interface/markdownTransforms'
import { loadChatDraft, persistChatDraft } from './chat-interface/chatDraftStorage'
import { useChatArtifacts } from './chat-interface/useChatArtifacts'
import ChatMainColumn from './chat-interface/ChatMainColumn'
import ChatArtifactsPanel from './chat-interface/ChatArtifactsPanel'

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
  const [thinkingState, setThinkingState] = useState('idle')
  const [justFinished, setJustFinished] = useState(false)
  const justFinishedTimerRef = useRef(null)
  const [autoPrompt, setAutoPrompt] = useState('')
  const [autoPromptFiles, setAutoPromptFiles] = useState([])
  const [fromLanding, setFromLanding] = useState(false)
  const [sessionPanelMessage, setSessionPanelMessage] = useState('')
  const timeLocale = lang === 'en' ? 'en-US' : 'zh-CN'
  const normalizedSkillPaths = useMemo(() => {
    if (!Array.isArray(skillPaths)) return []
    const cleaned = skillPaths
      .map((p) => String(p || '').trim())
      .filter(Boolean)
    return Array.from(new Set(cleaned))
  }, [skillPaths])

  const effectiveSkillRootPaths = useMemo(() => {
    if (normalizedSkillPaths.length > 0) return normalizedSkillPaths
    return ['skills']
  }, [normalizedSkillPaths])

  const [skillItems, setSkillItems] = useState([])
  useEffect(() => {
    let cancelled = false
    const loadSkillItems = async () => {
      try {
        const tree = await filesApi.getFileTree()
        const roots = effectiveSkillRootPaths
          .map((root) => String(root || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
          .filter(Boolean)
        if (roots.length === 0) {
          if (!cancelled) setSkillItems([])
          return
        }
        const normalizedRoots = roots.map((root) => root.toLowerCase())
        const rootSet = new Set(normalizedRoots)
        const items = []
        for (const node of Array.isArray(tree) ? tree : []) {
          if (node?.type !== 'folder') continue
          const nodePath = String(node?.path || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
          if (!nodePath) continue
          const nodePathLower = nodePath.toLowerCase()
          if (rootSet.has(nodePathLower)) continue
          for (const normalizedRoot of normalizedRoots) {
            const prefix = `${normalizedRoot}/`
            if (!nodePathLower.startsWith(prefix)) continue
            const rest = nodePathLower.slice(prefix.length)
            if (!rest || rest.includes('/')) continue
            const nodeName = String(node?.name || '').trim()
            if (!nodeName || nodeName.startsWith('.')) continue
            items.push({
              id: String(node?.id || nodePath),
              name: nodeName,
              path: nodePath,
              color: String(node?.color || '').trim() || undefined,
              coverImagePath: String(node?.coverImagePath || '').trim() || undefined,
            })
            break
          }
        }
        const dedupedItems = Array.from(
          new Map(items.map((item) => [String(item.path || '').toLowerCase(), item])).values(),
        ).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
        if (!cancelled) {
          setSkillItems(dedupedItems)
        }
      } catch {
        if (!cancelled) {
          setSkillItems([])
        }
      }
    }
    const handleSkillsUpdated = () => {
      void loadSkillItems()
    }
    void loadSkillItems()
    window.addEventListener('moros:skills-updated', handleSkillsUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('moros:skills-updated', handleSkillsUpdated)
    }
  }, [effectiveSkillRootPaths])

  const handleSkillSelect = useCallback((skill) => {
    if (!skill?.name) return
    setInputValue((prev) => {
      const prefix = `@skill:${skill.name} `
      if (prev.startsWith(prefix)) return prev
      return prefix + prev
    })
  }, [])

  const {
    artifactsOpen,
    setArtifactsOpen,
    artifactsLoading,
    artifactsError,
    artifactEntries,
    activeArtifactId,
    setActiveArtifactId,
    artifactsTab,
    setArtifactsTab,
    artifactSearchTerm,
    setArtifactSearchTerm,
    filteredArtifactEntries,
    activeArtifact,
    activeArtifactUrl,
    activeArtifactRawUrl,
    activeArtifactExtension,
    activeArtifactIsImage,
    refreshArtifacts,
    formatFileSize,
    handleRevealArtifact,
  } = useChatArtifacts({
    messages,
    chatFilePath: currentFile?.path,
    onArtifactsVisibilityChange,
    artifactsCloseRequestSeq,
  })
  
  // markdown/brand 文本规范化逻辑已抽离到 chat-interface/markdownTransforms
  
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const streamHandleRef = useRef(null) // 用于停止流式响应
  const loadTokenRef = useRef(0)
  const sidebarRefreshTimerRef = useRef(null)
  const artifactsRefreshTimerRef = useRef(null)
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
      if (sidebarRefreshTimerRef.current) {
        clearTimeout(sidebarRefreshTimerRef.current)
      }
      if (artifactsRefreshTimerRef.current) {
        clearTimeout(artifactsRefreshTimerRef.current)
      }
    }
  }, [])

  const requestSidebarRefresh = useCallback((delayMs = 140) => {
    if (sidebarRefreshTimerRef.current) {
      clearTimeout(sidebarRefreshTimerRef.current)
    }
    sidebarRefreshTimerRef.current = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('moros:file-tree-refresh-request', {
        detail: { source: 'chat-runtime' },
      }))
      sidebarRefreshTimerRef.current = null
    }, delayMs)
  }, [])

  const requestArtifactsRefresh = useCallback((delayMs = 160, refreshOptions = {}) => {
    if (!artifactsOpen) return
    if (artifactsRefreshTimerRef.current) {
      clearTimeout(artifactsRefreshTimerRef.current)
    }
    artifactsRefreshTimerRef.current = setTimeout(() => {
      void refreshArtifacts(refreshOptions)
      artifactsRefreshTimerRef.current = null
    }, delayMs)
  }, [artifactsOpen, refreshArtifacts])

  const resolveAssistantArtifactFiles = useCallback(async (segments) => {
    const artifactFiles = []
    const seen = new Set()
    let workspaceLookup = null
    const normalizedChatFilePath = String(currentFile?.path || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .trim()
    const chatDir = normalizedChatFilePath.includes('/')
      ? normalizedChatFilePath.slice(0, normalizedChatFilePath.lastIndexOf('/'))
      : ''
    try {
      workspaceLookup = createWorkspaceArtifactLookup(await filesApi.getFileTree({ fresh: true }))
    } catch {}
    const pushArtifact = async (entry) => {
      const { relativePath, absolutePath } = resolveArtifactFileReference(entry, {
        includeRelative: true,
        preferRelativeForLeadingSlash: true,
        chatDirectoryRelative: chatDir,
        workspaceLookup,
      })
      const resolvedPath = String(relativePath || absolutePath || '').trim()
      if (!resolvedPath) return
      const key = resolvedPath.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      artifactFiles.push({
        name: String(entry?.name || '').trim() || resolveAttachmentName({}, resolvedPath),
        path: relativePath || absolutePath || resolvedPath,
        relativePath: relativePath || undefined,
        isImage: isImageArtifactPath(resolvedPath),
      })
    }

    const toolEvents = flattenToolEventsFromSegments(segments)
    const pathsFromTools = collectArtifactPathsFromToolEvents(toolEvents, {
      includeRelative: true,
      preferRelativeForLeadingSlash: true,
    })
    for (const pathValue of pathsFromTools) {
      await pushArtifact({
        name: resolveAttachmentName({}, pathValue),
        path: pathValue,
      })
    }

    return artifactFiles.slice(0, 8)
  }, [currentFile?.path])

  const handleOpenArtifactFromMessage = useCallback((file) => {
    const relativePath = String(file?.relativePath || '').trim().replace(/\\/g, '/').replace(/^\.\//, '')
    const absolutePath = normalizeAttachmentPath(file?.path)
    setArtifactsOpen(true)
    setArtifactsTab('preview')
    void (async () => {
      const nextEntries = await refreshArtifacts()
      const matched = (Array.isArray(nextEntries) ? nextEntries : []).find((entry) => {
        const entryRelative = String(entry?.relativePath || '').trim().replace(/\\/g, '/').toLowerCase()
        const entryPath = normalizeAttachmentPath(entry?.path).toLowerCase()
        if (relativePath && entryRelative === relativePath.toLowerCase()) return true
        if (absolutePath && entryPath === absolutePath.toLowerCase()) return true
        return false
      })
      if (matched?.id) {
        setActiveArtifactId(matched.id)
        return
      }
      if (relativePath) {
        const fallbackId = `chat-file:${String(absolutePath || relativePath).toLowerCase()}`
        setActiveArtifactId(fallbackId)
      } else if (absolutePath) {
        setActiveArtifactId(`chat-file:${absolutePath.toLowerCase()}`)
      }
    })()
  }, [setArtifactsOpen, setArtifactsTab, setActiveArtifactId, refreshArtifacts])

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

  const chatFileDirectoryPath = useMemo(() => {
    const normalizedPath = String(currentFile?.path || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .trim()
    if (!normalizedPath) return ''
    const slashIndex = normalizedPath.lastIndexOf('/')
    if (slashIndex < 0) return ''
    return normalizedPath.slice(0, slashIndex)
  }, [currentFile?.path])

  const isPathlessBrowserFile = useCallback((fileLike) => {
    if (!(typeof File !== 'undefined' && fileLike instanceof File)) return false
    const name = String(fileLike?.name || '').trim()
    const candidatePath = resolveAttachmentPath(fileLike)
    const normalizedCandidate = String(candidatePath || '').trim().replace(/\\/g, '/')
    if (!name) return false
    if (!normalizedCandidate) return true
    if (normalizedCandidate.toLowerCase() === name.toLowerCase()) return true
    if (/^(?:[a-z]:)?\/?fakepath\//i.test(normalizedCandidate)) return true
    if (!normalizedCandidate.includes('/')) return true
    return false
  }, [])

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
      if (isPathlessBrowserFile(fileLike)) {
        const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const uploadName = resolveAttachmentName(fileLike, resolveAttachmentPath(fileLike))
        setUploadingFiles((prev) => [
          ...(Array.isArray(prev) ? prev : []),
          { id: uploadId, name: uploadName, progress: 12 },
        ])
        try {
          const uploaded = await filesApi.uploadFile(
            fileLike,
            chatFileDirectoryPath || undefined,
            false,
          )
          setUploadingFiles((prev) =>
            (Array.isArray(prev) ? prev : []).map((item) =>
              item.id === uploadId ? { ...item, progress: 88 } : item,
            ),
          )
          const absolutePath = await resolveAttachmentAbsolutePath({
            path: uploaded.path,
            name: uploaded.name || uploadName,
          })
          if (absolutePath) {
            entries.push({
              type: 'path',
              transfer_method: 'local_path',
              path: absolutePath,
              name: uploaded.name || uploadName,
            })
          }
        } catch (error) {
          console.error('上传附件失败:', error)
          alert(t('chat.add_file_failed', { msg: error?.message || 'Upload failed' }))
        } finally {
          setUploadingFiles((prev) =>
            (Array.isArray(prev) ? prev : []).filter((item) => item.id !== uploadId),
          )
        }
        continue
      }

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
  }, [resolveAttachmentAbsolutePath, isPathlessBrowserFile, chatFileDirectoryPath, t])

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
    if (optionId.startsWith('provider:')) {
      handleChatProviderChange(optionId.replace('provider:', ''))
      return
    }
    if (optionId.startsWith('model:')) {
      handleChatModelChange(optionId.replace('model:', ''))
    }
  }, [handleChatProviderChange, handleChatModelChange])

  const enabledComposerProviderIds = (() => {
    const enabled = new Set()
    if (getGitHubCopilotCredentials()?.access) {
      enabled.add('github-copilot')
    }
    if (getOpenAICodexCredentials()?.access) {
      enabled.add('openai-codex')
    }
    if (String(getOpenCodeGoApiKey() || '').trim()) {
      enabled.add('opencode-go')
    }
    if (enabled.size === 0) {
      return CHAT_PROVIDER_OPTIONS.map((option) => option.id)
    }
    if (chatProvider) {
      enabled.add(chatProvider)
    }
    return CHAT_PROVIDER_OPTIONS
      .map((option) => option.id)
      .filter((providerId) => enabled.has(providerId))
  })()

  const composerAddMenuOptions = useMemo(() => {
    const visibleProviders = CHAT_PROVIDER_OPTIONS.filter((providerOption) =>
      enabledComposerProviderIds.includes(providerOption.id),
    )
    return [
      ...visibleProviders.map((providerOption) => ({
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
  }, [chatProvider, chatModel, enabledComposerProviderIds])

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
    setThinkingState('loading')
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
          setThinkingState('idle')
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
          setThinkingState('idle')
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
          setThinkingState('idle')
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
              setThinkingState('loading')
              return
            }

            if (event.event === 'thinking') {
              if (event.delta) {
                setThinkingState('exploring')
              }
              return
            }

            if (event.event === 'tool_event') {
              requestSidebarRefresh()
              requestArtifactsRefresh(180, { bumpPreviewVersion: false, silent: true })
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
              setThinkingState('exploring')
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
              setThinkingState('exploring')
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
                void (async () => {
                  const artifactFiles = await resolveAssistantArtifactFiles(finalSegments)
                  const errorMessage = {
                    role: 'assistant',
                    content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
                    error: true,
                    segments: finalSegments.length > 0 ? finalSegments : undefined,
                    tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
                    files: artifactFiles.length > 0 ? artifactFiles : undefined,
                    timestamp: new Date().toISOString()
                  }
                  setMessages([...newMessages, errorMessage])
                  setStreamingContent('')
                  setIsLoading(false)
                  setIsThinking(false)
                  setThinkingState('idle')
                  streamHandleRef.current = null
                  saveChatHistory([...newMessages, errorMessage], conversationId, {
                    provider: chatProvider,
                    model: requestModel,
                    agentRuntimeSessionId: nextRuntimeSessionId,
                    agentSessionFile: nextSessionFile,
                  })
                  resetStreamingSegments()
                  requestSidebarRefresh(20)
                  requestArtifactsRefresh(20, { bumpPreviewVersion: true, silent: true })
                })()
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
              void (async () => {
                const artifactFiles = await resolveAssistantArtifactFiles(finalSegments)
                const aiMessage = {
                  role: 'assistant',
                  content: finalText || '（无文本输出）',
                  segments: finalSegments.length > 0 ? finalSegments : undefined,
                  tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
                  files: artifactFiles.length > 0 ? artifactFiles : undefined,
                  timestamp: new Date().toISOString()
                }
                const updatedMessages = [...newMessages, aiMessage]
                setMessages(updatedMessages)
                setStreamingContent('')
                setIsLoading(false)
                setIsThinking(false)
                setThinkingState('idle')
                streamHandleRef.current = null
                saveChatHistory(updatedMessages, conversationId, {
                  provider: chatProvider,
                  model: requestModel,
                  agentRuntimeSessionId: nextRuntimeSessionId,
                  agentSessionFile: nextSessionFile,
                })
                resetStreamingSegments()
                requestSidebarRefresh(20)
                requestArtifactsRefresh(20, { bumpPreviewVersion: true, silent: true })
              })()
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
              void (async () => {
                const artifactFiles = await resolveAssistantArtifactFiles(finalSegments)
                const errorMessage = {
                  role: 'assistant',
                  content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
                  error: true,
                  segments: finalSegments.length > 0 ? finalSegments : undefined,
                  tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
                  files: artifactFiles.length > 0 ? artifactFiles : undefined,
                  timestamp: new Date().toISOString()
                }
                setMessages([...newMessages, errorMessage])
                setStreamingContent('')
                setIsLoading(false)
                setIsThinking(false)
                setThinkingState('idle')
                streamHandleRef.current = null
                saveChatHistory([...newMessages, errorMessage], conversationId, {
                  provider: chatProvider,
                  model: requestModel,
                  agentRuntimeSessionId: nextRuntimeSessionId,
                  agentSessionFile: nextSessionFile,
                })
                resetStreamingSegments()
                requestSidebarRefresh(20)
                requestArtifactsRefresh(20, { bumpPreviewVersion: true, silent: true })
              })()
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
        void (async () => {
          const artifactFiles = await resolveAssistantArtifactFiles(finalSegments)
          const errorMessage = {
            role: 'assistant',
            content: recoveredText ? `${recoveredText}\n\n_${errorText}_` : errorText,
            error: true,
            segments: finalSegments.length > 0 ? finalSegments : undefined,
            tools: finalToolEvents.length > 0 ? finalToolEvents : undefined,
            files: artifactFiles.length > 0 ? artifactFiles : undefined,
            timestamp: new Date().toISOString()
          }
          setMessages([...newMessages, errorMessage])
          setStreamingContent('')
          setIsLoading(false)
          setIsThinking(false)
          setThinkingState('idle')
          streamHandleRef.current = null
          saveChatHistory([...newMessages, errorMessage], conversationId, {
            provider: chatProvider,
            model: requestModel,
            agentRuntimeSessionId: nextRuntimeSessionId,
            agentSessionFile: nextSessionFile,
          })
          resetStreamingSegments()
          requestSidebarRefresh(20)
          requestArtifactsRefresh(20, { bumpPreviewVersion: true, silent: true })
        })()
      }
      return
    }

    const apiKey = getDifyApiKey()
    
    if (!apiKey) {
      alert(t('chat.configure_api_first'))
      setStreamingContent('')
      setIsLoading(false)
      setIsThinking(false)
      setThinkingState('idle')
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
            setThinkingState('exploring')
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
            setThinkingState('idle')
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
            setThinkingState('idle')
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
      setThinkingState('idle')
      setThinkingState('idle')
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
      setThinkingState('idle')
      
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
      requestSidebarRefresh(20)
      requestArtifactsRefresh(20, { bumpPreviewVersion: true, silent: true })
    }
  }

  // 快捷键支持
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={`chat-interface ${darkMode ? 'dark' : 'light'} ${fromLanding ? 'from-landing' : ''}`}>
      <div className={`chat-shell ${artifactsOpen ? 'artifacts-open' : ''}`}>
        <ChatMainColumn
          artifactsOpen={artifactsOpen}
          onToggleArtifactsOpen={() => setArtifactsOpen((open) => !open)}
          artifactEntriesCount={artifactEntries.length}
          messages={messages}
          chatFilePath={currentFile?.path}
          streamingSegments={streamingSegments}
          isThinking={isThinking}
          thinkingState={thinkingState}
          streamingContent={streamingContent}
          justFinished={justFinished}
          normalizeMarkdownForRender={normalizeMarkdownForRender}
          t={t}
          avatar={avatar}
          username={username}
          timeLocale={timeLocale}
          messagesEndRef={messagesEndRef}
          onOpenArtifact={handleOpenArtifactFromMessage}
          handleDragEnter={handleDragEnter}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
          uploadedFiles={uploadedFiles}
          uploadingFiles={uploadingFiles}
          removeUploadedFile={removeUploadedFile}
          fileInputRef={fileInputRef}
          handleFileUpload={handleFileUpload}
          inputValue={inputValue}
          setInputValue={setInputValue}
          handleSend={handleSend}
          handleStop={handleStop}
          handleComposerPaste={handleComposerPaste}
          handleOpenUploadPicker={handleOpenUploadPicker}
          composerAddMenuOptions={composerAddMenuOptions}
          handleComposerAddMenuSelect={handleComposerAddMenuSelect}
          isLoading={isLoading}
          inputRef={inputRef}
          isDragOver={isDragOver}
          handleKeyDown={handleKeyDown}
          skillItems={skillItems}
          handleSkillSelect={handleSkillSelect}
        />

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
          activeArtifactRawUrl={activeArtifactRawUrl}
          activeArtifactExtension={activeArtifactExtension}
          activeArtifactIsImage={activeArtifactIsImage}
          onClosePreview={() => setActiveArtifactId('')}
          onRevealArtifact={() => void handleRevealArtifact(activeArtifact)}
        />
      </div>
    </div>
  )
}

export default ChatInterface
