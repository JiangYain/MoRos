import { useEffect, useMemo, useState } from 'react'
import { filesApi } from '../../utils/api'
import { isImageFile } from './editorHelpers'
import { isWhiteboardFile } from '../Whiteboard'

export function useFileContent({ currentFile, content, setContent, setOriginalContent, setViewMode, onFileSave }) {
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadFileContent = async () => {
      if (currentFile?.path) {
        if (isWhiteboardFile(currentFile.path)) {
          setContent('')
          setOriginalContent('')
          setViewMode('preview')
          return
        }
        if (isImageFile(currentFile.path)) {
          setContent('')
          setOriginalContent('')
          setViewMode('preview')
          return
        }
        try {
          const fileContent = await filesApi.readFile(currentFile.path)
          setContent(fileContent)
          setOriginalContent(fileContent)
          // 默认进入分屏模式（编辑 + 预览）
          setViewMode('split')
        } catch (error) {
          console.error('加载文件内容失败:', error)
          setContent('')
          setOriginalContent('')
          // 读取失败时保持预览/知识面板，避免空白编辑器误导
          setViewMode('preview')
        }
      } else {
        setContent('')
        setOriginalContent('')
        setViewMode('preview')
      }
    }
    loadFileContent()
  }, [currentFile])

  const handleSave = async () => {
    if (!currentFile?.path || content === undefined) return
    try {
      setSaving(true)
      await filesApi.saveFile(currentFile.path, content)
      setOriginalContent(content)
      onFileSave?.(currentFile, content)
    } catch (error) {
      console.error('保存文件失败:', error)
      alert('保存失败: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = useMemo(() => content !== undefined && content !== null && content !== (typeof originalContent === 'undefined' ? content : undefined), [])

  // 自动保存：停止输入 2s 后保存（仅文本/Markdown）
  useEffect(() => {
    if (!currentFile?.path) return
    if (isWhiteboardFile(currentFile?.path)) return
    const t = setTimeout(() => { handleSave() }, 2000)
    return () => clearTimeout(t)
  }, [content, currentFile?.path])

  return { saving, handleSave }
}
