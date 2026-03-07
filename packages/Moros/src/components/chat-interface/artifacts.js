export const ARTIFACT_FILE_EXTENSIONS = ['.html', '.htm', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif']

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const WINDOWS_ABS_ARTIFACT_PATH_REGEX = /[A-Za-z]:[\\/][^"'`\n\r<>|?*]+\.(?:html?|svg|png|jpe?g|webp|gif)\b/g
const POSIX_ABS_ARTIFACT_PATH_REGEX = /\/[^"'`\n\r<>|?*]+\.(?:html?|svg|png|jpe?g|webp|gif)\b/g

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

export const normalizeAttachmentPath = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^[A-Za-z]:\//.test(text)) return text.replace(/\//g, '\\')
  return text
}

const hasArtifactLikeExtension = (pathValue) => {
  const normalized = String(pathValue || '').trim().toLowerCase()
  if (!normalized) return false
  return ARTIFACT_FILE_EXTENSIONS.some((ext) => normalized.endsWith(ext))
}

export const isArtifactWorkspaceCandidate = (item) => {
  if (!item || item.type !== 'file') return false
  const pathValue = String(item.path || '').replace(/\\/g, '/').toLowerCase()
  const nameValue = String(item.name || '').toLowerCase()
  if (!hasArtifactLikeExtension(pathValue) && !hasArtifactLikeExtension(nameValue)) return false
  if (nameValue === 'bundle.html') return true
  if (nameValue.endsWith('.artifact.html')) return true
  if (pathValue.includes('/artifacts/')) return true
  if (pathValue.includes('/pi-agent-runtime/')) return true
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

export const collectArtifactPathsFromMessages = (messages) => {
  const pathSet = new Set()
  const pushPath = (value) => {
    const normalized = normalizeAttachmentPath(value)
    if (!normalized) return
    if (!isAbsolutePath(normalized)) return
    if (!hasArtifactLikeExtension(normalized)) return
    pathSet.add(normalized)
  }
  const collectFromTool = (tool) => {
    pushPath(tool?.path)
    pushPath(tool?.args?.path)
    for (const pathValue of extractAbsoluteArtifactPathsFromText(tool?.outputPreview)) {
      pushPath(pathValue)
    }
    for (const pathValue of extractAbsoluteArtifactPathsFromText(tool?.output)) {
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
          for (const pathValue of extractAbsoluteArtifactPathsFromText(segment?.content)) {
            pushPath(pathValue)
          }
        }
      }
    }
    for (const pathValue of extractAbsoluteArtifactPathsFromText(message?.content)) {
      pushPath(pathValue)
    }
  }

  return [...pathSet]
}
