const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const isDev = !app.isPackaged
const BACKEND_PORT = process.env.PORT || 53211
const WINDOW_ICON_PATH = path.join(__dirname, 'public', 'favicon.svg')

let mainWindow

async function startBackendIfNeeded() {
  if (isDev) return
  try {
    process.env.PORT = String(BACKEND_PORT)
    const serverEntry = pathToFileURL(path.join(__dirname, 'dist/server/index.js')).href
    await import(serverEntry)
  } catch (err) {
    console.error('后端启动失败:', err)
  }
}

async function waitForBackendReady(maxRetries = 40) {
  if (isDev) return
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Node 20+ 全局提供 fetch
      const res = await fetch(`http://localhost:${BACKEND_PORT}/api/health`)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 300))
  }
  console.warn('后端健康检查未通过，继续加载前端')
}

async function createWindow() {
  // 创建主窗口
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false // 开发时允许本地文件访问
    },
    icon: WINDOW_ICON_PATH,
    titleBarStyle: 'default',
    autoHideMenuBar: true,
    show: false // 先隐藏，加载完成后显示
  })

  // 加载应用
  if (isDev) {
    mainWindow.loadURL('http://localhost:53210')
    // 开发模式下打开开发者工具
    mainWindow.webContents.openDevTools()
  } else {
    await startBackendIfNeeded()
    await waitForBackendReady()
    mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`)
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 应用准备就绪
app.whenReady().then(createWindow)

// 所有窗口关闭时退出应用 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用激活时创建窗口 (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

Menu.setApplicationMenu(null)