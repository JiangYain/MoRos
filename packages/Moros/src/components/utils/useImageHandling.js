import { useEffect } from 'react'
import { filesApi } from '../../utils/api'

// 辅助函数：从文件路径中提取父目录路径
function getParentPath(filePath) {
  if (!filePath) return ''
  // 统一使用 / 作为分隔符
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlashIndex = normalized.lastIndexOf('/')
  // 如果没有斜杠，说明文件在根目录，返回空字符串
  if (lastSlashIndex === -1) return ''
  // 返回最后一个斜杠之前的部分
  return normalized.substring(0, lastSlashIndex)
}

export function useImageHandling({ isEditing, currentFile, textareaRef, content, setContent }) {
  useEffect(() => {
    const handlePaste = async (event) => {
      if (!isEditing) return
      if (!event.clipboardData) return
      const items = event.clipboardData.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (!file) continue

          event.preventDefault()
          try {
            const parentPath = getParentPath(currentFile?.path)
            const { path: rel } = await filesApi.uploadFile(file, parentPath, true)
            const url = filesApi.getRawFileUrl(rel)
            const alt = file.name.replace(/\.[^.]+$/, '')
            const insertion = `![${alt}](${url})\n`
            if (textareaRef.current) {
              const el = textareaRef.current
              const start = el.selectionStart || content.length
              const end = el.selectionEnd || content.length
              const newContent = content.slice(0, start) + insertion + content.slice(end)
              setContent(newContent)
              requestAnimationFrame(() => {
                el.focus()
                try { el.setSelectionRange(start + insertion.length, start + insertion.length) } catch {}
              })
            } else {
              setContent((prev) => prev + insertion)
            }
          } catch (err) {
            console.error('图片上传失败:', err)
            alert('图片上传失败: ' + (err.message || '未知错误'))
          }
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [isEditing, currentFile, textareaRef, content, setContent])

  const handleEditorDrop = async (event) => {
    if (!isEditing) return
    if (!event.dataTransfer?.files?.length) return
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    for (const file of files) {
      try {
        const parentPath = getParentPath(currentFile?.path)
        const { path: rel } = await filesApi.uploadFile(file, parentPath, true)
        const url = filesApi.getRawFileUrl(rel)
        const alt = file.name.replace(/\.[^.]+$/, '')
        setContent((prev) => prev + `![${alt}](${url})\n`)
      } catch (err) {
        console.error('图片上传失败:', err)
        alert('图片上传失败: ' + (err.message || '未知错误'))
      }
    }
  }

  const handleEditorDragOver = (e) => {
    if (!isEditing) return
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault()
    }
  }

  return { handleEditorDrop, handleEditorDragOver }
}


