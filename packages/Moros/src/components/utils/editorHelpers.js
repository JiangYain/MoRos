export const escapeHtml = (s) => (s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\u00A0/g, ' ')

export const findCurrentLineRange = (textareaRef, content) => {
  const el = textareaRef.current
  if (!el) return { lineStart: 0, lineEnd: (content || '').length, cursor: 0 }
  const pos = el.selectionStart || 0
  const ls = (content || '').lastIndexOf('\n', Math.max(0, pos - 1)) + 1
  const le = (content || '').indexOf('\n', pos)
  return { lineStart: ls, lineEnd: le === -1 ? (content || '').length : le, cursor: pos }
}

export const isImageFile = (filePath) => {
  if (!filePath) return false
  const ext = filePath.toLowerCase().split('.').pop()
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
}

export const calculateStats = (content) => {
  const plain = (content || '').replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim()
  const words = plain ? plain.split(' ').filter(Boolean).length : 0
  const chars = (content || '').length
  return { words, chars }
}

export const getParentDirName = (currentFile) => {
  if (!currentFile?.path) return ''
  const parts = currentFile.path.split(/[\\/]/)
  return parts.length > 1 ? parts[parts.length - 2] : ''
}


