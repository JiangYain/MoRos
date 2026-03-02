import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Copy, Download } from 'lucide-react'
import { chatWithDifyStreaming, uploadFileToDify, uploadLocalFileContentToDify, getDifyApiKey, getDifyBaseUrl } from '../utils/dify'
import {
  chatWithGitHubCopilotStreaming,
  getGitHubCopilotAvailableModels,
  getValidGitHubCopilotCredentials,
  resolveGitHubCopilotModel,
} from '../utils/githubCopilot'
import {
  CHAT_MODEL_OPTIONS,
  CHAT_PROVIDER_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_CHAT_PROVIDER,
  normalizeChatModel,
  normalizeChatProvider,
  setActiveChatModel,
  setActiveChatProvider,
} from '../utils/chatProvider'
import { Streamdown } from 'streamdown'
import remarkMath from 'remark-math'
import { useI18n } from '../utils/i18n'
import ChatComposer from './ChatComposer'
import './ChatInterface.css'

const extractNodeText = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map((entry) => extractNodeText(entry)).join('')
  if (React.isValidElement(node)) return extractNodeText(node.props?.children)
  return ''
}

/**
 * 自定义代码块组件，带复制和下载功能
 * 注意：此组件替换 <pre> 标签，children 包含已高亮的 <code> 元素
 */
