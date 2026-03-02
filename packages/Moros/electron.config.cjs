const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const isDev = process.env.NODE_ENV === 'development'
const BACKEND_PORT = process.env.PORT || 53211

let mainWindow
let backendProcess = null

function resolveServerEntryPath() {
  const candidates = [
    // asar 内部路径
    path.join(__dirname, 'dist', 'server', 'index.js'),
    // asarUnpacked 提取后的物理路径
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'server', 'index.js'),
    // 关闭 asar 的情形
    path.join(process.resourcesPath || '', 'app', 'dist', 'server', 'index.js')
  ].filter(Boolean)

  const fs = require('fs')
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return candidates[0]
}

async function startBackendIfNeeded() {
  if (isDev) return
  const entryPath = resolveServerEntryPath()
  process.env.PORT = String(BACKEND_PORT)
  // 优先尝试动态导入（asar 环境可能失败）
  try {
    const serverEntry = pathToFileURL(entryPath).href
    await import(serverEntry)
    return
  } catch (err) {
    console.warn('动态导入后端失败，尝试以子进程方式启动:', err && err.message, '\
候选入口:', entryPath)
  }
  // 退回方案：以子进程方式启动（ELECTRON_RUN_AS_NODE）
  try {
    const cp = require('child_process')
    backendProcess = cp.spawn(process.execPath, [entryPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(BACKEND_PORT) },
      stdio: 'ignore',
      windowsHide: true
    })
    backendProcess.unref()
  } catch (err) {
    console.error('以子进程方式启动后端失败:', err)
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
    icon: path.join(__dirname, 'assets/icon.png'), // 如果有图标的话
    titleBarStyle: 'default',
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
    // 生产：优先本地静态文件，失败再回退到本地服务
    const fs = require('fs')
    const fileCandidates = [
      path.join(__dirname, 'dist', 'index.html'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist', 'index.html'),
      path.join(process.resourcesPath || '', 'app', 'dist', 'index.html')
    ].filter(Boolean)
    let loaded = false
    for (const p of fileCandidates) {
      try {
        if (fs.existsSync(p)) {
          mainWindow.loadFile(p)
          loaded = true
          break
        }
      } catch {}
    }
    if (!loaded) {
      console.warn('未找到本地 index.html，回退到后端提供页面')
      mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`)
    }
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
    try { if (backendProcess) backendProcess.kill() } catch {}
    app.quit()
  }
})

// 应用激活时创建窗口 (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 设置应用菜单
const template = [
  {
    label: '文件',
    submenu: [
      {
        label: '新建文件',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          // 发送新建文件事件到渲染进程
          if (mainWindow) {
            mainWindow.webContents.send('menu-new-file')
          }
        }
      },
      {
        label: '新建文件夹',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('menu-new-folder')
          }
        }
      },
      { type: 'separator' },
      {
        label: '保存',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('menu-save')
          }
        }
      }
    ]
  },
  {
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectall', label: '全选' }
    ]
  },
  {
    label: '视图',
    submenu: [
      {
        label: '切换编辑模式',
        accelerator: 'CmdOrCtrl+E',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('menu-toggle-edit')
          }
        }
      },
      { type: 'separator' },
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '重置缩放' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' }
    ]
  },
  {
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'close', label: '关闭' }
    ]
  },
  {
    label: '帮助',
    submenu: [
      {
        label: '关于 MoRos',
        click: () => {
          // 显示关于对话框
        }
      }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)


