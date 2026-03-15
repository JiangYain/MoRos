export const IMAGE_ARTIFACT_FILE_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']
export const TEXT_ARTIFACT_FILE_EXTENSIONS = [
  '.html', '.htm',
  '.json', '.excalidraw', '.md', '.markdown', '.txt', '.csv',
  '.yaml', '.yml', '.xml', '.toml', '.ini', '.log',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.scss',
  '.py', '.sh',
]
export const ARTIFACT_FILE_EXTENSIONS = [
  ...IMAGE_ARTIFACT_FILE_EXTENSIONS,
  ...TEXT_ARTIFACT_FILE_EXTENSIONS,
]

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const ARTIFACT_EXT_PATTERN = '(?:html?|json|excalidraw|md|markdown|txt|csv|ya?ml|xml|toml|ini|log|js|jsx|ts|tsx|css|scss|py|sh|svg|png|jpe?g|webp|gif)'
const WINDOWS_ABS_ARTIFACT_PATH_REGEX = new RegExp(`(?:^|[\\s("'\\\`])([A-Za-z]:[\\\\/][^:"'\\\`\\n\\r<>|?*]+\\.${ARTIFACT_EXT_PATTERN}\\b)`, 'gi')
const POSIX_ABS_ARTIFACT_PATH_REGEX = new RegExp(`(?:^|[\\s("'\\\`])(\\/[^"'\\\`\\n\\r<>|?*]+\\.${ARTIFACT_EXT_PATTERN}\\b)`, 'gi')
const RELATIVE_ARTIFACT_PATH_REGEX = new RegExp(`(?:^|[\\s("'\\\`])((?:\\.{1,2}[\\\\/])?[^"'\\\`\\n\\r<>|?*:]+\\.${ARTIFACT_EXT_PATTERN})(?=$|[\\s)"'\\\`,.:;!?])`, 'gi')
const LOCALHOST_URL_REGEX = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d{2,5})?(?:\/[^\s"'`<>]*)?/gi
const STANDALONE_ARTIFACT_LINE_REGEX = new RegExp(`^(?:[-*+]\\s+)?(?:file\\s*:\\s+)?["'\\\`]?([^"'\\\`\\n\\r]+\\.${ARTIFACT_EXT_PATTERN})["'\\\`]?$`, 'i')
const WORKSPACE_PATH_SEGMENT_REGEX = /(?:^|\/)(?:pi-mono\/)?(?:packages\/Moros\/)?markov-data\/(.+)$/i
const WORKSPACE_RELATIVE_PREFIXES = [
  'pi-mono/packages/moros/markov-data/',
  'packages/moros/markov-data/',
  'markov-data/',
]
const MALFORMED_WINDOWS_DRIVE_RELATIVE_REGEX = /^[A-Za-z]\/(?:Users|Windows|Program Files(?: \(x86\))?|ProgramData|Documents and Settings)\b/i
const DIRECT_ARTIFACT_TOOL_NAMES = new Set(['write', 'edit', 'strreplace', 'str_replace'])
const BASH_LIKE_TOOL_NAMES = new Set(['bash', 'shell'])
const TOOL_NAME_PATH_HINT_REGEX = /write|edit|create|save|export|artifact/
const ARTIFACT_SIGNAL_LINE_REGEX = /(?:saved?\s*:|(?:successfully\s+)?wrote\b|written\b|created?\b|generated?\b|exported?\b|produced?\b|rendered?\b|updated?\b|modified?\b|replaced?\b|output(?:ted)?\b)/i

export const resolveAttachmentPath = (fileLike) => {
  const candidates = [fileLike?.path, fileLike?.absolutePath, fileLike?.webkitRelativePath]
  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (value) return value
  }
  return String(fileLike?.name || '').trim()
}

export const resolveAttachmentName = (fileLike, pathValue) => {
  const explicitName = String(fileLike?.name || '').trim()
  if (explicitName) return explicitName
  const normalizedPath = String(pathValue || '').trim()
  if (!normalizedPath) return ''
  const pieces = normalizedPath.split(/[/\\]/)
  return pieces[pieces.length - 1] || normalizedPath
}

export const appendAttachmentPathsToPrompt = (messageText, files) => {
  const base = String(messageText || '').trim()
  const paths = (Array.isArray(files) ? files : [])
    .map((file) => String(file?.path || '').trim())
    .filter(Boolean)
  if (paths.length === 0) return base
  const lines = paths.map((pathValue) => `- ${pathValue}`)
  const pathHandlingNote = 'Use these exact local paths as provided. On Windows, do not rewrite C:\\ paths into /c/ style paths.'
  return `${base}\n\nAttached file paths:\n${lines.join('\n')}\n\nPath handling note: ${pathHandlingNote}`
}

export const isAbsolutePath = (value) => ABSOLUTE_PATH_PATTERN.test(String(value || '').trim())

export const normalizeLocalhostUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    const parsed = new URL(withProtocol)
    const host = String(parsed.hostname || '').toLowerCase()
    if (host !== 'localhost' && host !== '127.0.0.1') return ''
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

export const isLocalhostUrl = (value) => Boolean(normalizeLocalhostUrl(value))

export const normalizeAttachmentPath = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  const posixWindowsDriveMatch = text.match(/^\/([A-Za-z])\/(.*)$/)
  if (posixWindowsDriveMatch?.[2]) {
    return `${String(posixWindowsDriveMatch[1] || '').toUpperCase()}:\\${String(posixWindowsDriveMatch[2] || '').replace(/\//g, '\\')}`
  }
  if (/^[A-Za-z]:\//.test(text)) return text.replace(/\//g, '\\')
  return text
}

const stripWorkspaceRelativePrefix = (value) => {
  let normalized = String(value || '').trim().replace(/\\/g, '/')
  if (!normalized) return ''
  let previous = ''
  while (previous !== normalized) {
    previous = normalized
    normalized = normalized
      .replace(/^\.\/+/, '')
      .replace(/^\/+/, '')
      .trim()
    const workspaceMatch = normalized.match(WORKSPACE_PATH_SEGMENT_REGEX)
    if (workspaceMatch?.[1]) {
      normalized = String(workspaceMatch[1] || '').trim()
      continue
    }
    for (const prefix of WORKSPACE_RELATIVE_PREFIXES) {
      if (normalized.toLowerCase().startsWith(prefix)) {
        normalized = normalized.slice(prefix.length)
        break
      }
    }
  }
  return normalized
}

const normalizeRelativeArtifactPath = (value) => {
  const normalized = stripWorkspaceRelativePrefix(normalizeAttachmentPath(value))
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .trim()
  if (!normalized) return ''
  if (MALFORMED_WINDOWS_DRIVE_RELATIVE_REGEX.test(normalized)) return ''
  return normalized
}

const stripEnclosingQuotes = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")) || (text.startsWith('`') && text.endsWith('`'))) {
    return text.slice(1, -1).trim()
  }
  return text
}

