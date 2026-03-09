import { useCallback, useEffect, useMemo, useState } from 'react'
import { filesApi } from '../../utils/api'
import {
  ARTIFACT_FILE_EXTENSIONS,
  isImageArtifactPath,
  collectArtifactPathsFromMessages,
  collectArtifactUrlsFromMessages,
  isAbsolutePath,
  isLocalhostUrl,
  normalizeLocalhostUrl,
  normalizeAttachmentPath,
  sanitizeArtifactPathCandidate,
  resolveAttachmentPath,
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
      const nextEntries = []
      const seen = new Set()
      const hasArtifactExtension = (value) => {
        const lowerValue = String(value || '').toLowerCase()
        return ARTIFACT_FILE_EXTENSIONS.some((ext) => lowerValue.endsWith(ext))
      }

      const pushUrlEntry = (value) => {
        const normalizedUrl = normalizeLocalhostUrl(value)
        if (!normalizedUrl) return
        const key = `url:${normalizedUrl.toLowerCase()}`
        if (seen.has(key)) return
        seen.add(key)
        let label = normalizedUrl
        try {
          const parsed = new URL(normalizedUrl)
          const suffix = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : ''
          label = `${parsed.host}${suffix}`
        } catch {}
        nextEntries.push({
          id: `chat-url:${normalizedUrl.toLowerCase()}`,
          name: label,
          path: normalizedUrl,
          relativePath: undefined,
          source: 'chat',
          artifactType: 'url',
          previewUrl: normalizedUrl,
        })
      }

      const pushFileEntry = async (entryLike) => {
        const rawPath = normalizeAttachmentPath(resolveAttachmentPath(entryLike))
        if (isLocalhostUrl(rawPath)) {
          pushUrlEntry(rawPath)
          return
        }

        const pathCandidate = sanitizeArtifactPathCandidate(rawPath, { includeRelative: true })
        const relativeCandidate = sanitizeArtifactPathCandidate(entryLike?.relativePath, { includeRelative: true })

        let relativePath = ''
        let absolutePath = ''
        const applyPathCandidate = (candidate) => {
          const normalized = normalizeAttachmentPath(candidate)
          if (!normalized) return
          if (isAbsolutePath(normalized)) {
            if (!absolutePath) {
              absolutePath = normalized
            }
            return
          }
          const normalizedRelative = normalized.replace(/\\/g, '/').replace(/^\.\//, '').trim()
          if (!normalizedRelative) return
          if (!relativePath) {
            relativePath = normalizedRelative
          }
        }
        applyPathCandidate(pathCandidate)
        applyPathCandidate(relativeCandidate)

        const pathForExtension = absolutePath || relativePath
        if (!hasArtifactExtension(pathForExtension)) return

        if (!absolutePath && relativePath) {
          try {
            absolutePath = normalizeAttachmentPath(await filesApi.getAbsolutePath(relativePath))
          } catch {}
        }

        const canonicalPath = String(absolutePath || relativePath || '').trim()
        if (!canonicalPath) return
        const key = `file:${canonicalPath.toLowerCase()}`
        if (seen.has(key)) return
        seen.add(key)

        const displayPath = absolutePath || relativePath
        nextEntries.push({
          id: `chat-file:${canonicalPath.toLowerCase()}`,
          name: resolveAttachmentName(entryLike || {}, displayPath),
          path: displayPath,
          relativePath: relativePath || undefined,
          size: Number.isFinite(entryLike?.size) ? entryLike.size : undefined,
          source: 'chat',
          artifactType: 'file',
        })
      }

      const assistantMessages = [...(Array.isArray(messages) ? messages : [])]
        .filter((message) => message?.role === 'assistant')
        .reverse()

      for (const message of assistantMessages) {
        if (!Array.isArray(message?.files)) continue
        for (const fileEntry of message.files) {
          if (!fileEntry) continue
          pushUrlEntry(fileEntry?.url)
          await pushFileEntry(fileEntry)
        }
      }

      const messageArtifactPaths = collectArtifactPathsFromMessages(messages, { includeRelative: true })
      for (const pathValue of [...messageArtifactPaths].reverse()) {
        await pushFileEntry({ path: pathValue })
      }

      const messageArtifactUrls = collectArtifactUrlsFromMessages(messages)
      for (const urlValue of messageArtifactUrls) {
        pushUrlEntry(urlValue)
      }

      const isMarkovDataRootFile = (entry) => {
        if (entry?.artifactType !== 'file') return false
        const normalizedPath = String(entry?.relativePath || entry?.path || '')
          .replace(/\\/g, '/')
          .replace(/^\.\//, '')
          .toLowerCase()
        const markerMatch = normalizedPath.match(/(?:^|\/)markov-data\/(.+)$/)
        if (!markerMatch) return false
        const restPath = String(markerMatch[1] || '')
        return Boolean(restPath) && !restPath.includes('/')
      }

      const fallbackRootEntryIds = new Set()
      const fileEntriesByName = new Map()
      for (const entry of nextEntries) {
        if (entry?.artifactType !== 'file') continue
        const nameKey = String(entry?.name || '').trim().toLowerCase()
        if (!nameKey) continue
        if (!fileEntriesByName.has(nameKey)) {
          fileEntriesByName.set(nameKey, [])
        }
        fileEntriesByName.get(nameKey).push(entry)
      }
      for (const sameNameEntries of fileEntriesByName.values()) {
        if (!Array.isArray(sameNameEntries) || sameNameEntries.length < 2) continue
        const hasNestedPath = sameNameEntries.some((entry) => !isMarkovDataRootFile(entry))
        if (!hasNestedPath) continue
        for (const entry of sameNameEntries) {
          if (isMarkovDataRootFile(entry)) {
            fallbackRootEntryIds.add(entry.id)
          }
        }
      }

      const prunedEntries = nextEntries.filter((entry) => !fallbackRootEntryIds.has(entry?.id))

      setArtifactEntries(prunedEntries)
      setActiveArtifactId((prevId) => {
        if (prunedEntries.some((entry) => entry.id === prevId)) return prevId
        return prunedEntries[0]?.id || ''
      })
      return prunedEntries
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
    if (activeArtifact?.artifactType === 'url') return ''
    const relativePath = String(activeArtifact?.relativePath || '').trim()
    if (relativePath) return filesApi.getRawFileUrl(relativePath)

    const absolutePath = normalizeAttachmentPath(activeArtifact?.path)
    if (absolutePath && isAbsolutePath(absolutePath)) {
      return filesApi.getRawAbsoluteFileUrl(absolutePath)
    }
    return ''
  }, [activeArtifact?.artifactType, activeArtifact?.relativePath, activeArtifact?.path])

  const activeArtifactUrl = useMemo(() => {
    if (activeArtifact?.artifactType === 'url') {
      return String(activeArtifact?.previewUrl || activeArtifact?.path || '').trim()
    }
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
  }, [activeArtifact?.artifactType, activeArtifact?.previewUrl, activeArtifact?.relativePath, activeArtifact?.path])

  const activeArtifactExtension = useMemo(() => {
    if (activeArtifact?.artifactType === 'url') return ''
    const pathValue = String(activeArtifact?.path || activeArtifact?.relativePath || '').toLowerCase()
    const matchedExt = ARTIFACT_FILE_EXTENSIONS.find((ext) => pathValue.endsWith(ext))
    return matchedExt || ''
  }, [activeArtifact?.artifactType, activeArtifact?.path, activeArtifact?.relativePath])

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
    if (entry?.artifactType === 'url') return
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
