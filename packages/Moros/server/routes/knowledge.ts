import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { generateKnowledgeGraph, getRelatedFiles } from '../utils/knowledgeGraph.js'
import { getFileTree } from '../utils/fileSystem.js'

export const knowledgeRouter = express.Router()

// 获取知识图谱
knowledgeRouter.get('/graph', async (req, res) => {
  try {
    const graph = await generateKnowledgeGraph()
    res.json({ success: true, data: graph })
  } catch (error) {
    console.error('生成知识图谱失败:', error)
    res.status(500).json({ success: false, error: '生成知识图谱失败' })
  }
})

// 获取相关文件推荐
knowledgeRouter.get('/related/:path(*)', async (req, res) => {
  try {
    const filePath = req.params.path
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: '文件路径不能为空' })
    }
    
    const relatedFiles = await getRelatedFiles(filePath)
    res.json({ success: true, data: relatedFiles })
  } catch (error) {
    console.error('获取相关文件失败:', error)
    res.status(500).json({ success: false, error: '获取相关文件失败' })
  }
})

// 搜索文件（全文检索 + 片段）
knowledgeRouter.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ success: false, error: '搜索关键词不能为空' })
    }
    const qLower = q.toLowerCase()
    const maxTotal = Math.min(Number(limit) || 50, 200)

    const files = await getFileTree()
    const dataDir = path.join(process.cwd(), 'markov-data')

    const results: Array<{ path: string; name: string; snippet: string; line: number; score: number }> = []
    for (const f of files) {
      if (f.type !== 'file') continue
      if (!f.path.endsWith('.md') && !f.path.endsWith('.excalidraw')) continue
      
      try {
        const full = path.join(dataDir, f.path)
        const content = await fs.readFile(full, 'utf-8')
        
        if (f.path.endsWith('.md')) {
          // Markdown 文件处理
          const lower = content.toLowerCase()
          let idx = lower.indexOf(qLower)
          let foundPerFile = 0
          while (idx !== -1 && results.length < maxTotal && foundPerFile < 3) {
            // 计算片段：取所在段落
            const paraStart = lower.lastIndexOf('\n\n', idx)
            const paraEnd = lower.indexOf('\n\n', idx)
            const start = Math.max(0, paraStart === -1 ? Math.max(0, idx - 120) : paraStart + 2)
            const end = paraEnd === -1 ? Math.min(content.length, idx + q.length + 180) : paraEnd
            let snippet = content.slice(start, end).replace(/\r/g, '')
            // 压缩片段
            snippet = snippet.trim().replace(/\n+/g, ' ')
            // 行号
            const line = content.slice(0, idx).split('\n').length
            // 粗略分值（越靠前、越短越高）
            const score = 1000 / (idx + 1) + 10 / (snippet.length + 1)
            results.push({ path: f.path, name: f.name, snippet, line, score })
            foundPerFile += 1
            idx = lower.indexOf(qLower, idx + qLower.length)
          }
        } else if (f.path.endsWith('.excalidraw')) {
          // Excalidraw 白板文件处理
          try {
            const excalidrawData = JSON.parse(content)
            if (excalidrawData.elements && Array.isArray(excalidrawData.elements)) {
              let foundPerFile = 0
              for (const element of excalidrawData.elements) {
                // 跳过已删除的元素
                if (element.isDeleted === true) continue
                if (element.text && typeof element.text === 'string') {
                  const textLower = element.text.toLowerCase()
                  if (textLower.includes(qLower) && foundPerFile < 3 && results.length < maxTotal) {
                    // 截取文本片段
                    let snippet = element.text.trim().replace(/\n+/g, ' ')
                    if (snippet.length > 200) {
                      const idx = textLower.indexOf(qLower)
                      const start = Math.max(0, idx - 80)
                      const end = Math.min(snippet.length, idx + qLower.length + 100)
                      snippet = (start > 0 ? '...' : '') + snippet.slice(start, end) + (end < snippet.length ? '...' : '')
                    }
                    // 白板元素没有行号概念，用元素ID作为标识
                    const line = element.id ? element.id.slice(-6) : 1
                    const score = 800 / (textLower.indexOf(qLower) + 1) + 10 / (snippet.length + 1)
                    results.push({ 
                      path: f.path, 
                      name: f.name, 
                      snippet: snippet,
                      line: line as any,
                      score 
                    })
                    foundPerFile += 1
                  }
                }
              }
            }
          } catch (parseError) {
            // JSON 解析失败，忽略该文件
          }
        }
      } catch (e) {
        // ignore single file errors
      }
      if (results.length >= maxTotal) break
    }

    // 去重：相同文件 + 相同片段（按标准化后的片段文本）只保留分值最高的一条
    const uniqueMap = new Map<string, { path: string; name: string; snippet: string; line: number; score: number }>()
    for (const r of results) {
      const key = `${r.path}__${r.snippet.trim().replace(/\s+/g, ' ')}`
      const existing = uniqueMap.get(key)
      if (!existing || r.score > existing.score) {
        uniqueMap.set(key, r)
      }
    }

    const uniqueResults = Array.from(uniqueMap.values())
    uniqueResults.sort((a, b) => b.score - a.score)
    res.json({ success: true, data: uniqueResults })
  } catch (error) {
    console.error('搜索失败:', error)
    res.status(500).json({ success: false, error: '搜索失败' })
  }
})