const stripStatusPrefix = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  const savedPrefix = text.match(/^saved\s*:\s*(.+)$/i)
  if (savedPrefix?.[1]) return String(savedPrefix[1]).trim()
  const wrotePrefix = text.match(/^(?:successfully\s+)?wrote\s+\d+\s+bytes\s+to\s+(.+)$/i)
  if (wrotePrefix?.[1]) return String(wrotePrefix[1]).trim()
  return text
}

const looksLikeRelativePath = (value) => {
  const text = String(value || '')
  return /[\\/]/.test(text)
}

const hasArtifactLikeExtension = (pathValue) => {
  const normalized = String(pathValue || '').trim().toLowerCase()
  if (!normalized) return false
  return ARTIFACT_FILE_EXTENSIONS.some((ext) => normalized.endsWith(ext))
}

const normalizeToolName = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export const isWorkspaceScopedArtifactPath = (value) => {
  const normalized = normalizeAttachmentPath(value).replace(/\\/g, '/')
  return WORKSPACE_PATH_SEGMENT_REGEX.test(normalized)
}

export const createWorkspaceArtifactLookup = (items) => {
  const relativePathsByLower = new Map()
  const visitItems = (nodes) => {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      if (!node || typeof node !== 'object') continue
      if (node.type === 'file') {
        const normalizedPath = normalizeRelativeArtifactPath(node.path)
        if (normalizedPath) {
          relativePathsByLower.set(normalizedPath.toLowerCase(), normalizedPath)
        }
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        visitItems(node.children)
      }
    }
  }
  visitItems(items)
  return { relativePathsByLower }
}

