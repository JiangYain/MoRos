export const IMAGE_ARTIFACT_FILE_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']
export const TEXT_ARTIFACT_FILE_EXTENSIONS = [
  '.html', '.htm',
  '.json', '.md', '.markdown', '.txt', '.csv',
  '.yaml', '.yml', '.xml', '.toml', '.ini', '.log',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.scss',
  '.py', '.sh',
]
export const ARTIFACT_FILE_EXTENSIONS = [
  ...IMAGE_ARTIFACT_FILE_EXTENSIONS,
  ...TEXT_ARTIFACT_FILE_EXTENSIONS,
]

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const ARTIFACT_EXT_PATTERN = '(?:html?|json|md|markdown|txt|csv|ya?ml|xml|toml|ini|log|js|jsx|ts|tsx|css|scss|py|sh|svg|png|jpe?g|webp|gif)'
const WINDOWS_ABS_ARTIFACT_PATH_REGEX = new RegExp(`[A-Za-z]:[\\\\/][^"'\\\`\\n\\r<>|?*]+\\.${ARTIFACT_EXT_PATTERN}\\b`, 'gi')
const POSIX_ABS_ARTIFACT_PATH_REGEX = new RegExp(`/[^"'\\\`\\n\\r<>|?*]+\\.${ARTIFACT_EXT_PATTERN}\\b`, 'gi')
const RELATIVE_ARTIFACT_PATH_REGEX = new RegExp(`(?:^|[\\s("'\\\`])((?:\\.{1,2}[\\\\/])?[^"'\\\`\\n\\r<>|?*:]+\\.${ARTIFACT_EXT_PATTERN})(?=$|[\\s)"'\\\`,.:;!?])`, 'gi')
const LOCALHOST_URL_REGEX = /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d{2,5})?(?:\/[^\s"'`<>]*)?/gi

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
  return `${base}\n\nAttached file paths:\n${lines.join('\n')}`
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
  if (/^[A-Za-z]:\//.test(text)) return text.replace(/\//g, '\\')
  return text
}

const normalizeRelativeArtifactPath = (value) => {
  return normalizeAttachmentPath(value)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .trim()
}

const stripEnclosingQuotes = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")) || (text.startsWith('`') && text.endsWith('`'))) {
    return text.slice(1, -1).trim()
  }
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
  const matches = [
    ...(text.match(WINDOWS_ABS_ARTIFACT_PATH_REGEX) || []),
    ...(text.match(POSIX_ABS_ARTIFACT_PATH_REGEX) || []),
  ]
  return matches
    .map((item) => normalizeAttachmentPath(item))
    .filter((item) => isAbsolutePath(item) && hasArtifactLikeExtension(item))
}

const extractRelativeArtifactPathsFromText = (value) => {
  const text = String(value || '')
  if (!text) return []
  const matches = []
  let match
  while ((match = RELATIVE_ARTIFACT_PATH_REGEX.exec(text)) !== null) {
    const rawCandidate = stripEnclosingQuotes(match[1] || '')
    if (!rawCandidate) continue
    if (!looksLikeRelativePath(rawCandidate)) continue
    if (rawCandidate.includes(':')) continue
    const candidate = normalizeRelativeArtifactPath(rawCandidate)
    if (!candidate) continue
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
  const raw = stripEnclosingQuotes(value)
  if (!raw) return ''

  const absoluteMatches = extractAbsoluteArtifactPathsFromText(raw)
  if (absoluteMatches.length > 0) return absoluteMatches[0]

  const normalized = normalizeAttachmentPath(raw)
  if (isAbsolutePath(normalized) && hasArtifactLikeExtension(normalized)) {
    return normalized
  }

  if (!includeRelative) return ''

  const relativeMatches = extractRelativeArtifactPathsFromText(raw)
  if (relativeMatches.length > 0) return relativeMatches[0]

  if (!looksLikeRelativePath(raw)) return ''
  if (raw.includes(':')) return ''

  const normalizedRelative = normalizeRelativeArtifactPath(raw)
  if (!normalizedRelative) return ''
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

const collectArtifactPathsFromTool = (tool, options = {}) => {
  const includeRelative = Boolean(options?.includeRelative)
  const pathSet = new Set()
  const pushPath = (value) => {
    const normalized = sanitizeArtifactPathCandidate(value, { includeRelative })
    if (!normalized) return
    if (!isAbsolutePath(normalized) && !includeRelative) return
    if (/^[A-Za-z]+:\/\//.test(normalized)) return
    pathSet.add(normalized)
  }

  pushPath(tool?.path)
  pushPath(tool?.args?.path)

  for (const pathValue of extractArtifactPathsFromText(tool?.outputPreview, { includeRelative })) {
    pushPath(pathValue)
  }
  for (const pathValue of extractArtifactPathsFromText(tool?.output, { includeRelative })) {
    pushPath(pathValue)
  }

  return [...pathSet]
}

export const collectArtifactPathsFromToolEvents = (tools, options = {}) => {
  const includeRelative = Boolean(options?.includeRelative)
  const pathSet = new Set()
  for (const tool of Array.isArray(tools) ? tools : []) {
    for (const pathValue of collectArtifactPathsFromTool(tool, { includeRelative })) {
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
  const pathSet = new Set()
  const pushPath = (value) => {
    const normalized = sanitizeArtifactPathCandidate(value, { includeRelative })
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
    for (const pathValue of collectArtifactPathsFromTool(tool, { includeRelative })) {
      pushPath(pathValue)
    }
  }

  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== 'assistant') continue
    if (Array.isArray(message?.tools)) {
      for (const tool of message.tools) collectFromTool(tool)
    }
    if (Array.isArray(message?.segments)) {
      for (const segment of message.segments) {
        if (segment?.type === 'tools' && Array.isArray(segment?.tools)) {
          for (const tool of segment.tools) collectFromTool(tool)
        }
        if (segment?.type === 'text') {
          for (const pathValue of extractArtifactPathsFromText(segment?.content, { includeRelative })) {
            pushPath(pathValue)
          }
        }
      }
    }
    for (const pathValue of extractArtifactPathsFromText(message?.content, { includeRelative })) {
      pushPath(pathValue)
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
