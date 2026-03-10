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
  createWorkspaceArtifactLookup,
  resolveArtifactFileReference,
  resolveAttachmentPath,
  resolveAttachmentName,
} from './artifacts'

export function useChatArtifacts({
  messages,
  chatFilePath,
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
  const [previewVersion, setPreviewVersion] = useState(0)

  const chatDirectoryRelative = useMemo(() => {
    const normalizedPath = String(chatFilePath || '')
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .trim()
    if (!normalizedPath) return ''
    const lastSlashIndex = normalizedPath.lastIndexOf('/')
    if (lastSlashIndex <= 0) return ''
    return normalizedPath.slice(0, lastSlashIndex)
  }, [chatFilePath])

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

  const refreshArtifacts = useCallback(async (refreshOptions = {}) => {
    const silent = refreshOptions?.silent === true
    if (!silent) {
      setArtifactsLoading(true)
    }
    setArtifactsError('')
    try {
      const bumpPreviewVersion = refreshOptions?.bumpPreviewVersion !== false
      const nextEntries = []
      const seen = new Set()
      let workspaceLookup = null
      try {
        workspaceLookup = createWorkspaceArtifactLookup(await filesApi.getFileTree({ fresh: true }))
      } catch {}
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

        const { relativePath, absolutePath } = resolveArtifactFileReference(entryLike, {
          includeRelative: true,
          preferRelativeForLeadingSlash: true,
          chatDirectoryRelative,
          workspaceLookup,
        })

        const pathForExtension = relativePath || absolutePath
        if (!hasArtifactExtension(pathForExtension)) return

        const canonicalPath = String(relativePath || absolutePath || '').trim()
        if (!canonicalPath) return
        const key = `file:${canonicalPath.toLowerCase()}`
        if (seen.has(key)) return
        seen.add(key)

        const displayPath = relativePath || absolutePath
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

      const messageArtifactPaths = collectArtifactPathsFromMessages(messages, {
        includeRelative: true,
        preferRelativeForLeadingSlash: true,
      })
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

      if (bumpPreviewVersion) {
        setPreviewVersion(Date.now())
      }
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
      if (!silent) {
        setArtifactsLoading(false)
      }
    }
  }, [messages, chatDirectoryRelative])

  useEffect(() => {
    if (!artifactsOpen) return
    void refreshArtifacts()
  }, [artifactsOpen, refreshArtifacts])

  const activeArtifact = useMemo(() => {
    return artifactEntries.find((entry) => entry.id === activeArtifactId) || null
  }, [artifactEntries, activeArtifactId])

  const appendVersionQuery = useCallback((url) => {
    const normalizedUrl = String(url || '').trim()
    if (!normalizedUrl) return ''
    const separator = normalizedUrl.includes('?') ? '&' : '?'
    return `${normalizedUrl}${separator}v=${previewVersion}`
  }, [previewVersion])

  const activeArtifactRawUrl = useMemo(() => {
    if (activeArtifact?.artifactType === 'url') return ''
    const relativePath = String(activeArtifact?.relativePath || '').trim()
    if (relativePath) return appendVersionQuery(filesApi.getRawFileUrl(relativePath))

    const absolutePath = normalizeAttachmentPath(activeArtifact?.path)
    if (absolutePath && isAbsolutePath(absolutePath)) {
      return appendVersionQuery(filesApi.getRawAbsoluteFileUrl(absolutePath))
    }
    return ''
  }, [activeArtifact?.artifactType, activeArtifact?.relativePath, activeArtifact?.path, appendVersionQuery])

  const activeArtifactUrl = useMemo(() => {
    if (activeArtifact?.artifactType === 'url') {
      return String(activeArtifact?.previewUrl || activeArtifact?.path || '').trim()
    }
    const relativePath = String(activeArtifact?.relativePath || '').trim()
    if (relativePath) return appendVersionQuery(filesApi.getRawFileUrl(relativePath))

    const absolutePath = normalizeAttachmentPath(activeArtifact?.path)
    if (absolutePath && isAbsolutePath(absolutePath)) {
      const normalizedPath = absolutePath.toLowerCase()
      if (normalizedPath.endsWith('.html') || normalizedPath.endsWith('.htm')) {
        return appendVersionQuery(filesApi.getRawAbsoluteHtmlUrl(absolutePath))
      }
      return appendVersionQuery(filesApi.getRawAbsoluteFileUrl(absolutePath))
    }
    return ''
  }, [activeArtifact?.artifactType, activeArtifact?.previewUrl, activeArtifact?.relativePath, activeArtifact?.path, appendVersionQuery])

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