export const resolveWorkspaceRelativeArtifactPath = (value, options = {}) => {
  const normalized = normalizeRelativeArtifactPath(value)
  if (!normalized || isAbsolutePath(normalized) || /^[A-Za-z]+:\/\//.test(normalized)) return ''

  const normalizedChatDirectory = normalizeRelativeArtifactPath(options?.chatDirectoryRelative)
  const candidates = []
  if (!normalized.includes('/') && normalizedChatDirectory) {
    candidates.push(normalizeRelativeArtifactPath(`${normalizedChatDirectory}/${normalized}`))
  }
  candidates.push(normalized)

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))]
  const workspaceLookup = options?.workspaceLookup?.relativePathsByLower
  if (!(workspaceLookup instanceof Map) || workspaceLookup.size === 0) {
    return uniqueCandidates[0] || ''
  }

  for (const candidate of uniqueCandidates) {
    const matched = workspaceLookup.get(candidate.toLowerCase())
    if (matched) return matched
  }
  return ''
}

export const resolveWorkspaceRelativeArtifactPathFromAbsolute = (value, options = {}) => {
  const normalizedAbsolute = normalizeAttachmentPath(value)
  if (!normalizedAbsolute || !isAbsolutePath(normalizedAbsolute)) return ''
  if (!isWorkspaceScopedArtifactPath(normalizedAbsolute)) return ''
  const strippedCandidate = normalizeRelativeArtifactPath(normalizedAbsolute)
  if (!strippedCandidate || strippedCandidate.includes(':')) return ''
  return resolveWorkspaceRelativeArtifactPath(strippedCandidate, options)
    || (
      options?.workspaceLookup?.relativePathsByLower instanceof Map
        ? ''
        : strippedCandidate
    )
}

