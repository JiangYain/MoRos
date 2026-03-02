import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import { KnowledgeGraph, KnowledgeNode, KnowledgeLink } from '../types/index.js'
import { getFileTree } from './fileSystem.js'

const DATA_DIR = path.join(process.cwd(), 'markov-data')

// 提取文件中的链接引用
function extractReferences(content: string): string[] {
  const references: string[] = []
  
  // 提取 [[链接]] 格式的内部链接
  const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g)
  if (wikiLinks) {
    wikiLinks.forEach(link => {
      const linkText = link.slice(2, -2).trim()
      references.push(linkText)
    })
  }
  
  // 提取 #标签
  const tags = content.match(/#[\w\u4e00-\u9fa5]+/g)
  if (tags) {
    tags.forEach(tag => {
      references.push(tag.slice(1)) // 移除 # 符号
    })
  }
  
  return references
}

// 计算文本相似度（简单的关键词匹配）
function calculateSimilarity(content1: string, content2: string): number {
  const words1 = content1.toLowerCase().match(/[\w\u4e00-\u9fa5]+/g) || []
  const words2 = content2.toLowerCase().match(/[\w\u4e00-\u9fa5]+/g) || []
  
  const set1 = new Set(words1)
  const set2 = new Set(words2)
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return union.size > 0 ? intersection.size / union.size : 0
}

// 生成知识图谱
export async function generateKnowledgeGraph(): Promise<KnowledgeGraph> {
  const fileTree = await getFileTree()
  const nodes: KnowledgeNode[] = []
  const links: KnowledgeLink[] = []
  const fileContents = new Map<string, string>()
  
  // 收集所有文件内容
  for (const file of fileTree) {
    if (file.type === 'file' && file.path.endsWith('.md')) {
      try {
        const fullPath = path.join(DATA_DIR, file.path)
        const content = await fs.readFile(fullPath, 'utf-8')
        const parsed = matter(content)
        
        fileContents.set(file.path, parsed.content)
        
        // 创建文件节点
        const node: KnowledgeNode = {
          id: file.path,
          name: file.name.replace('.md', ''),
          type: 'file',
          group: 1,
          size: Math.max(10, Math.min(50, content.length / 100)),
          path: file.path
        }
        nodes.push(node)
      } catch (error) {
        console.error(`读取文件失败: ${file.path}`, error)
      }
    }
  }
  
  // 分析文件之间的关系
  const fileNodes = nodes.filter(n => n.type === 'file')
  const conceptNodes = new Map<string, KnowledgeNode>()
  
  for (let i = 0; i < fileNodes.length; i++) {
    const file1 = fileNodes[i]
    const content1 = fileContents.get(file1.path!) || ''
    const references1 = extractReferences(content1)
    
    // 处理引用链接
    references1.forEach(ref => {
      // 查找被引用的文件
      const targetFile = fileNodes.find(f => 
        f.name.toLowerCase() === ref.toLowerCase() ||
        f.path!.toLowerCase().includes(ref.toLowerCase())
      )
      
      if (targetFile) {
        links.push({
          source: file1.id,
          target: targetFile.id,
          strength: 0.8,
          type: 'reference'
        })
      } else {
        // 创建概念节点
        const conceptId = `concept_${ref}`
        if (!conceptNodes.has(conceptId)) {
          conceptNodes.set(conceptId, {
            id: conceptId,
            name: ref,
            type: 'concept',
            group: 2,
            size: 15
          })
        }
        
        links.push({
          source: file1.id,
          target: conceptId,
          strength: 0.6,
          type: 'tag'
        })
      }
    })
    
    // 计算文件相似度
    for (let j = i + 1; j < fileNodes.length; j++) {
      const file2 = fileNodes[j]
      const content2 = fileContents.get(file2.path!) || ''
      
      const similarity = calculateSimilarity(content1, content2)
      if (similarity > 0.1) { // 相似度阈值
        links.push({
          source: file1.id,
          target: file2.id,
          strength: similarity,
          type: 'similarity'
        })
      }
    }
  }
  
  // 添加概念节点
  nodes.push(...Array.from(conceptNodes.values()))
  
  return { nodes, links }
}

// 获取文件的相关文件推荐
export async function getRelatedFiles(filePath: string): Promise<KnowledgeNode[]> {
  const graph = await generateKnowledgeGraph()
  const targetNode = graph.nodes.find(n => n.path === filePath)
  
  if (!targetNode) return []
  
  // 找出与目标文件相关的所有节点
  const relatedNodes: KnowledgeNode[] = []
  const relatedIds = new Set<string>()
  
  graph.links.forEach(link => {
    if (link.source === targetNode.id && !relatedIds.has(link.target)) {
      const targetNode = graph.nodes.find(n => n.id === link.target)
      if (targetNode && targetNode.type === 'file') {
        relatedNodes.push(targetNode)
        relatedIds.add(link.target)
      }
    } else if (link.target === targetNode.id && !relatedIds.has(link.source)) {
      const sourceNode = graph.nodes.find(n => n.id === link.source)
      if (sourceNode && sourceNode.type === 'file') {
        relatedNodes.push(sourceNode)
        relatedIds.add(link.source)
      }
    }
  })
  
  // 按相关性排序
  return relatedNodes.sort((a, b) => {
    const linkA = graph.links.find(l => 
      (l.source === targetNode.id && l.target === a.id) ||
      (l.target === targetNode.id && l.source === a.id)
    )
    const linkB = graph.links.find(l => 
      (l.source === targetNode.id && l.target === b.id) ||
      (l.target === targetNode.id && l.source === b.id)
    )
    
    return (linkB?.strength || 0) - (linkA?.strength || 0)
  }).slice(0, 10) // 最多返回10个相关文件
}