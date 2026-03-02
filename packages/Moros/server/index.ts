import express from 'express'
import multer from 'multer'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { filesRouter } from './routes/files.js'
import { knowledgeRouter } from './routes/knowledge.js'
import { proxyRouter } from './routes/proxy.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 53211

// 中间件
app.use(cors())
// 提升请求体上限，适配白板较大的 JSON（包含内联图片时可能较大）
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ limit: '100mb', extended: true }))
// 在打包环境中，静态文件路径
const staticPath = path.join(__dirname, '../')
app.use(express.static(staticPath))

// API 路由
app.use('/api/files', filesRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/proxy', proxyRouter)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 统一错误处理（确保过大的请求等返回 JSON 而非 HTML）
// 注意：必须放在路由之后
// @ts-ignore
app.use((err, req, res, _next) => {
  // 捕获 Multer 错误（例如文件过大）
  if (err && (err instanceof multer.MulterError || err.code === 'LIMIT_FILE_SIZE')) {
    return res.status(413).json({ success: false, error: '文件过大，最大 50MB' })
  }
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ success: false, error: 'Request payload too large' })
  }
  if (err) {
    console.error('Unhandled server error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 MoRos 服务器启动成功！`)
  console.log(`📡 API 服务: http://localhost:${PORT}/api`)
  console.log(`🌐 前端地址: http://localhost:53210`)
  console.log(`📁 工作目录: ${process.cwd()}`)
})

export default app