export const resolveArtifactFileReference = (entryLike, options = {}) => {
  const includeRelative = options?.includeRelative !== false
  const preferRelativeForLeadingSlash = Boolean(options?.preferRelativeForLeadingSlash)
  const workspaceLookup = options?.workspaceLookup
  const chatDirectoryRelative = options?.chatDirectoryRelative
  const pathCandidate = sanitizeArtifactPathCandidate(resolveAttachmentPath(entryLike), {
    includeRelative,
    preferRelativeForLeadingSlash,
  })
  const relativeCandidate = sanitizeArtifactPathCandidate(entryLike?.relativePath, {
    includeRelative,
    preferRelativeForLeadingSlash,
  })

  let relativePath = ''
  let absolutePath = ''

  const applyRelativeCandidate = (candidate) => {
    if (!candidate) return
    const resolved =
      resolveWorkspaceRelativeArtifactPath(candidate, { chatDirectoryRelative, workspaceLookup })
      || (
        workspaceLookup?.relativePathsByLower instanceof Map
          ? ''
          : resolveWorkspaceRelativeArtifactPath(candidate, { chatDirectoryRelative })
      )
    if (resolved && !relativePath) {
      relativePath = resolved
    }
  }

  const applyAbsoluteCandidate = (candidate) => {
    const normalized = normalizeAttachmentPath(candidate)
    if (!normalized || !isAbsolutePath(normalized)) return
    const resolvedWorkspacePath = resolveWorkspaceRelativeArtifactPathFromAbsolute(normalized, {
      chatDirectoryRelative,
      workspaceLookup,
    })
    if (resolvedWorkspacePath && !relativePath) {
      relativePath = resolvedWorkspacePath
    }
    if (!absolutePath) {
      absolutePath = normalized
    }
  }

  applyRelativeCandidate(relativeCandidate)
  applyRelativeCandidate(pathCandidate)
  applyAbsoluteCandidate(relativeCandidate)
  applyAbsoluteCandidate(pathCandidate)

  const applyChatDirectoryBasenameFallback = () => {
    if (relativePath || !absolutePath) return

    const absoluteName = String(absolutePath || '')
      .split(/[/\\]/)
      .pop()
      .trim()
    if (!absoluteName || !hasArtifactLikeExtension(absoluteName)) return

    const normalizedChatDirectory = normalizeRelativeArtifactPath(chatDirectoryRelative)
    const workspaceMap = workspaceLookup?.relativePathsByLower instanceof Map
      ? workspaceLookup.relativePathsByLower
      : null

    if (normalizedChatDirectory) {
      const candidateInChatDir = normalizeRelativeArtifactPath(`${normalizedChatDirectory}/${absoluteName}`)
      if (candidateInChatDir) {
        if (workspaceMap) {
          const matched = workspaceMap.get(candidateInChatDir.toLowerCase())
          if (matched) {
            relativePath = matched
            return
          }
        } else {
          relativePath = candidateInChatDir
          return
        }
      }
    }

    if (!workspaceMap || workspaceMap.size === 0) return
    const basenameLower = absoluteName.toLowerCase()
    const suffix = `/${basenameLower}`
    let uniqueMatch = ''
    for (const [relativeLower, relativeOriginal] of workspaceMap.entries()) {
      if (relativeLower !== basenameLower && !relativeLower.endsWith(suffix)) continue
      if (uniqueMatch && uniqueMatch !== relativeOriginal) {
        uniqueMatch = ''
        break
      }
      uniqueMatch = relativeOriginal
    }
    if (uniqueMatch) {
      relativePath = uniqueMatch
    }
  }

  applyChatDirectoryBasenameFallback()

  if (absolutePath && !relativePath && isWorkspaceScopedArtifactPath(absolutePath)) {
    return {
      relativePath: '',
      absolutePath: '',
    }
  }

  return {
    relativePath,
    absolutePath,
  }
}

export const isImageArtifactPath = (pathValue) => {
  const normalized = String(pathValue || '').trim().toLowerCase()
  if (!normalized) return false
  return IMAGE_ARTIFACT_FILE_EXTENSIONS.some((ext) => normalized.endsWith(ext))
}

export const isTextArtifactPath = (pathValue) => {
  const normalized = String(pathValue || '').trim().toLowerCase()
  if (!normalized) return false
  return TEXT_ARTIFACT_FILE_EXTENSIONS.some((ext) => normalized.endsWith(ext))
}

export const isArtifactWorkspaceCandidate = (item) => {
  if (!item || item.type !== 'file') return false
  const pathValue = String(item.path || '').replace(/\\/g, '/').toLowerCase()
  const nameValue = String(item.name || '').toLowerCase()
  if (!hasArtifactLikeExtension(pathValue) && !hasArtifactLikeExtension(nameValue)) return false
  if (nameValue.startsWith('.')) return false
  if (isImageArtifactPath(nameValue) || isImageArtifactPath(pathValue)) return true
  if (nameValue === 'bundle.html') return true
  if (nameValue.endsWith('.artifact.html')) return true
  if (pathValue.includes('/artifacts/')) return true
  if (pathValue.includes('/pi-agent-runtime/')) return true
  if (pathValue.includes('/agent-sessions/')) return true
  if (pathValue.includes('/outputs/')) return true
  if (/(artifact|report|result|output|preview)/.test(nameValue)) return true
  if (isTextArtifactPath(nameValue) || isTextArtifactPath(pathValue)) return true
  return false
}

