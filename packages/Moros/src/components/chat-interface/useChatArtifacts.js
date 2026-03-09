import { useCallback, useEffect, useMemo, useState } from 'react'
import { filesApi } from '../../utils/api'
import {
  ARTIFACT_FILE_EXTENSIONS,
  isImageArtifactPath,
  collectArtifactPathsFromMessages,
  isAbsolutePath,
  isArtifactWorkspaceCandidate,
  normalizeAttachmentPath,
  resolveAttachmentName,
} from './artifacts'

export function useChatArtifacts({
  messages,
  onArtifactsVisibilityChange,
  artifactsCloseRequestSeq,
}) {
  const [artifactsOpen, setArtifactsOpen] = useState(() => {
    try {
      return localStorage.getItem('moros-chat-artifacts-open') === '1'
    } catch {
      return false
    }
  })
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsError, setArtifactsError] = useState('')
  const [artifactEntries, setArtifactEntries] = useState([])
  const [activeArtifactId, setActiveArtifactId] = useState('')
  const [artifactsTab, setArtifactsTab] = useState('files')
  const [artifactSearchTerm, setArtifactSearchTerm] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem('moros-chat-artifacts-open', artifactsOpen ? '1' : '0')
    } catch {}
  }, [artifactsOpen])

  useEffect(() => {
    onArtifactsVisibilityChange?.(Boolean(artifactsOpen))
  }, [artifactsOpen, onArtifactsVisibilityChange])

  useEffect(() => {
    if (!artifactsCloseRequestSeq) return
    setArtifactsOpen(false)
  }, [artifactsCloseRequestSeq])

  useEffect(() => {
    return () => {
      onArtifactsVisibilityChange?.(false)
    }
  }, [onArtifactsVisibilityChange])

  const refreshArtifacts = useCallback(async () => {
    setArtifactsLoading(true)
    setArtifactsError('')
    try {
      const messageArtifactPaths = collectArtifactPathsFromMessages(messages)
      const tree = await filesApi.getFileTree({ fresh: true })
      const workspaceCandidates = (Array.isArray(tree) ? tree : [])
        .filter(isArtifactWorkspaceCandidate)
        .slice(0, 80)
      const workspaceEntries = await Promise.all(
        workspaceCandidates.map(async (item) => {
          const relativePath = String(item?.path || '').replace(/\\/g, '/').trim()
          if (!relativePath) return null
          let absolutePath = ''
          try {
            absolutePath = normalizeAttachmentPath(await filesApi.getAbsolutePath(relativePath))
          } catch {}
          return {
            id: `workspace:${relativePath}`,
            name: String(item?.name || '').trim() || relativePath.split('/').pop() || relativePath,
            path: absolutePath || relativePath,
            relativePath,
            size: Number.isFinite(item?.size) ? item.size : undefined,
            source: 'workspace',
          }
        }),
      )

      const mergedMap = new Map()
      const upsertEntry = (entry) => {
        if (!entry) return
        const key = String(entry.path || entry.relativePath || '').trim().toLowerCase()
        if (!key) return
        if (!mergedMap.has(key)) {
          mergedMap.set(key, entry)
          return
        }
        const existing = mergedMap.get(key)
        const source = existing.source === entry.source ? existing.source : 'workspace+chat'
        mergedMap.set(key, {
          ...existing,
          ...entry,
          source,
          relativePath: existing.relativePath || entry.relativePath,
          path: existing.path || entry.path,
        })
      }

      for (const entry of workspaceEntries) {
        upsertEntry(entry)
      }
      for (const pathValue of messageArtifactPaths) {
        upsertEntry({
          id: `chat:${pathValue}`,
          name: resolveAttachmentName({}, pathValue),
          path: pathValue,
          relativePath: undefined,
          source: 'chat',
        })
      }

      const nextEntries = [...mergedMap.values()].sort((a, b) => {
        const aWorkspace = String(a?.source || '').includes('workspace') ? 0 : 1
        const bWorkspace = String(b?.source || '').includes('workspace') ? 0 : 1
        if (aWorkspace !== bWorkspace) return aWorkspace - bWorkspace
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN')
      })

      setArtifactEntries(nextEntries)
      setActiveArtifactId((prevId) => {
        if (nextEntries.some((entry) => entry.id === prevId)) return prevId
        return nextEntries[0]?.id || ''
      })
      return nextEntries
    } catch (error) {
      setArtifactsError(String(error?.message || '读取 Artifacts 失败'))
      setArtifactEntries([])
      setActiveArtifactId('')
      return []
    } finally {
      setArtifactsLoading(false)
    }
  }, [messages])

  useEffect(() => {
    if (!artifactsOpen) return
    void refreshArtifacts()
  }, [artifactsOpen, refreshArtifacts])

  useEffect(() => {
    if (!artifactsOpen) return
    const timer = setInterval(() => {
      void refreshArtifacts()
    }, 2000)
    return () => clearInterval(timer)
  }, [artifactsOpen, refreshArtifacts])

  const activeArtifact = useMemo(() => {
    return artifactEntries.find((entry) => entry.id === activeArtifactId) || null
  }, [artifactEntries, activeArtifactId])

  const activeArtifactRawUrl = useMemo(() => {
    const relativePath = String(activeArtifact?.relativePath || '').trim()
    if (relativePath) return filesApi.getRawFileUrl(relativePath)

    const absolutePath = normalizeAttachmentPath(activeArtifact?.path)
    if (absolutePath && isAbsolutePath(absolutePath)) {
      return filesApi.getRawAbsoluteFileUrl(absolutePath)
    }
    return ''
  }, [activeArtifact?.relativePath, activeArtifact?.path])

  const activeArtifactUrl = useMemo(() => {
    const relativePath = String(activeArtifact?.relativePath || '').trim()
    if (relativePath) return filesApi.getRawFileUrl(relativePath)

    const absolutePath = normalizeAttachmentPath(activeArtifact?.path)
    if (absolutePath && isAbsolutePath(absolutePath)) {
      const normalizedPath = absolutePath.toLowerCase()
      if (normalizedPath.endsWith('.html') || normalizedPath.endsWith('.htm')) {
        return filesApi.getRawAbsoluteHtmlUrl(absolutePath)
      }
      return filesApi.getRawAbsoluteFileUrl(absolutePath)
    }
    return ''
  }, [activeArtifact?.relativePath, activeArtifact?.path])

  const activeArtifactExtension = useMemo(() => {
    const pathValue = String(activeArtifact?.path || activeArtifact?.relativePath || '').toLowerCase()
    const matchedExt = ARTIFACT_FILE_EXTENSIONS.find((ext) => pathValue.endsWith(ext))
    return matchedExt || ''
  }, [activeArtifact?.path, activeArtifact?.relativePath])

  const activeArtifactIsImage = useMemo(() => {
    return isImageArtifactPath(activeArtifactExtension)
  }, [activeArtifactExtension])

  const filteredArtifactEntries = useMemo(() => {
    const q = artifactSearchTerm.trim().toLowerCase()
    if (!q) return artifactEntries
    return artifactEntries.filter((e) =>
      String(e.name || '').toLowerCase().includes(q) ||
      String(e.path || '').toLowerCase().includes(q),
    )
  }, [artifactEntries, artifactSearchTerm])

  const formatFileSize = useCallback((size) => {
    if (size == null || size < 0) return ''
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }, [])

  const handleRevealArtifact = useCallback(async (entry) => {
    const relativePath = String(entry?.relativePath || '').trim()
    if (!relativePath) return
    try {
      await filesApi.revealInFileExplorer(relativePath)
    } catch (error) {
      console.error('打开 Artifact 位置失败:', error)
    }
  }, [])

  return {
    artifactsOpen,
    setArtifactsOpen,
    artifactsLoading,
    artifactsError,
    artifactEntries,
    activeArtifactId,
    setActiveArtifactId,
    artifactsTab,
    setArtifactsTab,
    artifactSearchTerm,
    setArtifactSearchTerm,
    filteredArtifactEntries,
    activeArtifact,
    activeArtifactUrl,
    activeArtifactRawUrl,
    activeArtifactExtension,
    activeArtifactIsImage,
    refreshArtifacts,
    formatFileSize,
    handleRevealArtifact,
  }
}
