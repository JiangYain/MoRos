import React, { useCallback, useEffect, useState, useRef } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import { filesApi } from '../utils/api'
import './Whiteboard.css'

// 确保Excalidraw样式被加载
import '@excalidraw/excalidraw/index.css'

// 错误边界组件
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Whiteboard错误:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="wb-error">
          <h3>白板加载失败</h3>
          <p>请刷新页面重试</p>
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      )
    }
    return this.props.children
  }
}

// 识别 .excalidraw 文件
export const isWhiteboardFile = (filePath) => {
  if (!filePath) return false
  return filePath.toLowerCase().endsWith('.excalidraw')
}

// 语言图标组件（更贴合Excalidraw风格的地球+对话气泡）
const LanguageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="M3 11h16" />
    <path d="M11 3c2 2.5 2 13 0 16" />
    <path d="M7.5 20.5L11 19l3.5 1.5" />
  </svg>
)

// 语言选择器：使用原生 DropdownMenuItem 的样式与交互
const LanguageSelector = ({ langCode, setLangCode }) => {
  const availableLanguages = [
    { code: 'zh-CN', label: '简体中文' },
    { code: 'en', label: 'English' },
    { code: 'ja-JP', label: '日本語' },
    { code: 'ko-KR', label: '한국어' },
    { code: 'es-ES', label: 'Español' },
    { code: 'fr-FR', label: 'Français' }
  ]

  const currentIndex = Math.max(0, availableLanguages.findIndex((l) => l.code === langCode))
  const currentLang = availableLanguages[currentIndex] || availableLanguages[0]

  const handleSelect = (event) => {
    // 不关闭菜单，保持与原生切换主题一致的行为
    event.preventDefault()
    const next = availableLanguages[(currentIndex + 1) % availableLanguages.length]
    setLangCode(next.code)
  }

  return (
    <MainMenu.Item
      onSelect={handleSelect}
      icon={<LanguageIcon />}
      shortcut={currentLang.label}
      className="wb-lang-item"
      aria-label="语言"
    >
      语言
    </MainMenu.Item>
  )
}

// 规范化Excalidraw数据，确保必需的字段存在
const normalizeExcalidrawData = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      type: 'excalidraw',
      version: 2,
      elements: [],
      appState: {
        collaborators: [],
        gridSize: null,
        viewBackgroundColor: '#ffffff'
      },
      files: {}
    }
  }

  return {
    type: data.type || 'excalidraw',
    version: data.version || 2,
    elements: Array.isArray(data.elements) ? data.elements : [],
    appState: {
      ...data.appState,
      collaborators: Array.isArray(data.appState?.collaborators) ? data.appState.collaborators : [],
      gridSize: data.appState?.gridSize || null,
      viewBackgroundColor: data.appState?.viewBackgroundColor || '#ffffff'
    },
    files: data.files || {}
  }
}

function Whiteboard({ currentFile, onFileSave, theme, language }) {
  const [initialData, setInitialData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [langCode, setLangCode] = useState(language || 'zh-CN')
  // 保存相关引用：定时器、上次已保存内容、待保存内容、最新数据对象
  const saveTimerRef = useRef(null)
  const lastSavedSerializedRef = useRef('')
  const pendingSerializedRef = useRef('')
  const latestDataRef = useRef(null)

  // 仅用于持久化的序列化：裁剪未引用的图片文件，避免无意义超大 JSON
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

  // 同步外部语言设置
  useEffect(() => {
    if (language) {
      setLangCode(language)
    }
  }, [language])

  // 加载 .excalidraw JSON
  useEffect(() => {
    const load = async () => {
      if (!currentFile?.path) return
      setLoading(true)
      try {
        const contentText = await filesApi.readFile(currentFile.path)
        let parsed
        try {
          parsed = JSON.parse(contentText || '{}')
        } catch (_) {
          parsed = {}
        }
        const normalized = normalizeExcalidrawData(parsed)
        setInitialData(normalized)
        // 记录当前文件初始快照，避免无意义保存
        lastSavedSerializedRef.current = JSON.stringify(normalized, null, 2)
        // 切换文件时清空待保存队列，避免污染其他白板
        pendingSerializedRef.current = ''
      } catch (e) {
        const normalized = normalizeExcalidrawData(null)
        setInitialData(normalized)
        lastSavedSerializedRef.current = JSON.stringify(normalized, null, 2)
        pendingSerializedRef.current = ''
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentFile?.path])

  // 自动保存（去抖）：避免在 onChange 高频触发时反复 JSON.stringify（包含大图时极慢）
  const scheduleSave = useCallback((data) => {
    if (!currentFile?.path) return
    latestDataRef.current = data

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    // 空闲 500ms 后保存
    saveTimerRef.current = setTimeout(async () => {
      try {
        const toSaveObj = latestDataRef.current
        if (!toSaveObj) return
        const serialized = serializeForSave(toSaveObj.elements, toSaveObj.appState, toSaveObj.files)
        if (!serialized || serialized === lastSavedSerializedRef.current) return
        pendingSerializedRef.current = serialized
        setSaving(true)
        await filesApi.saveFile(currentFile.path, serialized)
        lastSavedSerializedRef.current = serialized
        onFileSave?.(currentFile, serialized)
      } catch (e) {
        console.error('保存白板失败:', e)
      } finally {
        setSaving(false)
      }
    }, 500)
  }, [currentFile?.path, onFileSave, serializeForSave])

  // 在文件切换或组件卸载时，若有待保存内容，则做一次最后保存
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      const pending = pendingSerializedRef.current
      if (pending && pending !== lastSavedSerializedRef.current && currentFile?.path) {
        ;(async () => {
          try {
            setSaving(true)
            await filesApi.saveFile(currentFile.path, pending)
            lastSavedSerializedRef.current = pending
            onFileSave?.(currentFile, pending)
          } catch (e) {
            console.error('保存白板失败(卸载前):', e)
          } finally {
            setSaving(false)
          }
        })()
      }
    }
  }, [currentFile?.path, onFileSave])

  // 变化监听
  const onChange = useCallback((elements, appState, files) => {
    const payload = { type: 'excalidraw', version: 2, elements, appState, files }
    scheduleSave(payload)
  }, [scheduleSave])

  if (!currentFile) return null

  return (
    <div className="whiteboard-container">
      {/* 顶部信息栏 */}
      <div className="whiteboard-toolbar">
        <div className="wb-filename">{currentFile.name}</div>
        {saving && <div className="wb-saving">保存中…</div>}
      </div>
      <div className="whiteboard-canvas">
        {!loading && initialData && (
          <ErrorBoundary>
            <Excalidraw
              key={currentFile.path}
              initialData={initialData}
              onChange={onChange}
              langCode={langCode}
              theme={theme}
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
                <LanguageSelector langCode={langCode} setLangCode={setLangCode} />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
              </MainMenu>
            </Excalidraw>
          </ErrorBoundary>
        )}
        {loading && (
          <div className="wb-loading">加载中...</div>
        )}
      </div>
    </div>
  )
}

export default Whiteboard