const extractAbsoluteArtifactPathsFromText = (value) => {
  const text = String(value || '')
  if (!text) return []
  const matches = []
  WINDOWS_ABS_ARTIFACT_PATH_REGEX.lastIndex = 0
  POSIX_ABS_ARTIFACT_PATH_REGEX.lastIndex = 0
  let match
  while ((match = WINDOWS_ABS_ARTIFACT_PATH_REGEX.exec(text)) !== null) {
    matches.push(match[1] || match[0])
  }
  while ((match = POSIX_ABS_ARTIFACT_PATH_REGEX.exec(text)) !== null) {
    matches.push(match[1] || match[0])
  }
  return matches
    .map((item) => normalizeAttachmentPath(item))
    .filter((item) => isAbsolutePath(item) && hasArtifactLikeExtension(item))
}

const extractRelativeArtifactPathsFromText = (value) => {
  const text = String(value || '')
  if (!text) return []
  const matches = []
  let match
  RELATIVE_ARTIFACT_PATH_REGEX.lastIndex = 0
  while ((match = RELATIVE_ARTIFACT_PATH_REGEX.exec(text)) !== null) {
    const rawCandidate = stripEnclosingQuotes(match[1] || '')
    if (!rawCandidate) continue
    const candidate = normalizeRelativeArtifactPath(rawCandidate)
    if (!candidate) continue
    if (!looksLikeRelativePath(rawCandidate) && !hasArtifactLikeExtension(candidate)) continue
    if (rawCandidate.includes(':')) continue
    if (isAbsolutePath(candidate)) continue
    if (candidate.startsWith('/')) continue
    if (/^[A-Za-z]+:\/\//.test(candidate)) continue
    if (!hasArtifactLikeExtension(candidate)) continue
    matches.push(candidate)
  }
  return matches
}

export const extractArtifactPathsFromText = (value, options = {}) => {
  const includeRelative = Boolean(options?.includeRelative)
  const absoluteMatches = extractAbsoluteArtifactPathsFromText(value)
  if (!includeRelative) return [...new Set(absoluteMatches)]
  return [...new Set([...absoluteMatches, ...extractRelativeArtifactPathsFromText(value)])]
}

export const sanitizeArtifactPathCandidate = (value, options = {}) => {
  const includeRelative = options?.includeRelative !== false
  const preferRelativeForLeadingSlash = Boolean(options?.preferRelativeForLeadingSlash)
  const raw = stripStatusPrefix(stripEnclosingQuotes(value))
  if (!raw) return ''

  const toPreferredLeadingSlashPath = (inputPath) => {
    const normalizedPath = normalizeAttachmentPath(inputPath)
    if (!preferRelativeForLeadingSlash || !includeRelative || !normalizedPath.startsWith('/')) {
      return normalizedPath
    }
    const isLikelySystemPosixRoot = /^\/(?:users|home|var|tmp|opt|etc|mnt|volumes)\b/i.test(normalizedPath)
    if (isLikelySystemPosixRoot) return normalizedPath
    const strippedRelative = normalizeRelativeArtifactPath(normalizedPath.replace(/^\/+/, ''))
    if (strippedRelative && hasArtifactLikeExtension(strippedRelative)) {
      return strippedRelative
    }
    return normalizedPath
  }

  const absoluteMatches = extractAbsoluteArtifactPathsFromText(raw)
  if (absoluteMatches.length > 0) return toPreferredLeadingSlashPath(absoluteMatches[0])

  const normalized = toPreferredLeadingSlashPath(raw)
  if (isAbsolutePath(normalized) && hasArtifactLikeExtension(normalized)) {
    return normalized
  }

  if (!includeRelative) return ''

  const relativeMatches = extractRelativeArtifactPathsFromText(raw)
  if (relativeMatches.length > 0) return relativeMatches[0]

  if (raw.includes(':')) return ''

  const normalizedRelative = normalizeRelativeArtifactPath(raw)
  if (!normalizedRelative) return ''
  if (!looksLikeRelativePath(raw) && !hasArtifactLikeExtension(normalizedRelative)) return ''
  if (isAbsolutePath(normalizedRelative)) return ''
  if (normalizedRelative.startsWith('/')) return ''
  if (/^[A-Za-z]+:\/\//.test(normalizedRelative)) return ''
  if (!hasArtifactLikeExtension(normalizedRelative)) return ''
  return normalizedRelative
}

export const extractLocalhostUrlsFromText = (value) => {
  const text = String(value || '')
  if (!text) return []
  const matches = text.match(LOCALHOST_URL_REGEX) || []
  return matches
    .map((url) => normalizeLocalhostUrl(url))
    .filter(Boolean)
}

const extractArtifactPathsFromSignalText = (value, options = {}) => {
  const text = String(value || '')
  if (!text) return []

  const matches = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!ARTIFACT_SIGNAL_LINE_REGEX.test(lines[i])) continue
    for (const pathValue of extractArtifactPathsFromText(lines[i], options)) {
      matches.push(pathValue)
    }
    for (let offset = 1; offset <= 2 && i + offset < lines.length; offset++) {
      const standaloneMatch = lines[i + offset].trim().match(STANDALONE_ARTIFACT_LINE_REGEX)
      if (!standaloneMatch?.[1]) continue
      const standaloneSource = String(standaloneMatch[1] || '').trim()
      if (/^[A-Za-z]+\s+/.test(standaloneSource) && /[\\/]/.test(standaloneSource)) continue
      const candidate = sanitizeArtifactPathCandidate(standaloneSource, options)
      if (candidate) {
        matches.push(candidate)
      }
    }
  }

  return [...new Set(matches)]
}

