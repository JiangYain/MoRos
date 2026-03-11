export interface FileItem {
  id: string
  name: string
  type: 'file' | 'folder'
  path: string
  parentId?: string
  content?: string
  createdAt: string
  updatedAt: string
  size?: number
  color?: string // 项目颜色（文件/文件夹）
  coverImagePath?: string // Skill/文件夹封面图（相对 markov-data）
}

export interface KnowledgeNode {
  id: string
  name: string
  type: 'file' | 'concept'
  group: number
  size: number
  path?: string
}

export interface KnowledgeLink {
  source: string
  target: string
  strength: number
  type: 'reference' | 'similarity' | 'tag'
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[]
  links: KnowledgeLink[]
}

export interface FileSystemStats {
  totalFiles: number
  totalFolders: number
  totalSize: number
  lastModified: string
}