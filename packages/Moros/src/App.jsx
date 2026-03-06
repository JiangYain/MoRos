import React, { useState, useEffect, useRef, useCallback } from 'react'
import { I18nProvider } from './utils/i18n'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import RightPanel from './components/RightPanel'
import { isWhiteboardFile } from './components/Whiteboard'
import { settingsApi } from './utils/api'
import { isMorosChatPath, markChatFileOpened } from './utils/chatFiles'
import './App.css'
import SplitCursorOverlay from './components/SplitCursorOverlay'
import StyleSidebar from './components/StyleSidebar'
import SettingsModal from './components/SettingsModal'
// 移除复杂的主题管理，使用统一主题

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('moros-theme-mode') || 'system')
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSection, setActiveSection] = useState('')
  const [currentFile, setCurrentFile] = useState(null)
  const [currentContent, setCurrentContent] = useState('')
  const [skillPaths, setSkillPaths] = useState([])
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('')
  const [chatArtifactsVisible, setChatArtifactsVisible] = useState(false)
  const [chatArtifactsCloseRequestSeq, setChatArtifactsCloseRequestSeq] = useState(0)
  const [language, setLanguage] = useState('zh-CN')
  const [avatar, setAvatar] = useState(null)
  const [username, setUsername] = useState('MoRos')
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [viewMode, setViewMode] = useState('split') // 'edit' | 'preview' | 'split'
  const [hoverPreview, setHoverPreview] = useState(true)
  const [showFileExtensions, setShowFileExtensions] = useState(false)
  const [dynamicCursorGuide, setDynamicCursorGuide] = useState(true)
  const sidebarRef = useRef(null)
  const sidebarAutoCollapsedByArtifactsRef = useRef(false)
  // 自定义CSS状态
  const [customCSS, setCustomCSS] = useState(null)
  // 样式面板状态（固定面板，非弹出）
  const [stylePanelOpen, setStylePanelOpen] = useState(false)
  // 可拖拽宽度（持久化）
  const [sidebarWidth, setSidebarWidth] = useState(parseInt(localStorage.getItem('markov-sidebar-width') || '280', 10))
  const [rightpanelWidth, setRightpanelWidth] = useState(parseInt(localStorage.getItem('markov-rightpanel-width') || '400', 10))
  const [stylePanelWidth, setStylePanelWidth] = useState(parseInt(localStorage.getItem('markov-stylepanel-width') || '420', 10))
  const [dragging, setDragging] = useState(null) // 'left' | 'right' | 'style' | null
  const [modeSwitching, setModeSwitching] = useState(false) // 模式切换动画状态
  // 预览/分屏的右侧宽度比例（相对于可用区域：窗口宽度-侧边栏宽度）
  const [previewRatio, setPreviewRatio] = useState(() => {
    const s = parseFloat(localStorage.getItem('markov-preview-ratio') || '0.3')
    return isFinite(s) && s > 0 && s < 1 ? s : 0.3 // 预览默认 7:3 (右侧占0.3)
  })
  const [splitRatio, setSplitRatio] = useState(() => {
    const s = parseFloat(localStorage.getItem('markov-split-ratio') || '0.5')
    return isFinite(s) && s > 0 && s < 1 ? s : 0.5 // 分屏默认 5:5
  })
  const isCurrentFileWhiteboard = currentFile?.path && isWhiteboardFile(currentFile.path)
  const isCurrentFileChat = currentFile?.path && currentFile.path.toLowerCase().endsWith('.moros')
  const isSpecialFile = isCurrentFileWhiteboard || isCurrentFileChat
  const shouldShowRightPanel = !isSpecialFile && Boolean(currentFile) && viewMode === 'split'

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const savedThemeMode = localStorage.getItem('moros-theme-mode') || 'system'
    setThemeMode(savedThemeMode)
    if (savedThemeMode === 'dark') {
      setDarkMode(true)
    } else if (savedThemeMode === 'light') {
      setDarkMode(false)
    } else {
      setDarkMode(prefersDark)
    }
    
    // 从localStorage加载设置
    const savedLanguage = localStorage.getItem('markov-language')
    const savedAvatar = localStorage.getItem('markov-avatar')
    const savedName = localStorage.getItem('markov-username')
    const savedHoverPreview = localStorage.getItem('markov-hover-preview')
    const savedShowFileExtensions = localStorage.getItem('markov-show-file-extensions')
    const savedDynamicCursorGuide = localStorage.getItem('markov-dynamic-cursor-guide')
    const savedCustomCSS = localStorage.getItem('markov-custom-theme')
    
    if (savedLanguage) {
      setLanguage(savedLanguage)
    }
    if (savedAvatar) {
      setAvatar(savedAvatar)
    }
    if (savedName) {
      setUsername(savedName)
    }
    if (savedHoverPreview !== null) {
      setHoverPreview(savedHoverPreview === 'true')
    }
    if (savedShowFileExtensions !== null) {
      setShowFileExtensions(savedShowFileExtensions === 'true')
    }
    if (savedDynamicCursorGuide !== null) {
      setDynamicCursorGuide(savedDynamicCursorGuide !== 'false')
    } else {
      setDynamicCursorGuide(true)
    }
    if (savedCustomCSS) {
      setCustomCSS(savedCustomCSS)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const loadGlobalSystemPrompt = async () => {
      try {
        const { systemPrompt } = await settingsApi.getSystemPrompt()
        if (!disposed) {
          setGlobalSystemPrompt(systemPrompt)
        }
      } catch (error) {
        console.warn('读取全局 System Prompt 失败:', error)
      }
    }
    void loadGlobalSystemPrompt()
    return () => {
      disposed = true
    }
  }, [])

  // 跟随系统主题：仅当模式为 system 时生效
  useEffect(() => {
    if (themeMode !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (evt) => setDarkMode(typeof evt?.matches === 'boolean' ? evt.matches : media.matches)
    apply(media)

    if (media.addEventListener) {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    media.addListener(apply)
    return () => media.removeListener(apply)
  }, [themeMode])

  const handleThemeModeChange = useCallback((mode) => {
    const nextMode = mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system'
    setThemeMode(nextMode)
    try { localStorage.setItem('moros-theme-mode', nextMode) } catch {}
    if (nextMode === 'system') {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
      return
    }
    setDarkMode(nextMode === 'dark')
  }, [])

  const handleToggleDarkMode = useCallback(() => {
    const nextDark = !darkMode
    setDarkMode(nextDark)
    const nextMode = nextDark ? 'dark' : 'light'
    setThemeMode(nextMode)
    try { localStorage.setItem('moros-theme-mode', nextMode) } catch {}
  }, [darkMode])

  // 持久化宽度
  useEffect(() => { try { localStorage.setItem('markov-sidebar-width', String(sidebarWidth)) } catch {} }, [sidebarWidth])
  useEffect(() => { try { localStorage.setItem('markov-rightpanel-width', String(rightpanelWidth)) } catch {} }, [rightpanelWidth])
  useEffect(() => { try { localStorage.setItem('markov-stylepanel-width', String(stylePanelWidth)) } catch {} }, [stylePanelWidth])
  useEffect(() => { try { localStorage.setItem('markov-preview-ratio', String(previewRatio)) } catch {} }, [previewRatio])
  useEffect(() => { try { localStorage.setItem('markov-split-ratio', String(splitRatio)) } catch {} }, [splitRatio])

  // 视图切换时的宽度策略 + 动效 + 自动关闭样式面板
  useEffect(() => {
    // 触发模式切换动画
    setModeSwitching(true)
    const timer = setTimeout(() => setModeSwitching(false), 600) // 缩短到与动画时长一致
    
    // 当切换到预览模式时，自动关闭样式配置界面
    if (viewMode === 'preview' && stylePanelOpen) {
      setStylePanelOpen(false)
    }
    
    const appWidth = window.innerWidth
    const left = sidebarCollapsed ? 48 : sidebarWidth
    const reservedStyle = stylePanelOpen ? (stylePanelWidth + 6) : 0
    const available = Math.max(200, appWidth - left - reservedStyle)
    const minRight = 240
    const minMain = 240
    
    // 使用延时确保动画能被触发
    setTimeout(() => {
      if (viewMode === 'split') {
        // 使用分屏记忆比例
        const desired = Math.max(minRight, Math.min(available - minMain, Math.floor(available * (isFinite(splitRatio) ? splitRatio : 0.5))))
        setRightpanelWidth(desired)
      } else if (viewMode === 'preview') {
        // 使用预览记忆比例（默认 0.3 = 7:3）
        const desired = Math.max(minRight, Math.min(available - minMain, Math.floor(available * (isFinite(previewRatio) ? previewRatio : 0.3))))
        setRightpanelWidth(desired)
      }
    }, 16) // 一帧后执行，确保DOM更新
    
    return () => clearTimeout(timer)
  }, [viewMode, sidebarCollapsed, sidebarWidth, previewRatio, splitRatio, stylePanelOpen, stylePanelWidth])

  // 只有在可见右侧预览栏时才允许显示样式面板
  useEffect(() => {
    if (stylePanelOpen && !shouldShowRightPanel) {
      setStylePanelOpen(false)
    }
  }, [stylePanelOpen, shouldShowRightPanel])

  useEffect(() => {
    // 应用主题
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    // 注意：代码主题现在通过统一主题文件管理，不需要动态注入
  }, [darkMode])

  const handleSaveGlobalSystemPrompt = useCallback(async (value) => {
    const normalized = String(value ?? '').replace(/\r\n/g, '\n')
    const { systemPrompt } = await settingsApi.saveSystemPrompt(normalized)
    setGlobalSystemPrompt(systemPrompt)
    return systemPrompt
  }, [])

  const handleGoHome = useCallback(() => {
    setCurrentFile(null)
    setCurrentContent('')
  }, [])

  useEffect(() => {
    if (isCurrentFileChat) return
    setChatArtifactsVisible(false)
    if (sidebarAutoCollapsedByArtifactsRef.current) {
      sidebarAutoCollapsedByArtifactsRef.current = false
      setSidebarCollapsed(false)
    }
  }, [isCurrentFileChat])

  useEffect(() => {
    if (!isCurrentFileChat || !chatArtifactsVisible) return
    if (!sidebarCollapsed) {
      sidebarAutoCollapsedByArtifactsRef.current = true
      setSidebarCollapsed(true)
    }
  }, [chatArtifactsVisible, isCurrentFileChat, sidebarCollapsed])

  useEffect(() => {
    if (chatArtifactsVisible) return
    if (sidebarAutoCollapsedByArtifactsRef.current && sidebarCollapsed) {
      sidebarAutoCollapsedByArtifactsRef.current = false
      setSidebarCollapsed(false)
    }
  }, [chatArtifactsVisible, sidebarCollapsed])

  const handleToggleSidebarCollapse = useCallback(() => {
    if (isCurrentFileChat && chatArtifactsVisible && sidebarCollapsed) {
      sidebarAutoCollapsedByArtifactsRef.current = false
      setChatArtifactsVisible(false)
      setChatArtifactsCloseRequestSeq((seq) => seq + 1)
      setSidebarCollapsed(false)
      return
    }
    sidebarAutoCollapsedByArtifactsRef.current = false
    setSidebarCollapsed((prev) => !prev)
  }, [isCurrentFileChat, chatArtifactsVisible, sidebarCollapsed])

  const handleFileClick = (file) => {
    setStylePanelOpen(false)
    if (isMorosChatPath(file?.path)) {
      markChatFileOpened(file.path)
    }
    if (currentFile && currentFile.path === file.path) {
      setCurrentFile(file)
      return
    }
    setCurrentFile(file)
    setCurrentContent('')
  }

  const handleFileClickAndRefresh = useCallback((file) => {
    handleFileClick(file)
    setTimeout(() => sidebarRef.current?.reloadFileTree?.(), 100)
  }, [currentFile])

  const handleFileSave = (file, content) => {
    // console.log('文件已保存:', file.name)
    // 这里可以添加保存后的处理逻辑，如刷新知识图谱
  }

  const handleNodeClick = (node) => {
    // 从知识图谱点击节点打开文件
    if (node.type === 'file') {
      setCurrentFile(node)
    }
  }

  const handleSectionClick = (sectionId) => {
    setActiveSection(sectionId)
    // 通知MainContent滚动到指定位置
    const element = document.getElementById(sectionId)
    if (element) {
      // 找到滚动容器
      const scrollContainer = element.closest('.content-wrapper')
      if (scrollContainer) {
        const offsetTop = element.offsetTop - scrollContainer.offsetTop - 80 // 80px偏移量
        scrollContainer.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        })
      }
    }
  }

  // 处理样式编辑
  const handleEditStyles = () => {
    setStylePanelOpen(true)
  }

  // 处理自定义CSS变化
  const handleCustomCSSChange = (css) => {
    setCustomCSS(css)
  }

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage)
    localStorage.setItem('markov-language', newLanguage)
  }

  const handleAvatarChange = (newAvatar) => {
    setAvatar(newAvatar)
    if (newAvatar) {
      localStorage.setItem('markov-avatar', newAvatar)
    } else {
      localStorage.removeItem('markov-avatar')
    }
  }

  const handleUsernameChange = (newName) => {
    // 允许空字符串，避免删除最后一个字符时被回填默认值
    setUsername(newName)
    if (newName && newName.trim().length > 0) {
      localStorage.setItem('markov-username', newName)
    } else {
      localStorage.removeItem('markov-username')
    }
  }

  const handleHoverPreviewChange = (enabled) => {
    setHoverPreview(enabled)
    localStorage.setItem('markov-hover-preview', enabled.toString())
  }

  const handleShowFileExtensionsChange = (enabled) => {
    setShowFileExtensions(enabled)
    localStorage.setItem('markov-show-file-extensions', enabled.toString())
  }

  const handleDynamicCursorGuideChange = (enabled) => {
    setDynamicCursorGuide(enabled)
    localStorage.setItem('markov-dynamic-cursor-guide', enabled.toString())
    try { window.updateOverlay && window.updateOverlay() } catch {}
  }

  // 预览面板的引用，用于分屏滚动同步
  const previewPaneRef = useRef(null)
  const editorRef = useRef(null)
  // 分屏光标连线覆盖层状态
  const [overlayState, setOverlayState] = useState({
    visible: false,
    editorRect: null,
    previewRect: null,
    yEditor: 0,
    yPreview: 0,
  })
  
  // 处理预览面板的滚动事件
  const handlePreviewScroll = useCallback((source) => {
    // 优先委托给 MainContent 内部的同步逻辑
    if (window.syncScroll) {
      window.syncScroll(source)
      return
    }
    // 兜底：直接在此处进行同步，避免因全局函数未注册导致失效
    if (source === 'preview') {
      const editor = editorRef.current
      const preview = previewPaneRef.current
      if (!editor || !preview) return
      const ratio = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight)
      editor.scrollTop = ratio * (editor.scrollHeight - editor.clientHeight)
    }
  }, [])

  // 全局拖拽监听，调整左右面板宽度
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragging) return
      if (dragging === 'left') {
        const minSidebar = 160
        const minMain = 240
        const reservedRight = shouldShowRightPanel ? (rightpanelWidth + 6) : 0
        const reservedStyle = stylePanelOpen ? (stylePanelWidth + 6) : 0
        const maxSidebar = Math.max(minSidebar, window.innerWidth - reservedRight - reservedStyle - minMain)
        const next = Math.min(Math.max(e.clientX, minSidebar), maxSidebar)
        setSidebarWidth(next)
        // 保持当前模式的比例不变：实时按比例调整右侧宽度
        if (shouldShowRightPanel) {
          const available = Math.max(200, window.innerWidth - next - reservedStyle)
          const minRight = 240
          const ratio = viewMode === 'split' ? splitRatio : previewRatio
          const desired = Math.max(minRight, Math.min(available - minMain, Math.floor(available * (isFinite(ratio) ? ratio : (viewMode === 'split' ? 0.5 : 0.3)))))
          setRightpanelWidth(desired)
        }
      } else if (dragging === 'right') {
        if (!shouldShowRightPanel) return
        const appRect = document.querySelector('.app')?.getBoundingClientRect()
        const fromRight = appRect ? (appRect.right - e.clientX) : (window.innerWidth - e.clientX)
        const reservedStyle = stylePanelOpen ? (stylePanelWidth + 6) : 0
        const available = Math.max(200, window.innerWidth - sidebarWidth - reservedStyle)
        const minRight = 240
        const minMain = 240
        const next = Math.min(Math.max(fromRight, minRight), available - minMain)
        setRightpanelWidth(next)
        // 更新对应模式下的记忆比例
        const r = Math.max(0.05, Math.min(0.95, next / Math.max(1, available)))
        if (viewMode === 'split') setSplitRatio(r); else setPreviewRatio(r)
      } else if (dragging === 'style') {
        const appRect = document.querySelector('.app')?.getBoundingClientRect()
        const fromRight = appRect ? (appRect.right - e.clientX) : (window.innerWidth - e.clientX)
        const minStyleWidth = 320
        const reservedRight = shouldShowRightPanel ? (rightpanelWidth + 6) : 0
        const layoutMax = window.innerWidth - sidebarWidth - reservedRight - 260
        const maxStyleWidth = Math.max(minStyleWidth, Math.min(600, layoutMax))
        const next = Math.min(Math.max(fromRight, minStyleWidth), maxStyleWidth)
        setStylePanelWidth(next)
      }
    }
    const handleMouseUp = () => setDragging(null)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, sidebarWidth, rightpanelWidth, splitRatio, previewRatio, viewMode, stylePanelOpen, stylePanelWidth, shouldShowRightPanel])

  return (
    <I18nProvider lang={language}>
    <div className={`app ${isSpecialFile ? 'whiteboard-mode' : ''} ${dragging ? 'resizing-col' : ''} ${modeSwitching ? 'mode-switching' : ''}`}
      style={{
        // 通过 CSS 变量将动态宽度传给子元素样式
        ['--sidebar-width']: sidebarWidth + 'px',
        ['--rightpanel-width']: rightpanelWidth + 'px',
      }}
    >
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        avatar={avatar}
        onAvatarChange={handleAvatarChange}
        language={language}
        onLanguageChange={handleLanguageChange}
        username={username}
        onUsernameChange={handleUsernameChange}
        darkMode={darkMode}
        themeMode={themeMode}
        onThemeModeChange={handleThemeModeChange}
        onToggleDarkMode={handleToggleDarkMode}
        hoverPreview={hoverPreview}
        onHoverPreviewChange={handleHoverPreviewChange}
        showFileExtensions={showFileExtensions}
        onShowFileExtensionsChange={handleShowFileExtensionsChange}
        dynamicCursorGuide={dynamicCursorGuide}
        onDynamicCursorGuideChange={handleDynamicCursorGuideChange}
        globalSystemPrompt={globalSystemPrompt}
        onSaveGlobalSystemPrompt={handleSaveGlobalSystemPrompt}
      />
      <Sidebar 
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleDarkMode}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        currentFile={currentFile}
        onFileClick={handleFileClick}
        language={language}
        onLanguageChange={handleLanguageChange}
        avatar={avatar}
        onAvatarChange={handleAvatarChange}
        username={username}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        hoverPreview={hoverPreview}
        showFileExtensions={showFileExtensions}
        onGoHome={handleGoHome}
        onSkillPathsChange={setSkillPaths}
        sidebarRef={sidebarRef}
      />

      {/* 左侧 resizer */}
      <div
        className={`resizer ${sidebarCollapsed ? 'hidden' : ''} ${dragging === 'left' ? 'active' : ''}`}
        onMouseDown={(e) => {
          if (sidebarCollapsed) return
          // 切换到分屏时允许拖拽；预览模式也允许调整左侧宽度
          setDragging('left')
        }}
      />
      
      <MainContent 
        currentFile={currentFile}
        darkMode={darkMode}
        language={language}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onSectionChange={setActiveSection}
        onFileSave={handleFileSave}
        onContentChange={setCurrentContent}
        onFileClick={handleFileClickAndRefresh}
        editorRef={editorRef}
        previewPaneRef={previewPaneRef}
        onPreviewScroll={handlePreviewScroll}
        onOverlayChange={(s) => setOverlayState(s)}
        avatar={avatar}
        username={username}
        skillPaths={skillPaths}
        globalSystemPrompt={globalSystemPrompt}
        onChatArtifactsVisibilityChange={setChatArtifactsVisible}
        artifactsCloseRequestSeq={chatArtifactsCloseRequestSeq}
      />
      
      {/* 白板模式和对话模式下不显示右侧面板 */}
      {shouldShowRightPanel && (
        <>
        {/* 右侧 resizer：放在主内容与右侧面板之间 */}
        <div
          className={`resizer ${dragging === 'right' ? 'active' : ''}`}
          onMouseDown={() => setDragging('right')}
        />
        <RightPanel 
          currentFile={currentFile}
          content={currentContent}
          activeSection={activeSection}
          onSectionClick={handleSectionClick}
          onNodeClick={handleNodeClick}
          viewMode={viewMode}
          previewPaneRef={previewPaneRef}
          onPreviewScroll={handlePreviewScroll}
          onEditStyles={handleEditStyles}
          customCSS={customCSS}
          onCloseStylePanel={() => setStylePanelOpen(false)}
        />
        </>
      )}

      {/* 样式面板 - 作为固定的第四栏 */}
      {stylePanelOpen && (
        <>
        {/* 样式面板 resizer：放在右侧面板与样式面板之间 */}
        <div
          className={`resizer ${dragging === 'style' ? 'active' : ''}`}
          onMouseDown={() => setDragging('style')}
        />
        <StyleSidebar
          isOpen={true}
          onClose={() => setStylePanelOpen(false)}
          onStyleChange={handleCustomCSSChange}
          customCSS={customCSS}
          width={stylePanelWidth}
          isFixedPanel={true}
        />
        </>
      )}

      {/* 分屏光标连线覆盖层（固定定位，覆盖全局） */}
      <SplitCursorOverlay
        visible={overlayState.visible}
        editorRect={overlayState.editorRect}
        previewRect={overlayState.previewRect}
        yEditor={overlayState.yEditor}
        yPreview={overlayState.yPreview}
        xEditor={overlayState.xEditor}
        dynamicGuideEnabled={dynamicCursorGuide}
      />

      {/* 原弹出样式侧边栏已移除，改为固定面板 */}
    </div>
    </I18nProvider>
  )
}

export default App