const collectArtifactPathsFromTool = (tool, options = {}) => {
  const includeRelative = Boolean(options?.includeRelative)
  const preferRelativeForLeadingSlash = Boolean(options?.preferRelativeForLeadingSlash)
  const pathSet = new Set()
  const normalizedToolName = normalizeToolName(tool?.toolName)
  const pushPath = (value) => {
    const normalized = sanitizeArtifactPathCandidate(value, { includeRelative, preferRelativeForLeadingSlash })
    if (!normalized) return
    if (!isAbsolutePath(normalized) && !includeRelative) return
    if (/^[A-Za-z]+:\/\//.test(normalized)) return
    pathSet.add(normalized)
  }

  const shouldTrustDirectPaths =
    DIRECT_ARTIFACT_TOOL_NAMES.has(normalizedToolName) ||
    (Boolean(tool?.args?.path) && TOOL_NAME_PATH_HINT_REGEX.test(normalizedToolName))

  if (shouldTrustDirectPaths) {
    pushPath(tool?.path)
    pushPath(tool?.args?.path)
  }

  const outputExtractor = shouldTrustDirectPaths || BASH_LIKE_TOOL_NAMES.has(normalizedToolName)
    ? extractArtifactPathsFromSignalText
    : null

  if (outputExtractor) {
    for (const pathValue of outputExtractor(tool?.outputPreview, { includeRelative })) {
      pushPath(pathValue)
    }
    for (const pathValue of outputExtractor(tool?.output, { includeRelative })) {
      pushPath(pathValue)
    }
  }

  return [...pathSet]
}

export const collectArtifactPathsFromToolEvents = (tools, options = {}) => {
  const includeRelative = Boolean(options?.includeRelative)
  const preferRelativeForLeadingSlash = Boolean(options?.preferRelativeForLeadingSlash)
  const pathSet = new Set()
  for (const tool of Array.isArray(tools) ? tools : []) {
    for (const pathValue of collectArtifactPathsFromTool(tool, { includeRelative, preferRelativeForLeadingSlash })) {
      pathSet.add(pathValue)
    }
  }
  return [...pathSet]
}

export const collectArtifactUrlsFromToolEvents = (tools) => {
  const urlSet = new Set()
  const pushUrl = (value) => {
    const normalized = normalizeLocalhostUrl(value)
    if (!normalized) return
    urlSet.add(normalized)
  }

  for (const tool of Array.isArray(tools) ? tools : []) {
    for (const url of extractLocalhostUrlsFromText(tool?.outputPreview)) {
      pushUrl(url)
    }
    for (const url of extractLocalhostUrlsFromText(tool?.output)) {
      pushUrl(url)
    }
  }
  return [...urlSet]
}

export const collectArtifactPathsFromMessages = (messages, options = {}) => {
  const includeRelative = Boolean(options?.includeRelative)
  const preferRelativeForLeadingSlash = Boolean(options?.preferRelativeForLeadingSlash)
  const pathSet = new Set()
  const pushPath = (value) => {
    const normalized = sanitizeArtifactPathCandidate(value, { includeRelative, preferRelativeForLeadingSlash })
    if (!normalized) return
    if (isAbsolutePath(normalized)) {
      pathSet.add(normalized)
      return
    }
    if (!includeRelative) return
    const relativePath = normalizeRelativeArtifactPath(normalized)
    if (!relativePath) return
    pathSet.add(relativePath)
  }
  const collectFromTool = (tool) => {
    for (const pathValue of collectArtifactPathsFromTool(tool, { includeRelative, preferRelativeForLeadingSlash })) {
      pushPath(pathValue)
    }
  }

  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== 'assistant') continue
    let hasExplicitToolArtifacts = false
    if (Array.isArray(message?.tools)) {
      for (const tool of message.tools) {
        hasExplicitToolArtifacts = true
        collectFromTool(tool)
      }
    }
    if (Array.isArray(message?.segments)) {
      for (const segment of message.segments) {
        if (segment?.type === 'tools' && Array.isArray(segment?.tools)) {
          hasExplicitToolArtifacts = true
          for (const tool of segment.tools) collectFromTool(tool)
        }
        if (!hasExplicitToolArtifacts && segment?.type === 'text') {
          for (const pathValue of extractArtifactPathsFromSignalText(segment?.content, { includeRelative })) {
            pushPath(pathValue)
          }
        }
      }
    }
    if (!hasExplicitToolArtifacts) {
      for (const pathValue of extractArtifactPathsFromSignalText(message?.content, { includeRelative })) {
        pushPath(pathValue)
      }
    }
  }

  return [...pathSet]
}

export const collectArtifactUrlsFromMessages = (messages) => {
  const urlSet = new Set()
  const pushUrl = (value) => {
    const normalized = normalizeLocalhostUrl(value)
    if (!normalized) return
    urlSet.add(normalized)
  }

  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== 'assistant') continue
    if (Array.isArray(message?.files)) {
      for (const file of message.files) {
        pushUrl(file?.url)
        pushUrl(file?.path)
      }
    }
    if (Array.isArray(message?.tools)) {
      for (const url of collectArtifactUrlsFromToolEvents(message.tools)) {
        pushUrl(url)
      }
    }
    if (Array.isArray(message?.segments)) {
      for (const segment of message.segments) {
        if (segment?.type === 'tools' && Array.isArray(segment?.tools)) {
          for (const url of collectArtifactUrlsFromToolEvents(segment.tools)) {
            pushUrl(url)
          }
        }
        if (segment?.type === 'text') {
          for (const url of extractLocalhostUrlsFromText(segment.content)) {
            pushUrl(url)
          }
        }
      }
    }
    for (const url of extractLocalhostUrlsFromText(message?.content)) {
      pushUrl(url)
    }
  }

  return [...urlSet]
}