const CustomCodeBlock = ({ children }) => {
  const [copyState, setCopyState] = useState('idle')
  const [codeContent, setCodeContent] = useState('')
  const [codeLang, setCodeLang] = useState('text')
  const codeContainerRef = useRef(null)

  const renderedCodeBlock = React.useMemo(() => {
    const nodes = React.Children.toArray(children).filter(Boolean)
    const streamdownContainer = nodes.find(
      (child) => React.isValidElement(child) && child.props?.['data-code-block-container']
    )

    if (streamdownContainer && React.isValidElement(streamdownContainer)) {
      const sanitizedChildren = React.Children.toArray(streamdownContainer.props.children).filter((child) => {
        return !(React.isValidElement(child) && child.props?.['data-code-block-header'])
      })

      const mergedClassName = ['streamdown-code-container', streamdownContainer.props.className]
        .filter(Boolean)
        .join(' ')

      return React.cloneElement(streamdownContainer, {
        ref: codeContainerRef,
        className: mergedClassName,
        children: sanitizedChildren
      })
    }

    const fallbackText = nodes.map((node) => extractNodeText(node)).join('')
    let fallbackLanguage = 'text'
    let normalizedFallbackText = fallbackText
    const labeledMatch = fallbackText.match(/^\s*TEXT\s+([a-z0-9._+-]+)\s+([\s\S]*)$/i)
    if (labeledMatch) {
      fallbackLanguage = labeledMatch[1] || 'text'
      normalizedFallbackText = labeledMatch[2] || ''
    }
    return (
      <div
        ref={codeContainerRef}
        className="streamdown-code-container streamdown-fallback-code"
        data-language={fallbackLanguage}
      >
        <code>{normalizedFallbackText}</code>
      </div>
    )
  }, [children])

  const synchronizeMetadata = useCallback(() => {
    const container = codeContainerRef.current
    if (!container) {
      setCodeLang('text')
      setCodeContent('')
      return
    }

    const codeBlockElement = container.querySelector('[data-code-block]')
    const language =
      codeBlockElement?.getAttribute('data-language') ||
      codeBlockElement?.dataset?.language ||
      container.getAttribute('data-language') ||
      'text'

    const rawText = codeBlockElement?.textContent ?? container.textContent ?? ''
    const normalizedText = rawText.replace(/ /g, ' ')

    setCodeLang(language || 'text')
    setCodeContent(normalizedText)
  }, [])

  useEffect(() => {
    synchronizeMetadata()

    const container = codeContainerRef.current
    if (!container || typeof MutationObserver === 'undefined') {
      return
    }

    const observer = new MutationObserver(() => {
      synchronizeMetadata()
    })

    observer.observe(container, {
      subtree: true,
      childList: true,
      characterData: true
    })

    return () => observer.disconnect()
  }, [children, synchronizeMetadata])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeContent)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch (error) {
      console.error('Copy failed:', error)
      setCopyState('error')
      setTimeout(() => setCopyState('idle'), 2000)
    }
  }, [codeContent])

  const handleDownload = useCallback(() => {
    try {
      const safeLang = (codeLang || 'txt').toLowerCase().replace(/[^a-z0-9.+-]/g, '') || 'txt'
      const blob = new Blob([codeContent], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `code.${safeLang}`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }, [codeContent, codeLang])

  const languageLabel = (codeLang || 'text').toUpperCase()

  return (
    <div className="code-block-wrapper">
      {/* 悬浮语言标签与操作按钮（不依赖标题栏） */}
      <span className="code-language-label">{languageLabel}</span>
      <div className="code-actions">
        <button
          className="code-action-btn"
          onClick={handleCopy}
          title={copyState === 'copied' ? 'Copied' : 'Copy code'}
        >
          <Copy size={14} />
        </button>
        <button className="code-action-btn" onClick={handleDownload} title="Download code">
          <Download size={14} />
        </button>
      </div>
      <div className="code-block-body">
        {renderedCodeBlock}
      </div>
    </div>
  )
}

const MAX_COPILOT_IMAGE_SIZE = 5 * 1024 * 1024

const isImageMimeType = (value) => String(value || '').toLowerCase().startsWith('image/')

const isCopilotImageAttachment = (file) => {
  return (
    String(file?.provider || '') === 'github-copilot' &&
    String(file?.type || '') === 'image' &&
    isImageMimeType(file?.mimeType) &&
    typeof file?.dataUrl === 'string' &&
    file.dataUrl.startsWith('data:image/')
  )
}


/**
 * ChatInterface 组件
 * 用于 .MoRos 文件的对话界面
 * 设计风格：简单主义，iOS感，适度留白，精致排版
 */
function ChatInterface({ currentFile, darkMode, avatar, username }) {
  const { t, lang } = useI18n()
  const [messages, setMessages] = useState([])
  const [chatProvider, setChatProvider] = useState(DEFAULT_CHAT_PROVIDER)
  const [chatModel, setChatModel] = useState(DEFAULT_CHAT_MODEL)
  const [copilotAvailableModels, setCopilotAvailableModels] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [uploadingFiles, setUploadingFiles] = useState([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [justFinished, setJustFinished] = useState(false)
  const justFinishedTimerRef = useRef(null)
  const [autoPrompt, setAutoPrompt] = useState('')
  const [fromLanding, setFromLanding] = useState(false)
  const timeLocale = lang === 'en' ? 'en-US' : 'zh-CN'
  
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

  const consumePendingPromptForFile = useCallback((targetPath) => {
    try {
      const raw = sessionStorage.getItem('moros-pending-chat')
      if (!raw) return ''
      const pending = JSON.parse(raw)
      const prompt = String(pending?.prompt || '').trim()
      if (!prompt || pending?.path !== targetPath) return ''
      sessionStorage.removeItem('moros-pending-chat')
      return prompt
    } catch {
      return ''
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
          setChatProvider(normalizeChatProvider(data?.provider))
          setChatModel(normalizeChatModel(data?.model))
          const normalizedMessages = (data.messages || []).map((msg) => {
            if (!msg || typeof msg !== 'object') return msg
            if (typeof msg.content !== 'string') return msg
            const normalizedContent = normalizeBrandText(msg.content)
            return normalizedContent === msg.content ? msg : { ...msg, content: normalizedContent }
          })
          setMessages(normalizedMessages)
          setConversationId(data.conversationId || '')
        } else {
          setChatProvider(DEFAULT_CHAT_PROVIDER)
          setChatModel(DEFAULT_CHAT_MODEL)
          setMessages([])
          setConversationId('')
        }

        const pendingPrompt = consumePendingPromptForFile(currentFile.path)
        if (pendingPrompt) {
          setAutoPrompt(pendingPrompt)
          setFromLanding(true)
        }
      } catch (error) {
        if (isStale()) return
        console.error('加载对话历史失败:', error)
        setChatProvider(DEFAULT_CHAT_PROVIDER)
        setChatModel(DEFAULT_CHAT_MODEL)
        setMessages([])
        setConversationId('')
      }
    }
    
    loadChatHistory()
    return () => {
      disposed = true
    }
  }, [currentFile?.path, normalizeBrandText, consumePendingPromptForFile])

  // 保存对话历史到文件
  const saveChatHistory = useCallback(async (msgs, convId, overrides = {}) => {
    if (!currentFile?.path) return
    
    try {
      const { filesApi } = await import('../utils/api')
      const provider = normalizeChatProvider(overrides.provider ?? chatProvider)
      const model = normalizeChatModel(overrides.model ?? chatModel)
      const data = {
        type: 'moroschat',
        version: 1,
        provider,
        model,
        conversationId: convId,
        messages: msgs,
        updatedAt: new Date().toISOString()
      }
      await filesApi.saveFile(currentFile.path, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('保存对话历史失败:', error)
    }
  }, [currentFile, chatProvider, chatModel])

  const persistChatMeta = useCallback((provider, model) => {
    saveChatHistory(messages, conversationId, {
      provider: normalizeChatProvider(provider),
      model: normalizeChatModel(model),
    })
  }, [messages, conversationId, saveChatHistory])

  const handleChatProviderChange = useCallback((provider) => {
    const nextProvider = normalizeChatProvider(provider)
    setChatProvider(nextProvider)
    setActiveChatProvider(nextProvider)
    // provider 切换后清理待发送附件，避免跨 provider 残留格式不兼容
    setUploadedFiles([])
    setUploadingFiles([])
    persistChatMeta(nextProvider, chatModel)
  }, [chatModel, persistChatMeta])

  const handleChatModelChange = useCallback((model) => {
    const nextModel = normalizeChatModel(model)
    setChatModel(nextModel)
    setActiveChatModel(nextModel)
    persistChatMeta(chatProvider, nextModel)
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
          setChatModel(resolved.model)
          setActiveChatModel(resolved.model)
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

  const readFileAsDataUrl = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
  }, [])

  const uploadFilesToProvider = useCallback(async (files) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : []
    if (normalizedFiles.length === 0) return

    if (chatProvider === 'github-copilot') {
      const imageFiles = normalizedFiles.filter((file) => isImageMimeType(file?.type))
      const rejectedFiles = normalizedFiles.filter((file) => !isImageMimeType(file?.type))

      if (rejectedFiles.length > 0) {
        alert(`GitHub Copilot 当前仅支持图片上传，已忽略：${rejectedFiles.map((file) => file.name).join('、')}`)
      }
      if (imageFiles.length === 0) return

      const uploadIds = imageFiles.map((_, idx) => `upload-${Date.now()}-${idx}`)
      setUploadingFiles((prev) => [
        ...prev,
        ...imageFiles.map((file, idx) => ({
          id: uploadIds[idx],
          name: file.name,
          progress: 0,
        })),
      ])

      for (let i = 0; i < imageFiles.length; i += 1) {
        const file = imageFiles[i]
        const uploadId = uploadIds[i]
        let progressInterval = null
        try {
          progressInterval = setInterval(() => {
            setUploadingFiles((prev) =>
              prev.map((f) => (f.id === uploadId ? { ...f, progress: Math.min(f.progress + 20, 90) } : f))
            )
          }, 120)

          if (file.size > MAX_COPILOT_IMAGE_SIZE) {
            throw new Error('图片大小超过 5MB，请压缩后重试')
          }

          const dataUrl = await readFileAsDataUrl(file)

          if (progressInterval) clearInterval(progressInterval)
          setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId))
          setUploadedFiles((prev) => [
            ...prev,
            {
              provider: 'github-copilot',
              type: 'image',
              transfer_method: 'inline_data_url',
              mimeType: file.type || 'image/png',
              dataUrl,
              name: file.name,
            },
          ])
        } catch (error) {
          if (progressInterval) clearInterval(progressInterval)
          setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId))
          alert(t('chat.upload_file_failed', { name: file.name, msg: error.message }))
        }
      }
      return
    }

    const uploadIds = normalizedFiles.map((_, idx) => `upload-${Date.now()}-${idx}`)
    setUploadingFiles((prev) => [
      ...prev,
      ...normalizedFiles.map((file, idx) => ({
        id: uploadIds[idx],
        name: file.name,
        progress: 0,
      })),
    ])

    for (let i = 0; i < normalizedFiles.length; i += 1) {
      const file = normalizedFiles[i]
      const uploadId = uploadIds[i]
      let progressInterval = null
      try {
        progressInterval = setInterval(() => {
          setUploadingFiles((prev) =>
            prev.map((f) => (f.id === uploadId ? { ...f, progress: Math.min(f.progress + 15, 90) } : f))
          )
        }, 150)

        const result = await uploadFileToDify(file)
        if (progressInterval) clearInterval(progressInterval)
        setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId))
        setUploadedFiles((prev) => [
          ...prev,
          {
            type: 'document',
            transfer_method: 'local_file',
            upload_file_id: result.id,
            name: result.name,
          },
        ])
      } catch (error) {
        if (progressInterval) clearInterval(progressInterval)
        console.error('上传文件失败:', error)
        setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId))
        alert(t('chat.upload_file_failed', { name: file.name, msg: error.message }))
      }
    }
  }, [chatProvider, readFileAsDataUrl, t])

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
    const availableSet = new Set(copilotAvailableModels)
    return [
      {
        id: 'action:upload',
        label: chatProvider === 'github-copilot' ? 'Upload image' : 'Upload file',
      },
      { id: 'separator:provider', type: 'separator' },
      ...CHAT_PROVIDER_OPTIONS.map((providerOption) => ({
        id: `provider:${providerOption.id}`,
        label: `Provider: ${providerOption.label}`,
        selected: chatProvider === providerOption.id,
      })),
      { id: 'separator:model', type: 'separator' },
      ...CHAT_MODEL_OPTIONS.map((modelOption) => ({
        id: `model:${modelOption.id}`,
        label: `Model: ${modelOption.label}`,
        selected: chatModel === modelOption.id,
        disabled:
          chatProvider === 'github-copilot' &&
          copilotAvailableModels.length > 0 &&
          !availableSet.has(modelOption.id),
      })),
    ]
  }, [chatProvider, chatModel, copilotAvailableModels])

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
  }, [messages, isThinking, streamingContent])

  // 处理文件上传
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    await uploadFilesToProvider(files)
    e.target.value = ''
  }

  // 处理剪贴板粘贴图片
  const handleComposerPaste = useCallback((e) => {
    const clipboard = e.clipboardData
    if (!clipboard) return

    const itemFiles = Array.from(clipboard.items || [])
      .filter((item) => item.kind === 'file' && isImageMimeType(item.type))
      .map((item) => item.getAsFile())
      .filter(Boolean)

    const imageFiles = itemFiles.length > 0
      ? itemFiles
      : Array.from(clipboard.files || []).filter((file) => isImageMimeType(file.type))

    if (imageFiles.length === 0) return
    e.preventDefault()
    void uploadFilesToProvider(imageFiles)
  }, [uploadFilesToProvider])

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
        await uploadFilesToProvider(droppedFiles)
        return
      }

      // 尝试获取侧边栏拖拽的文件数据
      const dataText = e.dataTransfer.getData('text/plain')
      if (dataText) {
        const dragData = JSON.parse(dataText)
        
        // 检查是否是 md 文件
        if (dragData.isMarkdownFile && dragData.path) {
          if (chatProvider === 'github-copilot') {
            alert('GitHub Copilot 当前仅支持上传图片，请拖入本地图片文件。')
            return
          }
          // 立即显示上传中的文件
          const uploadId = `upload-${Date.now()}`
          setUploadingFiles(prev => [...prev, {
            id: uploadId,
            name: dragData.name,
            progress: 0
          }])
          
          try {
            // 模拟进度更新
            const progressInterval = setInterval(() => {
              setUploadingFiles(prev => prev.map(f => 
                f.id === uploadId ? { ...f, progress: Math.min(f.progress + 15, 90) } : f
              ))
            }, 150)
            
            // 读取文件内容
            const { filesApi } = await import('../utils/api')
            const content = await filesApi.readFile(dragData.path)
            
            // 上传到 Dify（与 md 编辑器一致的方法）
            const result = await uploadLocalFileContentToDify(dragData.name, content)
            
            // 清除进度模拟
            clearInterval(progressInterval)
            
            // 完成上传,移除上传中状态
            setUploadingFiles(prev => prev.filter(f => f.id !== uploadId))
            
            // 添加到已上传列表
            setUploadedFiles(prev => [...prev, {
              type: 'document',
              transfer_method: 'local_file',
              upload_file_id: result.id,
              name: result.name
            }])
          } catch (uploadError) {
            // 上传失败,移除上传中状态
            setUploadingFiles(prev => prev.filter(f => f.id !== uploadId))
            throw uploadError
          }
        }
      }
    } catch (error) {
      console.error('处理拖拽文件失败:', error)
      alert(t('chat.add_file_failed', { msg: error.message }))
    }
  }

  // 发送消息 (流式)
  const handleSend = async (overrideQuery, baseMessagesOverride) => {
    const query = String(overrideQuery ?? inputValue ?? '').trim()
    if (!query && uploadedFiles.length === 0) return
    if (isLoading) return

    // 立即添加用户消息（确保即时反馈）
    const userMessage = {
      role: 'user',
      content: query || t('chat.attachment_placeholder'),
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
      timestamp: new Date().toISOString()
    }

    const baseMessages = Array.isArray(baseMessagesOverride) ? baseMessagesOverride : messages
    const newMessages = [...baseMessages, userMessage]
    setMessages(newMessages)
    setInputValue('')
    if (fromLanding) {
      setFromLanding(false)
    }

    const filesToSend = uploadedFiles.length > 0 ? [...uploadedFiles] : undefined
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

    let streamedText = ''
    let newConversationId = conversationId

    if (chatProvider === 'github-copilot') {
      const unsupportedAttachments = (filesToSend || []).filter((file) => !isCopilotImageAttachment(file))
      if (unsupportedAttachments.length > 0) {
        const unsupportedMessage = {
          role: 'assistant',
          content: 'GitHub Copilot 当前仅支持图片附件，请移除非图片附件后重试。',
          error: true,
          timestamp: new Date().toISOString()
        }
        setMessages([...newMessages, unsupportedMessage])
        setStreamingContent('')
        setIsLoading(false)
        setIsThinking(false)
        streamHandleRef.current = null
        saveChatHistory([...newMessages, unsupportedMessage], conversationId)
        return
      }

      const credentials = await getValidGitHubCopilotCredentials()
      if (!credentials) {
        alert('请先在 Settings -> Integrations 中完成 GitHub Copilot OAuth 登录')
        setStreamingContent('')
        setIsLoading(false)
        setIsThinking(false)
        streamHandleRef.current = null
        saveChatHistory(newMessages, conversationId)
        return
      }

      let requestModel = chatModel
      try {
        const resolvedModel = await resolveGitHubCopilotModel(chatModel, credentials, copilotAvailableModels)
        if (resolvedModel.availableModels.length > 0) {
          setCopilotAvailableModels(resolvedModel.availableModels)
        }
        if (resolvedModel.model) {
          requestModel = resolvedModel.model
        }
        if (resolvedModel.model && resolvedModel.model !== chatModel) {
          setChatModel(resolvedModel.model)
          setActiveChatModel(resolvedModel.model)
          saveChatHistory(newMessages, conversationId, {
            provider: chatProvider,
            model: resolvedModel.model,
          })
        }
      } catch {}

      const payloadMessages = newMessages
        .filter((msg) => {
          if (msg.role !== 'user' && msg.role !== 'assistant') return false
          const text = String(msg.content || '').trim()
          if (text) return true
          const hasImageAttachments = Array.isArray(msg.files) && msg.files.some(isCopilotImageAttachment)
          return hasImageAttachments
        })
        .map((msg) => {
          const role = msg.role === 'assistant' ? 'assistant' : 'user'
          if (role === 'assistant') {
            return {
              role,
              content: String(msg.content || ''),
            }
          }

          const text = String(msg.content || '')
          const imageAttachments = Array.isArray(msg.files)
            ? msg.files.filter(isCopilotImageAttachment)
            : []
          if (imageAttachments.length === 0) {
            return {
              role,
              content: text,
            }
          }

          const contentParts = []
          if (text.trim()) {
            contentParts.push({ type: 'text', text })
          }
          imageAttachments.forEach((file) => {
            contentParts.push({
              type: 'image_url',
              image_url: { url: file.dataUrl },
            })
          })
          if (contentParts.length === 0) {
            contentParts.push({ type: 'text', text: t('chat.attachment_placeholder') })
          }

          return {
            role,
            content: contentParts,
          }
        })

      try {
        const handle = chatWithGitHubCopilotStreaming(
          {
            model: requestModel,
            messages: payloadMessages,
          },
          (event) => {
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
              streamedText += normalizeBrandText(event.answer || '')
              setStreamingContent(normalizeMathDelimiters(streamedText))
            } else if (event.event === 'message_end') {
              if (thinkingHideTimerRef.current) {
                clearTimeout(thinkingHideTimerRef.current)
                thinkingHideTimerRef.current = null
              }
              const aiMessage = {
                role: 'assistant',
                content: normalizeMathDelimiters(normalizeBrandText(streamedText)),
                timestamp: new Date().toISOString()
              }
              const updatedMessages = [...newMessages, aiMessage]
              setMessages(updatedMessages)
              setStreamingContent('')
              setIsLoading(false)
              setIsThinking(false)
              streamHandleRef.current = null
              saveChatHistory(updatedMessages, conversationId)
            } else if (event.event === 'error') {
              if (thinkingHideTimerRef.current) {
                clearTimeout(thinkingHideTimerRef.current)
                thinkingHideTimerRef.current = null
              }
              const errorMessage = {
                role: 'assistant',
                content: `${t('chat.error_prefix')}: ${normalizeBrandText(event.message || '')}`,
                error: true,
                timestamp: new Date().toISOString()
              }
              setMessages([...newMessages, errorMessage])
              setStreamingContent('')
              setIsLoading(false)
              setIsThinking(false)
              streamHandleRef.current = null
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
        const errorMessage = {
          role: 'assistant',
          content: `${t('chat.error_prefix')}: ${normalizeBrandText(error.message || '')}`,
          error: true,
          timestamp: new Date().toISOString()
        }
        setMessages([...newMessages, errorMessage])
        setStreamingContent('')
        setIsLoading(false)
        setIsThinking(false)
        streamHandleRef.current = null
      }
      return
    }

    const apiKey = getDifyApiKey()
    const baseUrl = getDifyBaseUrl()
    
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
          query,
          conversationId,
          files: filesToSend
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
            streamedText += normalizeBrandText(event.answer || '')
            setStreamingContent(normalizeMathDelimiters(streamedText))
          } else if (event.event === 'message_end') {
            // 流式结束
            if (thinkingHideTimerRef.current) {
              clearTimeout(thinkingHideTimerRef.current)
              thinkingHideTimerRef.current = null
            }
            const aiMessage = {
              role: 'assistant',
              content: normalizeMathDelimiters(normalizeBrandText(streamedText)),
              timestamp: new Date().toISOString()
            }

            const updatedMessages = [...newMessages, aiMessage]
            setMessages(updatedMessages)
            setStreamingContent('')
            setIsLoading(false)
            setIsThinking(false)
            streamHandleRef.current = null

            // 保存对话ID
            if (event.conversation_id) {
              newConversationId = event.conversation_id
              setConversationId(newConversationId)
              saveChatHistory(updatedMessages, newConversationId)
            }
          } else if (event.event === 'error') {
            // 错误处理
            if (thinkingHideTimerRef.current) {
              clearTimeout(thinkingHideTimerRef.current)
              thinkingHideTimerRef.current = null
            }
            console.error('流式响应错误:', event)
            const errorMessage = {
              role: 'assistant',
              content: `${t('chat.error_prefix')}: ${normalizeBrandText(event.message || '')}`,
              error: true,
              timestamp: new Date().toISOString()
            }
            setMessages([...newMessages, errorMessage])
            setStreamingContent('')
            setIsLoading(false)
            setIsThinking(false)
            streamHandleRef.current = null
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
      const errorMessage = {
        role: 'assistant',
        content: `${t('chat.error_prefix')}: ${normalizeBrandText(error.message || '')}`,
        error: true,
        timestamp: new Date().toISOString()
      }
      
      setMessages([...newMessages, errorMessage])
      setStreamingContent('')
      setIsLoading(false)
      setIsThinking(false)
      streamHandleRef.current = null
    }
  }

  // Landing 页面跳转到 chat 文件后，自动发送首条消息
  useEffect(() => {
    if (!autoPrompt || isLoading) return
    const prompt = autoPrompt
    setAutoPrompt('')
    handleSend(prompt, messages)
  }, [autoPrompt, isLoading])

  // 停止流式响应
  const handleStop = () => {
    if (streamHandleRef.current) {
      streamHandleRef.current.abort()
      streamHandleRef.current = null
      if (thinkingHideTimerRef.current) {
        clearTimeout(thinkingHideTimerRef.current)
        thinkingHideTimerRef.current = null
      }
      setIsLoading(false)
      setIsThinking(false)
      
      // 保存当前流式内容
      if (streamingContent) {
        const aiMessage = {
          role: 'assistant',
          content: streamingContent + '\n\n_[已停止]_',
          timestamp: new Date().toISOString()
        }
        const updatedMessages = [...messages, aiMessage]
        setMessages(updatedMessages)
        saveChatHistory(updatedMessages, conversationId)
      }
      
      setStreamingContent('')
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

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.length === 0 && !streamingContent && !isThinking ? (
          <div className="chat-empty">
            <div className="chat-empty-text">{t('chat.empty_title')}</div>
            <div className="chat-empty-hint">{t('chat.empty_hint')}</div>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.role} ${msg.error ? 'error' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="chat-message-avatar">
                    <img src="/favicon.svg" alt="AI" />
                  </div>
                )}
                <div className="chat-message-content">
                  <div className="chat-message-text">
                    {msg.role === 'assistant' ? (
                      <Streamdown 
                        className="markdown-content"
                        parseIncompleteMarkdown={false}
                        controls={false}
                        remarkPlugins={[[remarkMath, { singleDollarTextMath: true }]]}
                        components={{
                          pre: CustomCodeBlock
                        }}
                      >
                        {msg.content || '...'}
                      </Streamdown>
                    ) : (
                      msg.content || ''
                    )}
                  </div>
                  {msg.files && msg.files.length > 0 && (
                    <div className="chat-message-files">
                      {msg.files.map((file, i) => (
                        <div key={i} className="chat-uploaded-file" title={file.name}>
                          <span className="chat-uploaded-file-name">{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="chat-message-time">
                    {new Date(msg.timestamp).toLocaleTimeString(timeLocale, {
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
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
            ))}
            
            {/* Thinking 状态显示 */}
            {isThinking && !streamingContent && (
              <div className="chat-message assistant thinking">
                <div className="chat-message-avatar">
                  <img src="/favicon.svg" alt="AI" />
                </div>
                <div className="chat-message-content">
                  <div className="chat-message-text thinking-text">
                    {t('chat.thinking')}
                  </div>
                </div>
              </div>
            )}
            
            {/* 流式内容显示 */}
            {streamingContent && (
              <div className="chat-message assistant streaming">
                <div className="chat-message-avatar">
                  <img src="/favicon.svg" alt="AI" />
                </div>
                <div className="chat-message-content">
                  <div className="chat-message-text">
                    <Streamdown 
                      className="markdown-content"
                      parseIncompleteMarkdown={true}
                      controls={false}
                      remarkPlugins={[[remarkMath, { singleDollarTextMath: true }]]}
                      components={{
                        pre: CustomCodeBlock
                      }}
                    >
                      {streamingContent}
                    </Streamdown>
                  </div>
                  <div className="chat-message-time streaming-indicator">
                    <span className="streaming-dot"></span>
                    {t('chat.typing')}
                  </div>
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
          accept={chatProvider === 'github-copilot' ? 'image/*' : undefined}
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
  )
}

export default ChatInterface

