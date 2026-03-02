import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import { filesApi } from '../utils/api'
import './EnhancedWhiteboard.css'
// 确保样式加载
import '@excalidraw/excalidraw/index.css'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useI18n } from '../utils/i18n'
import { generateImageFromPrompt, generateImageFromPromptGPT4O, generateImageFromPromptMidjourney, generateImageVariationGPT4O } from '../utils/markovImage'

// 增强的错误边界，提供更好的错误恢复机制
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0 }
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('EnhancedWhiteboard error:', error, errorInfo)
    this.setState({ errorInfo })
    
    // 自动重试机制（仅针对特定错误）
    if (error.message.includes('ElementsChange invariant') && this.state.retryCount < 2) {
      setTimeout(() => {
        this.setState(prevState => ({ 
          hasError: false, 
          error: null, 
          errorInfo: null,
          retryCount: prevState.retryCount + 1 
        }))
        // 强制重新渲染白板
        if (this.props.onErrorRetry) {
          this.props.onErrorRetry()
        }
      }, 1000)
    }
  }
  
  handleManualRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    if (this.props.onErrorRetry) {
      this.props.onErrorRetry()
    }
  }
  
  render() {
    if (this.state.hasError) {
      const isElementsError = this.state.error?.message?.includes('ElementsChange invariant')
      return (
        <div className="wb-error">
          <h3>白板遇到错误</h3>
          {isElementsError ? (
            <div>
              <p>图像元素状态同步错误，这通常在删除 MoRos 生成的图像时发生</p>
              <p>请尝试以下解决方案：</p>
              <ul style={{ textAlign: 'left', marginTop: '10px' }}>
                <li>点击"重试"按钮恢复白板</li>
                <li>如果问题持续，请刷新页面</li>
                <li>避免快速连续删除图像元素</li>
              </ul>
            </div>
          ) : (
            <p>白板加载时发生未知错误</p>
          )}
          <div style={{ marginTop: '15px' }}>
            <button onClick={this.handleManualRetry} style={{ marginRight: '10px' }}>
              重试
            </button>
            <button onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '15px', textAlign: 'left' }}>
              <summary>错误详情 (开发模式)</summary>
              <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                {this.state.error?.stack}
              </pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

// 创建带自定义数据的矩形元素（作为 Markdown 卡片容器）
const createMarkdownCardElement = (filePath, fileName, x, y, id) => ({
  id: id || Math.random().toString(36).slice(2),
  type: 'rectangle',
  x,
  y,
  width: 340,
  height: 260,
  angle: 0,
  strokeColor: 'transparent',
  backgroundColor: 'rgba(255, 255, 255, 0.01)', // 极淡填充，确保整个区域可命中
  fillStyle: 'solid',
  strokeWidth: 0,
  strokeStyle: 'solid',
  roughness: 0,
  opacity: 100, // 保持不透明，让填充生效
  groupIds: [],
  frameId: null,
  roundness: null, // 尖锐角，确保完整命中区域
  seed: Math.floor(Math.random() * 1000000),
  versionNonce: Math.floor(Math.random() * 1000000),
  isDeleted: false,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
  customData: {
    type: 'markdown-card',
    filePath,
    fileName,
  }
})

function EnhancedWhiteboard({ currentFile, onFileSave, theme, language, onFileClick }) {
  const { t } = useI18n()
  const [excalidrawAPI, setExcalidrawAPI] = useState(null)
  const [initialData, setInitialData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [langCode, setLangCode] = useState(language || 'zh-CN')
  const [errorBoundaryKey, setErrorBoundaryKey] = useState(0) // 用于强制重新渲染
  const saveTimerRef = useRef(null)
  // 精准保存签名与队列控制
  const lastSavedSignatureRef = useRef('')
  const inFlightSignatureRef = useRef('')
  const queuedSaveRef = useRef(null) // { data, signature }
  const isSavingRef = useRef(false)
  const latestDataRef = useRef(null)
  
  // 错误恢复处理
  const handleErrorRetry = useCallback(() => {
    setErrorBoundaryKey(prev => prev + 1)
    setExcalidrawAPI(null)
    setInitialData(null)
    setLoading(true)
    // 强制重新加载数据
    setTimeout(() => {
      if (currentFile?.path) {
        // 触发重新加载
        setLoading(false)
      }
    }, 100)
  }, [currentFile?.path])

  // 序列化（仅用于写盘）：克隆必要字段并裁剪未引用的文件
  const serializeForSave = useCallback((elements, appState, files) => {
    const usedFileIds = new Set(
      (Array.isArray(elements) ? elements : [])
        .filter((el) => el && el.type === 'image' && el.fileId)
        .map((el) => el.fileId)
    )
    const filesObj = files && typeof files === 'object' ? files : {}
    const prunedFiles = {}
    for (const id of usedFileIds) {
      const f = filesObj[id]
      if (f) prunedFiles[id] = { ...f }
    }
    const minimalAppState = {
      ...appState,
      collaborators: Array.isArray(appState?.collaborators) ? appState.collaborators : [],
      gridSize: appState?.gridSize ?? null,
      viewBackgroundColor: appState?.viewBackgroundColor || '#ffffff',
    }
    const payload = { type: 'excalidraw', version: 2, elements, appState: minimalAppState, files: prunedFiles }
    return JSON.stringify(payload, null, 2)
  }, [])

  // 计算变化签名（避免深度序列化）：
  // - 元素版本+删除标记（精准捕捉内容变化）
  // - 文件数量（新增/移除图片等）
  // - 画布背景色/网格（重要外观）
  const computeSignature = useCallback((data) => {
    if (!data) return ''
    const elements = Array.isArray(data.elements) ? data.elements : []
    const versions = elements.map((el) => `${el.id || ''}:${el.version || 0}:${el.isDeleted ? 1 : 0}`).join('|')
    const filesCount = data.files ? Object.keys(data.files).length : 0
    const bg = data.appState?.viewBackgroundColor || ''
    const grid = data.appState?.gridSize ?? ''
    return `${elements.length}#${versions}#${filesCount}#${bg}#${grid}`
  }, [])

  useEffect(() => { if (language) setLangCode(language) }, [language])

  // 添加页面卸载时的保存保护 - 优化版本
  useEffect(() => {
    const handleBeforeUnload = async (e) => {
      // 检查是否有未保存的数据
      const currentData = latestDataRef.current
      if (currentData && currentFile?.path) {
        const signature = computeSignature(currentData)
        if (signature !== lastSavedSignatureRef.current) {
          e.preventDefault()
          e.returnValue = '您有未保存的白板内容，确定要离开吗？'
          
          // 尝试同步保存
          try {
            const serialized = serializeForSave(currentData.elements, currentData.appState, currentData.files)
            await filesApi.saveFile(currentFile.path, serialized, { keepalive: true })
            lastSavedSignatureRef.current = signature
            onFileSave?.(currentFile, serialized)
          } catch (err) {
            console.error('页面卸载前保存白板失败:', err)
          }
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [currentFile?.path, onFileSave, computeSignature, serializeForSave])

  // 读取 excalidraw JSON
  useEffect(() => {
    const load = async () => {
      if (!currentFile?.path) return
      setLoading(true)
      try {
        const contentText = await filesApi.readFile(currentFile.path)
        let parsed
        try { parsed = JSON.parse(contentText || '{}') } catch { parsed = {} }
        const normalized = {
          type: parsed.type || 'excalidraw',
          version: parsed.version || 2,
          elements: Array.isArray(parsed.elements) ? parsed.elements : [],
          appState: {
            ...parsed.appState,
            collaborators: Array.isArray(parsed.appState?.collaborators) ? parsed.appState.collaborators : [],
            gridSize: parsed.appState?.gridSize || null,
            viewBackgroundColor: parsed.appState?.viewBackgroundColor || '#ffffff'
          },
          files: parsed.files || {}
        }
        setInitialData(normalized)
        // 初始化时记录签名（精确）
        lastSavedSignatureRef.current = computeSignature(normalized)
        inFlightSignatureRef.current = ''
        queuedSaveRef.current = null
      } catch {
        const normalized = {
          type: 'excalidraw', version: 2, elements: [],
          appState: { collaborators: [], gridSize: null, viewBackgroundColor: '#ffffff' }, files: {}
        }
        setInitialData(normalized)
        // 初始化时记录签名（精确）
        lastSavedSignatureRef.current = computeSignature(normalized)
        inFlightSignatureRef.current = ''
        queuedSaveRef.current = null
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentFile?.path, computeSignature])

  // 顺序处理保存队列，避免并发与乱序覆盖
  const processSaveQueue = useCallback(() => {
    if (isSavingRef.current) return
    const task = queuedSaveRef.current
    if (!task || !currentFile?.path) return
    queuedSaveRef.current = null
    isSavingRef.current = true
    inFlightSignatureRef.current = task.signature
    setSaving(true)
    ;(async () => {
      try {
        const d = task.data || {}
        const serialized = serializeForSave(d.elements, d.appState, d.files)
        await filesApi.saveFile(currentFile.path, serialized)
        lastSavedSignatureRef.current = task.signature
        onFileSave?.(currentFile, serialized)
      } catch (e) {
        console.error('保存白板失败:', e)
      } finally {
        setSaving(false)
        isSavingRef.current = false
        inFlightSignatureRef.current = ''
        if (queuedSaveRef.current && queuedSaveRef.current.signature !== lastSavedSignatureRef.current) {
          setTimeout(processSaveQueue, 0)
        }
      }
    })()
  }, [currentFile?.path, onFileSave, computeSignature, serializeForSave])

  // 自动保存（去抖）- 使用签名精准检测变化
  const scheduleSave = useCallback((data, options = {}) => {
    if (!currentFile?.path) return
    latestDataRef.current = data

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    
    // 对于 MoRos 图像操作，使用更短的延迟确保及时保存
    const saveDelay = options.priority === 'high' ? 300 : 800
    
    saveTimerRef.current = setTimeout(() => {
      const toSaveObj = latestDataRef.current
      if (!toSaveObj) return
      const signature = computeSignature(toSaveObj)
      if (
        signature === lastSavedSignatureRef.current ||
        signature === inFlightSignatureRef.current ||
        (queuedSaveRef.current && signature === queuedSaveRef.current.signature)
      ) {
        return
      }
      queuedSaveRef.current = { data: toSaveObj, signature }
      processSaveQueue()
    }, saveDelay)
  }, [currentFile?.path, computeSignature, processSaveQueue])

  // 在文件切换或组件卸载时，若有待保存内容，则做一次最后保存
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      // 检查是否有未保存的数据
      const currentData = latestDataRef.current
      if (currentData && currentFile?.path) {
        const signature = computeSignature(currentData)
        if (signature !== lastSavedSignatureRef.current) {
          ;(async () => {
            try {
              setSaving(true)
              const serialized = serializeForSave(currentData.elements, currentData.appState, currentData.files)
              await filesApi.saveFile(currentFile.path, serialized)
              lastSavedSignatureRef.current = signature
              onFileSave?.(currentFile, serialized)
            } catch (e) {
              console.error('保存白板失败(卸载前):', e)
            } finally {
              setSaving(false)
            }
          })()
        }
      }
    }
  }, [currentFile?.path, onFileSave, computeSignature, serializeForSave])

  // 拖拽到 Excalidraw 画布
  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer.types.includes('application/markdown-file')) setDragOver(true)
  }, [])
  const handleDragOver = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer.types.includes('application/markdown-file')) { e.dataTransfer.dropEffect = 'copy'; setDragOver(true) }
  }, [])
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false)
  }, [])
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (!excalidrawAPI) return
    try {
      const markdownData = e.dataTransfer.getData('application/markdown-file')
      if (!markdownData) return
      const fileData = JSON.parse(markdownData)
      if (!fileData.isMarkdownFile) return
      // 计算 Excalidraw 坐标
      const appState = excalidrawAPI.getAppState()
      const { zoom, scrollX, scrollY } = appState
      const rect = e.currentTarget.getBoundingClientRect()
      const clientX = e.clientX - rect.left
      const clientY = e.clientY - rect.top
      const x = (clientX - scrollX) / zoom.value - 160
      const y = (clientY - scrollY) / zoom.value - 120
      const newEl = createMarkdownCardElement(fileData.path, fileData.name, x, y)
      const current = excalidrawAPI.getSceneElements()
      excalidrawAPI.updateScene({ elements: [...current, newEl] })
      // 触发保存：交给 onChange 回调统一处理
    } catch (err) {
      console.error('处理拖拽放置失败:', err)
    }
  }, [excalidrawAPI])

  // 同步保存 - 优化版本，避免拖拽时的性能问题
  const onChange = useCallback((elements, appState, files) => {
    const payload = { type: 'excalidraw', version: 2, elements, appState, files }
    // 仅缓存数据对象，延迟序列化以提高性能
    latestDataRef.current = payload
    scheduleSave(payload)
  }, [scheduleSave])

  // 外层覆盖层：独立于 Excalidraw 的安全渲染（确保任何版本都可用）
  const [overlayAppState, setOverlayAppState] = useState({ zoom: { value: 1 }, scrollX: 0, scrollY: 0 })
  const [overlayElements, setOverlayElements] = useState([])
  
  // 添加引用来存储之前的状态，用于智能比较
  const prevElementsRef = useRef([])
  const prevAppStateRef = useRef({ zoom: { value: 1 }, scrollX: 0, scrollY: 0 })

  useEffect(() => {
    if (!excalidrawAPI) return
    let rafId = 0
    // 缓存上一次的元素签名，避免每帧都 setState 触发重渲染
    let lastSignature = ''
    const tick = () => {
      try {
        const s = excalidrawAPI.getAppState()
        // 实时更新视图相关（滚动/缩放）
        setOverlayAppState({ zoom: { value: s.zoom?.value || 1 }, scrollX: s.scrollX || 0, scrollY: s.scrollY || 0 })

        // 仅当 markdown 元素集合（或其几何/文件信息）发生变化时才更新 overlayElements
        const rawEls = excalidrawAPI.getSceneElements().filter((el) => el.customData && el.customData.type === 'markdown-card')
        const signature = rawEls
          .map((el) => `${el.id}:${el.x}:${el.y}:${el.width}:${el.height}:${el.customData?.filePath || ''}:${el.customData?.fileName || ''}`)
          .join('|')
        if (signature !== lastSignature) {
          lastSignature = signature
          setOverlayElements(rawEls)
        }

      } catch (error) {
        console.error('Tick error:', error)
      }
      rafId = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(rafId)
  }, [excalidrawAPI])

  // 通用图像生成函数
  const generateAndInsertImage = useCallback(async (prompt, modelType = 'gemini', selectedImages = []) => {
    try {
      const toastMessage = modelType === 'midjourney' ? '正在提交 Midjourney 任务...' : '正在生成图像…'

      excalidrawAPI.setToast?.({ message: toastMessage })
      
      // 检查图像数量限制
      if (selectedImages.length > 3) {
        excalidrawAPI.setToast?.({ message: `选择的图像过多（${selectedImages.length}张），最多支持3张图像，请减少选择数量` })
        return
      }
      
      // 获取选中图像的数据
      let imageDataURLs = []
      if (selectedImages.length > 0) {
        const files = excalidrawAPI.getFiles?.() || {}
        for (const imageEl of selectedImages) {
          if (imageEl.fileId && files[imageEl.fileId]) {
            const fileData = files[imageEl.fileId]
            if (fileData.dataURL) {
              imageDataURLs.push(fileData.dataURL)
            }
          }
        }
      }
      
      let res
      if (modelType === 'gpt-4o') {
        res = await generateImageFromPromptGPT4O(prompt, { images: imageDataURLs })
      } else {
        res = await generateImageFromPrompt(prompt, { images: imageDataURLs })
      }
      
      if (!res?.dataURL && !res?.url) {
        excalidrawAPI.setToast?.({ message: '生成失败：无可用图像' })
        return
      }

      const dataURL = res.dataURL
      if (!dataURL) {
        excalidrawAPI.setToast?.({ message: '生成成功，但无法跨域获取图片数据' })
        return
      }

      // 读取图像天然尺寸
      const img = new Image()
      img.src = dataURL
      await new Promise((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
      })

      // 计算插入尺寸（限制最大边 480）
      let w = img.naturalWidth || 512
      let h = img.naturalHeight || 512
      const maxSide = 480
      if (w > h && w > maxSide) { h = Math.round(h * (maxSide / w)); w = maxSide }
      else if (h >= w && h > maxSide) { w = Math.round(w * (maxSide / h)); h = maxSide }

      // 将文件加入 editor 的二进制文件表
      // 压缩并准备存储数据URL，降低保存体积
      let fileDataURL = dataURL
      try {
        const MAX_STORE_SIDE = 1024
        const sw = img.naturalWidth || 0
        const sh = img.naturalHeight || 0
        if (sw && sh && (sw > MAX_STORE_SIDE || sh > MAX_STORE_SIDE)) {
          const scale = sw > sh ? MAX_STORE_SIDE / sw : MAX_STORE_SIDE / sh
          const tw = Math.round(sw * scale)
          const th = Math.round(sh * scale)
          const canvas = document.createElement('canvas')
          canvas.width = tw
          canvas.height = th
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, tw, th)
            const m = /^data:([^;]+);/.exec(dataURL)
            const origMime = m ? m[1] : 'image/png'
            const targetMime = origMime.includes('jpeg') || origMime.includes('jpg') ? 'image/jpeg' : 'image/png'
            fileDataURL = canvas.toDataURL(targetMime, 0.92)
          }
        }
      } catch (e) {
        fileDataURL = dataURL
      }

      // 生成唯一的文件 ID 和元素 ID
      const fileId = 'markov-img-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      const elementId = 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      const mimeMatch = /^data:([^;]+);/.exec(dataURL)
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'
      const now = Date.now()

      // 获取当前选中的文本元素
      const appState = excalidrawAPI.getAppState()
      const selectedIds = appState?.selectedElementIds || {}
      const selected = excalidrawAPI.getSceneElements().filter(el => selectedIds[el.id])
      const textEl = selected.find(el => el?.type === 'text')

      // 计算位置：文本右侧 24px
      const x = textEl ? (textEl.x || 0) + (textEl.width || 0) + 24 : 100
      const y = textEl ? textEl.y || 0 : 100

      // 先添加文件到 files 映射
      const fileData = { 
        id: fileId, 
        dataURL: fileDataURL, 
        mimeType, 
        created: now 
      }
      
      // 创建新元素
      const newEl = {
        id: elementId,
        type: 'image',
        x,
        y,
        width: w,
        height: h,
        angle: 0,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 0,
        strokeStyle: 'solid',
        roughness: 0,
        roundness: null,
        opacity: 100,
        groupIds: [],
        frameId: null,
        boundElements: null,
        updated: now,
        link: null,
        locked: false,
        seed: Math.floor(Math.random() * 1e9),
        versionNonce: Math.floor(Math.random() * 1e9),
        isDeleted: false,
        // image-specific
        fileId,
        status: 'saved',
        scale: [1, 1],
        crop: null,
        // 添加版本控制字段确保状态一致性
        version: 1,
        customData: {
          type: 'markov-image',
          prompt: prompt,
          generated: now,
          model: modelType
        }
      }

      // 使用更安全的分步更新策略，避免状态不一致
      try {
        // 第一步：添加文件到文件映射
        await new Promise((resolve) => {
          excalidrawAPI.addFiles?.([fileData])
          // 确保文件添加完成
          setTimeout(resolve, 50)
        })
        
        // 第二步：添加元素到场景
        await new Promise((resolve) => {
          const currentElements = excalidrawAPI.getSceneElements()
          excalidrawAPI.updateScene({ 
            elements: [...currentElements, newEl],
            commitToHistory: true // 确保操作被记录到历史中，支持撤销
          })
          setTimeout(resolve, 50)
        })
        
        // 确保状态同步完成后再触发保存
        setTimeout(() => {
          const payload = {
            elements: excalidrawAPI.getSceneElements(),
            appState: excalidrawAPI.getAppState(),
            files: excalidrawAPI.getFiles?.() || {}
          }
          latestDataRef.current = payload
          scheduleSave(payload, { priority: 'high' }) // 高优先级保存
        }, 100)
        
      } catch (error) {
        console.error('MoRos 图像添加失败:', error)
        excalidrawAPI.setToast?.({ message: '图像添加失败：' + (error?.message || '状态同步错误') })
        return
      }
      excalidrawAPI.setToast?.({ message: `已插入生成的图像 (${modelType.toUpperCase()})` })
    } catch (err) {
      console.error('MoRos 图像生成失败:', err)
      excalidrawAPI.setToast?.({ message: '生成失败：' + (err?.message || '未知错误') })
    }
  }, [excalidrawAPI, scheduleSave])

  // 图像变体生成函数
  const generateAndInsertImageVariation = useCallback(async (imageElement) => {
    try {
      excalidrawAPI.setToast?.({ message: '正在生成图像变体…' })
      
      // 获取图像数据
      const files = excalidrawAPI.getFiles?.() || {}
      if (!imageElement.fileId || !files[imageElement.fileId]) {
        excalidrawAPI.setToast?.({ message: '无法获取图像数据' })
        return
      }
      
      const fileData = files[imageElement.fileId]
      if (!fileData.dataURL) {
        excalidrawAPI.setToast?.({ message: '图像数据格式不支持' })
        return
      }
      
      // 调用变体生成API
      const res = await generateImageVariationGPT4O(fileData.dataURL)
      
      if (!res?.dataURL && !res?.url) {
        excalidrawAPI.setToast?.({ message: '生成失败：无可用图像' })
        return
      }

      const dataURL = res.dataURL
      if (!dataURL) {
        excalidrawAPI.setToast?.({ message: '生成成功，但无法跨域获取图片数据' })
        return
      }

      // 读取图像天然尺寸
      const img = new Image()
      img.src = dataURL
      await new Promise((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
      })

      // 计算插入尺寸（限制最大边 480）
      let w = img.naturalWidth || 512
      let h = img.naturalHeight || 512
      const maxSide = 480
      if (w > h && w > maxSide) { h = Math.round(h * (maxSide / w)); w = maxSide }
      else if (h >= w && h > maxSide) { w = Math.round(w * (maxSide / h)); h = maxSide }

      // 将文件加入 editor 的二进制文件表
      // 压缩并准备存储数据URL，降低保存体积
      let fileDataURL = dataURL
      try {
        const MAX_STORE_SIDE = 1024
        const sw = img.naturalWidth || 0
        const sh = img.naturalHeight || 0
        if (sw && sh && (sw > MAX_STORE_SIDE || sh > MAX_STORE_SIDE)) {
          const scale = sw > sh ? MAX_STORE_SIDE / sw : MAX_STORE_SIDE / sh
          const tw = Math.round(sw * scale)
          const th = Math.round(sh * scale)
          const canvas = document.createElement('canvas')
          canvas.width = tw
          canvas.height = th
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, tw, th)
            const m = /^data:([^;]+);/.exec(dataURL)
            const origMime = m ? m[1] : 'image/png'
            const targetMime = origMime.includes('jpeg') || origMime.includes('jpg') ? 'image/jpeg' : 'image/png'
            fileDataURL = canvas.toDataURL(targetMime, 0.92)
          }
        }
      } catch (e) {
        fileDataURL = dataURL
      }

      // 生成唯一的文件 ID 和元素 ID
      const fileId = 'markov-variation-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      const elementId = 'img-variation-' + Date.now() + '-' + Math.random().toString(36).slice(2)
      const mimeMatch = /^data:([^;]+);/.exec(dataURL)
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'
      const now = Date.now()

      // 计算位置：原图像右侧 24px
      const x = (imageElement.x || 0) + (imageElement.width || 0) + 24
      const y = imageElement.y || 0

      // 先添加文件到 files 映射
      const newFileData = { 
        id: fileId, 
        dataURL: fileDataURL, 
        mimeType, 
        created: now 
      }
      
      // 创建新元素
      const newEl = {
        id: elementId,
        type: 'image',
        x,
        y,
        width: w,
        height: h,
        angle: 0,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 0,
        strokeStyle: 'solid',
        roughness: 0,
        roundness: null,
        opacity: 100,
        groupIds: [],
        frameId: null,
        boundElements: null,
        updated: now,
        link: null,
        locked: false,
        seed: Math.floor(Math.random() * 1e9),
        versionNonce: Math.floor(Math.random() * 1e9),
        isDeleted: false,
        // image-specific
        fileId,
        status: 'saved',
        scale: [1, 1],
        crop: null,
        // 添加版本控制字段确保状态一致性
        version: 1,
        customData: {
          type: 'markov-variation',
          sourceImageId: imageElement.id,
          generated: now
        }
      }

      // 使用更安全的分步更新策略，避免状态不一致
      try {
        // 第一步：添加文件到文件映射
        await new Promise((resolve) => {
          excalidrawAPI.addFiles?.([newFileData])
          // 确保文件添加完成
          setTimeout(resolve, 50)
        })
        
        // 第二步：添加元素到场景
        await new Promise((resolve) => {
          const currentElements = excalidrawAPI.getSceneElements()
          excalidrawAPI.updateScene({ 
            elements: [...currentElements, newEl],
            commitToHistory: true // 确保操作被记录到历史中，支持撤销
          })
          setTimeout(resolve, 50)
        })
        
        // 确保状态同步完成后再触发保存
        setTimeout(() => {
          const payload = {
            elements: excalidrawAPI.getSceneElements(),
            appState: excalidrawAPI.getAppState(),
            files: excalidrawAPI.getFiles?.() || {}
          }
          latestDataRef.current = payload
          scheduleSave(payload, { priority: 'high' }) // 高优先级保存
        }, 100)
        
      } catch (error) {
        console.error('MoRos 图像变体添加失败:', error)
        excalidrawAPI.setToast?.({ message: '图像变体添加失败：' + (error?.message || '状态同步错误') })
        return
      }
      excalidrawAPI.setToast?.({ message: '已插入图像变体' })
    } catch (err) {
      console.error('MoRos 图像变体生成失败:', err)
      excalidrawAPI.setToast?.({ message: '变体生成失败：' + (err?.message || '未知错误') })
    }
  }, [excalidrawAPI, scheduleSave])

  // 关闭菜单的通用函数
  const closeContextMenu = useCallback(() => {
    // 多重保险机制关闭右键菜单
    try {
      // 方法1: 查找并移除所有可能的右键菜单容器
      const allContextMenus = document.querySelectorAll('ul.context-menu, .context-menu-container, [class*="context-menu"], .markov-image-submenu')
      allContextMenus.forEach(menu => {
        try {
          menu.remove()
        } catch (e) {
          // 忽略错误，继续处理下一个 
        }
      })
    } catch (e) {
      console.warn('批量移除菜单失败:', e)
    }
    
    // 方法2: 触发 ESC 键事件来关闭菜单
    try {
      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      })
      document.dispatchEvent(escEvent)
    } catch (e) {
      console.warn('触发ESC事件失败:', e)
    }
    
    // 方法3: 清除焦点和选中状态
    try {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur()
      }
      // 清除选择
      if (window.getSelection) {
        window.getSelection().removeAllRanges()
      }
    } catch (e) {
      console.warn('清除焦点失败:', e)
    }
  }, [])

  // 插入：为 Excalidraw 右键菜单注入“使用 MoRos 创建图像”二级子菜单（仅文本元素）
  useEffect(() => {
    if (!excalidrawAPI) return

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          const menu = node.matches?.('ul.context-menu') ? node : node.querySelector?.('ul.context-menu')
          if (!menu) continue
          // 跳过我们自己的子菜单，避免递归注入导致死循环
          if (menu.classList?.contains('markov-image-submenu') || menu.closest?.('.markov-image-submenu')) continue

          // 检查选中的元素类型
          const appState = excalidrawAPI.getAppState()
          const selectedIds = appState?.selectedElementIds || {}
          const selected = excalidrawAPI.getSceneElements().filter(el => selectedIds[el.id])
          const textEls = selected.filter(el => el?.type === 'text')
          const imageEls = selected.filter(el => el?.type === 'image')
          
          // 需要至少有文本元素或图像元素，且图像数量不能超过3张
          if (textEls.length === 0 && imageEls.length === 0) continue
          if (imageEls.length > 3) continue
          
          // 如果只有多张图像（没有文本），不显示菜单
          if (textEls.length === 0 && imageEls.length > 1) continue

          // 避免重复注入
          if (menu.querySelector('[data-markov-create-image]')) continue

          const li = document.createElement('li')
          li.setAttribute('data-markov-create-image', '1')
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.className = 'context-menu-item'
          const label = document.createElement('div')
          label.className = 'context-menu-item__label'
          // 根据选择的元素类型显示不同的菜单文本
          if (textEls.length > 0 && imageEls.length > 0) {
            const textCount = ` (${textEls.length}个文本)`
            const imageCount = ` (${imageEls.length}张图像)`
            label.textContent = `使用 MoRos 创建图像${textCount}${imageCount}`
          } else if (textEls.length > 0 && imageEls.length === 0) {
            const textCount = textEls.length > 1 ? ` (${textEls.length}个文本)` : ''
            label.textContent = `使用 MoRos 创建图像${textCount}`
          } else if (textEls.length === 0 && imageEls.length === 1) {
            label.textContent = '使用 MoRos 创建图像变体'
          } else if (textEls.length === 0 && imageEls.length > 1) {
            label.textContent = `使用 MoRos 创建图像 (${imageEls.length}张图像)`
          }
          const kbd = document.createElement('kbd')
          kbd.className = 'context-menu-item__shortcut'
          kbd.textContent = ''
          btn.appendChild(label)
          btn.appendChild(kbd)
          li.appendChild(btn)
          
          // 创建子菜单（使用原生结构和样式）
          const submenu = document.createElement('ul')
          submenu.className = 'context-menu markov-image-submenu'
          
          // 根据选择的元素类型决定显示哪些选项
          if (textEls.length > 0) {

            // 有文本元素：显示图像生成选项

            const geminiLi = document.createElement('li')

            const geminiBtn = document.createElement('button')

            geminiBtn.type = 'button'

            geminiBtn.className = 'context-menu-item'

            geminiBtn.innerHTML = `

              <div class="context-menu-item__label">Gemini 2.5 Flash</div>

            `

            geminiBtn.addEventListener('click', async (e) => {

              e.preventDefault()

              e.stopPropagation()

              closeContextMenu()

              // 合并选中的文本内容

              const prompt = textEls.map(el => el.text || el.originalText || '').filter(text => text.trim()).join('\n')

              await generateAndInsertImage(prompt, 'gemini', imageEls)

            })

            geminiLi.appendChild(geminiBtn)

            

            const midjourneyLi = document.createElement('li')

            const midjourneyBtn = document.createElement('button')

            midjourneyBtn.type = 'button'

            midjourneyBtn.className = 'context-menu-item'

            midjourneyBtn.innerHTML = `

              <div class="context-menu-item__label">Midjourney Imagine</div>

            `

            midjourneyBtn.addEventListener('click', async (e) => {

              e.preventDefault()

              e.stopPropagation()

              closeContextMenu()

              const prompt = textEls.map(el => el.text || el.originalText || '').filter(text => text.trim()).join('\n')

              await generateAndInsertImage(prompt, 'midjourney', imageEls)

            })

            midjourneyLi.appendChild(midjourneyBtn)

            

            const gptLi = document.createElement('li')

            const gptBtn = document.createElement('button')

            gptBtn.type = 'button'

            gptBtn.className = 'context-menu-item'

            gptBtn.innerHTML = `

              <div class="context-menu-item__label">GPT-4O Image</div>

            `

            gptBtn.addEventListener('click', async (e) => {

              e.preventDefault()

              e.stopPropagation()

              closeContextMenu()

              // 合并选中的文本内容

              const prompt = textEls.map(el => el.text || el.originalText || '').filter(text => text.trim()).join('\n')

              await generateAndInsertImage(prompt, 'gpt-4o', imageEls)

            })

            gptLi.appendChild(gptBtn)

            

            submenu.appendChild(geminiLi)

            submenu.appendChild(midjourneyLi)

            submenu.appendChild(gptLi)

          } else if (imageEls.length === 1) {          } else if (imageEls.length === 1) {
            // 单个图像元素：显示变体生成选项
            const variationLi = document.createElement('li')
            const variationBtn = document.createElement('button')
            variationBtn.type = 'button'
            variationBtn.className = 'context-menu-item'
            variationBtn.innerHTML = `
              <div class="context-menu-item__label">GPT-4O 图像变体</div>
            `
            variationBtn.addEventListener('click', async (e) => {
              e.preventDefault()
              e.stopPropagation()
              closeContextMenu()
              await generateAndInsertImageVariation(imageEls[0])
            })
            variationLi.appendChild(variationBtn)
            
            submenu.appendChild(variationLi)
          } else if (imageEls.length > 1) {
            // 多个图像元素：显示多图像生成选项
            const multiImageLi = document.createElement('li')
            const multiImageBtn = document.createElement('button')
            multiImageBtn.type = 'button'
            multiImageBtn.className = 'context-menu-item'
            multiImageBtn.innerHTML = `
              <div class="context-menu-item__label">Gemini 多图像生成</div>
            `
            multiImageBtn.addEventListener('click', async (e) => {
              e.preventDefault()
              e.stopPropagation()
              closeContextMenu()
              // 为多图像情况提供默认提示词
              const prompt = '基于这些图像生成新的创意图像'
              await generateAndInsertImage(prompt, 'gemini', imageEls)
            })
            multiImageLi.appendChild(multiImageBtn)
            
            submenu.appendChild(multiImageLi)
          }
          
          // 将子菜单挂到 Excalidraw 容器下，复用原生菜单的变量和阴影
          const hostContainer = menu.closest('.excalidraw') || document.body
          hostContainer.appendChild(submenu)

          const positionSubmenu = () => {
            const rect = btn.getBoundingClientRect()
            let left = rect.right + 2
            let top = rect.top
            if (hostContainer !== document.body) {
              const hostRect = hostContainer.getBoundingClientRect()
              left = rect.right - hostRect.left + 2
              top = rect.top - hostRect.top
            }
            submenu.style.left = `${left}px`
            submenu.style.top = `${top}px`
          }

          const showSubmenu = () => {
            submenu.style.removeProperty('min-width')
            submenu.style.removeProperty('width')
            submenu.classList.add('is-visible')
            positionSubmenu()
          }

          const hideSubmenu = () => {
            submenu.classList.remove('is-visible')
          }

          // 悬停事件
          btn.addEventListener('mouseenter', showSubmenu)
          btn.addEventListener('mouseleave', () => {
            setTimeout(() => {
              if (!submenu.matches(':hover') && !btn.matches(':hover')) {
                hideSubmenu()
              }
            }, 100)
          })

          // 子菜单悬停事件
          submenu.addEventListener('mouseenter', () => {
            submenu.classList.add('is-visible')
            submenu.style.removeProperty('min-width')
            submenu.style.removeProperty('width')
            positionSubmenu()
          })
          submenu.addEventListener('mouseleave', hideSubmenu)

          // 放在"粘贴"下面形成单独一栏
          const pasteLi = menu.querySelector('li[data-testid="paste"]')
          if (pasteLi) {
            const next = pasteLi.nextElementSibling
            if (next && next.tagName === 'HR') {
              // 在粘贴与其后的分隔线之间
              menu.insertBefore(li, next)
            } else {
              // 无分隔线：紧跟粘贴，并补一条分隔线
              pasteLi.after(li)
              const hr = document.createElement('hr')
              hr.className = 'context-menu-item-separator'
              hr.setAttribute('data-markov-sep', 'after')
              li.after(hr)
            }
          } else {
            // 如果找不到粘贴按钮，尝试插入到删除前
            const dangerousItem = menu.querySelector('button.context-menu-item.dangerous')
            if (dangerousItem && dangerousItem.parentElement) {
              menu.insertBefore(li, dangerousItem.parentElement)
            } else {
              menu.appendChild(li)
            }
          }
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [excalidrawAPI, generateAndInsertImage, closeContextMenu])


  if (!currentFile) return null

  return (
    <div
      className={`enhanced-whiteboard ${dragOver ? 'drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {loading ? (
        <div className="wb-loading">{t('whiteboard.loading')}</div>
      ) : (
        <ErrorBoundary key={errorBoundaryKey} onErrorRetry={handleErrorRetry}>
          <Excalidraw
            key={`${currentFile.path}-${errorBoundaryKey}`}
            initialData={initialData}
            onChange={onChange}
            langCode={langCode}
            theme={theme}
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
          >
            <MainMenu>
              <MainMenu.DefaultItems.LoadScene />
              <MainMenu.DefaultItems.SaveToActiveFile />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
          </Excalidraw>
        </ErrorBoundary>
      )}

      {saving && <div className="wb-saving">保存中…</div>}

      {/* 覆盖层：渲染 Markdown 预览（随 zoom/scroll 联动）*/}
      <div className="excalidraw-markdown-overlay">
        {overlayElements.map((el) => (
          <MarkdownCardOverlay key={el.id} element={el} appState={overlayAppState} onFileClick={onFileClick} excalidrawAPI={excalidrawAPI} />
        ))}
      </div>

      {dragOver && (
        <div className="drag-indicator">
          <div className="drag-indicator-content">
            {/* 现代化的图标设计 */}
            <div className="drag-icon-container">
              <div className="drag-icon-bg"></div>
              <div className="drag-icon">📄</div>
            </div>
            
            {/* 现代化的文本设计 */}
            <div className="drag-text">
              <h3>放置Markdown文件</h3>
              <p>丢入Excalidraw的.md文件会被转换成卡片</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 覆盖层：根据元素与 appState 计算屏幕坐标
const MarkdownCardOverlay = React.memo(({ element, appState, onFileClick, excalidrawAPI }) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [isContentHovered, setIsContentHovered] = useState(false)
  const hoverTimeoutRef = useRef(null)
  const contentRef = useRef(null)
  
  const { x, y, width, height } = element
  const { zoom, scrollX, scrollY } = appState
  const screenX = (x + scrollX) * zoom.value
  const screenY = (y + scrollY) * zoom.value
  const screenWidth = width * zoom.value
  const screenHeight = height * zoom.value

  // 使用useMemo缓存样式计算
  const styles = useMemo(() => {
    const baseFontSize = 13
    const scaledFontSize = Math.max(8, Math.min(20, baseFontSize * zoom.value))
    
    return {
      scaledFontSize,
      padding: Math.max(6, 12 * zoom.value),
      borderRadius: Math.max(4, 8 * zoom.value),
      borderWidth: Math.max(0.5, 1 * zoom.value),
      headerPadding: `${Math.max(6, 12 * zoom.value)}px`,
      headerBorderWidth: `${Math.max(0.5, 1 * zoom.value)}px`,
      contentPadding: `${Math.max(6, 12 * zoom.value)}px`,
      margins: {
        h1: `${Math.max(4, 8 * zoom.value)}px 0 ${Math.max(2, 4 * zoom.value)}px 0`,
        h2: `${Math.max(3, 6 * zoom.value)}px 0 ${Math.max(1.5, 3 * zoom.value)}px 0`,
        h3: `${Math.max(2.5, 5 * zoom.value)}px 0 ${Math.max(1, 2 * zoom.value)}px 0`,
        h4: `${Math.max(2, 4 * zoom.value)}px 0 ${Math.max(1, 2 * zoom.value)}px 0`,
        h5: `${Math.max(1.5, 3 * zoom.value)}px 0 ${Math.max(0.5, 1 * zoom.value)}px 0`,
        h6: `${Math.max(1.5, 3 * zoom.value)}px 0 ${Math.max(0.5, 1 * zoom.value)}px 0`,
        p: `${Math.max(2, 4 * zoom.value)}px 0`,
        ul: `${Math.max(2, 4 * zoom.value)}px 0`,
        ol: `${Math.max(2, 4 * zoom.value)}px 0`,
        li: `${Math.max(0.5, 1 * zoom.value)}px 0`,
        blockquote: `${Math.max(2, 4 * zoom.value)}px 0`,
        pre: `${Math.max(2, 4 * zoom.value)}px 0`,
        table: `${Math.max(2, 4 * zoom.value)}px 0`,
        hr: `${Math.max(4, 8 * zoom.value)}px 0`
      },
      fontSizes: {
        h1: `${Math.max(14, scaledFontSize + 3)}px`,
        h2: `${Math.max(13, scaledFontSize + 2)}px`,
        h3: `${Math.max(12, scaledFontSize + 1)}px`,
        h4: `${Math.max(11, scaledFontSize)}px`,
        h5: `${Math.max(10, scaledFontSize - 1)}px`,
        h6: `${Math.max(9, scaledFontSize - 2)}px`,
        p: `${scaledFontSize}px`,
        ul: `${scaledFontSize}px`,
        ol: `${scaledFontSize}px`,
        li: `${scaledFontSize}px`,
        blockquote: `${scaledFontSize}px`,
        codeInline: `${Math.max(10, scaledFontSize - 2)}px`,
        codeBlock: `${Math.max(9, scaledFontSize - 3)}px`,
        table: `${Math.max(10, scaledFontSize - 2)}px`,
        th: `${Math.max(10, scaledFontSize - 2)}px`,
        td: `${Math.max(10, scaledFontSize - 2)}px`,
        strong: `${scaledFontSize}px`,
        em: `${scaledFontSize}px`,
        a: `${scaledFontSize}px`
      },
      paddingSizes: {
        codeInline: `${Math.max(0.5, 1 * zoom.value)}px ${Math.max(2, 4 * zoom.value)}px`,
        codeBlock: `${Math.max(3, 6 * zoom.value)}px`,
        ul: `${Math.max(8, 16 * zoom.value)}px`,
        ol: `${Math.max(8, 16 * zoom.value)}px`,
        blockquote: `${Math.max(4, 8 * zoom.value)}px`,
        th: `${Math.max(2, 4 * zoom.value)}px ${Math.max(3, 6 * zoom.value)}px`,
        td: `${Math.max(2, 4 * zoom.value)}px ${Math.max(3, 6 * zoom.value)}px`
      },
      borderSizes: {
        blockquote: `${Math.max(1.5, 3 * zoom.value)}px`,
        table: `${Math.max(0.5, 1 * zoom.value)}px`,
        hr: `${Math.max(0.5, 1 * zoom.value)}px`
      },
      borderRadiusSizes: {
        codeInline: `${Math.max(1.5, 3 * zoom.value)}px`,
        codeBlock: `${Math.max(2, 4 * zoom.value)}px`
      }
    }
  }, [zoom.value])

  useEffect(() => {
    const load = async () => {
      try {
        const fileContent = await filesApi.readFile(element.customData?.filePath)
        setContent(fileContent || '')
      } catch (e) {
        setContent('加载失败')
      } finally {
        setLoading(false)
      }
    }
    if (element.customData?.filePath) load()
  }, [element.customData?.filePath])

  const title = useMemo(() => {
    if (!content) return element.customData?.fileName || '未命名'
    const first = content.split('\n')[0]
    if (first.startsWith('#')) return first.replace(/^#+\s+/, '').trim() || (element.customData?.fileName || '未命名')
    return element.customData?.fileName || '未命名'
  }, [content, element.customData?.fileName])

  // 完整显示内容，不截断
  const displayContent = content || '暂无内容'

  // 覆盖层与底层锚点完全重叠 - 精确匹配
  const finalWidth = screenWidth
  const finalHeight = screenHeight

  // 处理鼠标进入内容区域
  const handleContentMouseEnter = useCallback(() => {
    // 清除任何待处理的隐藏超时
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsContentHovered(true)
    setIsHovered(true)
  }, [])

  // 处理鼠标离开内容区域
  const handleContentMouseLeave = useCallback(() => {
    // 延迟隐藏，避免快速移动导致闪烁
    hoverTimeoutRef.current = setTimeout(() => {
      setIsContentHovered(false)
      setIsHovered(false)
    }, 100)
  }, [])

  // 清理超时
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  // 使用useMemo缓存Markdown渲染结果
  const markdownContent = useMemo(() => {
    if (loading || !displayContent) return null
    
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={{ 
            margin: styles.margins.h1, 
            fontSize: styles.fontSizes.h1, 
            fontWeight: '600' 
          }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ 
            margin: styles.margins.h2, 
            fontSize: styles.fontSizes.h2, 
            fontWeight: '600' 
          }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ 
            margin: styles.margins.h3, 
            fontSize: styles.fontSizes.h3, 
            fontWeight: '600' 
          }}>{children}</h3>,
          h4: ({ children }) => <h4 style={{ 
            margin: styles.margins.h4, 
            fontSize: styles.fontSizes.h4, 
            fontWeight: '600' 
          }}>{children}</h4>,
          h5: ({ children }) => <h5 style={{ 
            margin: styles.margins.h5, 
            fontSize: styles.fontSizes.h5, 
            fontWeight: '600' 
          }}>{children}</h5>,
          h6: ({ children }) => <h6 style={{ 
            margin: styles.margins.h6, 
            fontSize: styles.fontSizes.h6, 
            fontWeight: '600' 
          }}>{children}</h6>,
          p: ({ children }) => <p style={{ 
            margin: styles.margins.p, 
            lineHeight: '1.5', 
            fontSize: styles.fontSizes.p 
          }}>{children}</p>,
          ul: ({ children }) => <ul style={{ 
            paddingLeft: styles.paddingSizes.ul, 
            margin: styles.margins.ul, 
            fontSize: styles.fontSizes.ul 
          }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ 
            paddingLeft: styles.paddingSizes.ol, 
            margin: styles.margins.ol, 
            fontSize: styles.fontSizes.ol 
          }}>{children}</ol>,
          li: ({ children }) => <li style={{ 
            margin: styles.margins.li, 
            fontSize: styles.fontSizes.li 
          }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{ 
              borderLeft: `${styles.borderSizes.blockquote} solid #ddd`, 
              paddingLeft: styles.paddingSizes.blockquote, 
              margin: styles.margins.blockquote, 
              fontStyle: 'italic',
              color: 'var(--text-secondary)',
              fontSize: styles.fontSizes.blockquote
            }}>{children}</blockquote>
          ),
          code: ({ inline, children, className }) => 
            inline ? (
              <code style={{ 
                background: 'rgba(0,0,0,0.08)', 
                padding: styles.paddingSizes.codeInline, 
                borderRadius: styles.borderRadiusSizes.codeInline,
                fontSize: styles.fontSizes.codeInline,
                fontFamily: 'Monaco, "Courier New", monospace'
              }}>{children}</code>
            ) : (
              <div style={{ 
                background: 'rgba(0,0,0,0.08)', 
                padding: styles.paddingSizes.codeBlock, 
                borderRadius: styles.borderRadiusSizes.codeBlock, 
                overflow: 'auto',
                fontSize: styles.fontSizes.codeBlock,
                fontFamily: 'Monaco, "Courier New", monospace',
                margin: styles.margins.pre,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}><code>{children}</code></div>
            ),
          pre: ({ children }) => (
            <div style={{ 
              background: 'rgba(0,0,0,0.08)', 
              padding: styles.paddingSizes.codeBlock, 
              borderRadius: styles.borderRadiusSizes.codeBlock, 
              overflow: 'auto',
              fontSize: styles.fontSizes.codeBlock,
              fontFamily: 'Monaco, "Courier New", monospace',
              margin: styles.margins.pre,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>{children}</div>
          ),
          strong: ({ children }) => <strong style={{ 
            fontWeight: '600', 
            fontSize: styles.fontSizes.strong 
          }}>{children}</strong>,
          em: ({ children }) => <em style={{ 
            fontStyle: 'italic', 
            fontSize: styles.fontSizes.em 
          }}>{children}</em>,
          a: ({ children, href }) => (
            <a href={href} style={{ 
              color: 'var(--accent-color)', 
              textDecoration: 'none', 
              fontSize: styles.fontSizes.a 
            }}>{children}</a>
          ),
          hr: () => <hr style={{ 
            border: 'none', 
            borderTop: `${styles.borderSizes.hr} solid #ddd`, 
            margin: styles.margins.hr 
          }} />,
          table: ({ children }) => (
            <table style={{ 
              borderCollapse: 'collapse', 
              width: '100%', 
              fontSize: styles.fontSizes.table, 
              margin: styles.margins.table 
            }}>{children}</table>
          ),
          th: ({ children }) => (
            <th style={{ 
              border: `${styles.borderSizes.table} solid #ddd`, 
              padding: styles.paddingSizes.th, 
              background: 'rgba(0,0,0,0.05)', 
              fontWeight: '600', 
              fontSize: styles.fontSizes.th 
            }}>{children}</th>
          ),
          td: ({ children }) => (
            <td style={{ 
              border: `${styles.borderSizes.table} solid #ddd`, 
              padding: styles.paddingSizes.td, 
              fontSize: styles.fontSizes.td 
            }}>{children}</td>
          ),
        }}
      >
        {displayContent}
      </ReactMarkdown>
    )
  }, [loading, displayContent, styles])

  return (
    <div
      className={`markdown-card-overlay ${isContentHovered ? 'content-hover hover-active' : ''}`}
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: finalWidth,
        height: finalHeight,
        fontSize: `${styles.scaledFontSize}px`,
        borderRadius: `${styles.borderRadius}px`,
        borderWidth: `${styles.borderWidth}px`
      }}
      // 卡片根元素不拦截任何事件，让底层元素可拖拽
    >
      <div 
        className="overlay-header"
        style={{
          padding: styles.headerPadding,
          borderBottomWidth: styles.headerBorderWidth,
          fontSize: `${styles.scaledFontSize}px`
        }}
      >
        <span className="overlay-title" title={title}>{title}</span>
      </div>
      <div 
        ref={contentRef}
        className="overlay-content" 
        style={{
          padding: styles.contentPadding
        }}
        onMouseEnter={handleContentMouseEnter}
        onMouseLeave={handleContentMouseLeave}
        onWheel={(e) => {
          // 确保滚轮事件不会被 Excalidraw 拦截
          e.stopPropagation()
        }}
        onMouseDown={(e) => {
          // 阻止鼠标事件冒泡
          e.stopPropagation()
        }}
        onPointerDown={(e) => {
          // 阻止指针事件冒泡
          e.stopPropagation()
        }}
      >
        {loading ? (
          <div className="overlay-loading" style={{ pointerEvents: 'none' }}>载入中...</div>
        ) : (
          <div className="overlay-markdown">
            {markdownContent}
          </div>
        )}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // 简化比较函数：只检查真正重要的变化
  // 移动和缩放应该总是允许重新渲染，确保实时同步
  
  // 检查最基本的属性（文件相关）
  const idChanged = prevProps.element.id !== nextProps.element.id
  const filePathChanged = prevProps.element.customData?.filePath !== nextProps.element.customData?.filePath
  const fileNameChanged = prevProps.element.customData?.fileName !== nextProps.element.customData?.fileName
  
  // 检查函数引用变化
  const onFileClickChanged = prevProps.onFileClick !== nextProps.onFileClick
  const excalidrawAPIChanged = prevProps.excalidrawAPI !== nextProps.excalidrawAPI
  
  // 如果是文件内容或函数引用变化，必须重新渲染
  if (idChanged || filePathChanged || fileNameChanged || onFileClickChanged || excalidrawAPIChanged) {
    return false
  }
  
  // 其他情况（位置、缩放等）都允许重新渲染，确保实时同步
  // 样式和Markdown渲染已经被useMemo缓存，所以性能开销很小
  return false
})

export default EnhancedWhiteboard
