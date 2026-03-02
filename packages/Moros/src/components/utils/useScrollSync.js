import { useRef } from 'react'

// 增强版滚动同步 Hook
// 规则：
// 1. 编辑器滚动时，预览区会根据一个相对偏移量同步滚动。
// 2. 预览区独立滚动时，会更新这个相对偏移量。
// 3. 切换文件或重载后，会恢复上次的滚动位置和偏移量。
export function useScrollSync(viewMode, textareaRef, previewPaneRef, filePath) {
  const isSyncingRef = useRef(false)
  const scrollOffsetRatioRef = useRef(0) // 存储 previewRatio - editorRatio

  const getKey = () => (filePath ? `markov-scroll:${filePath}` : null)
  const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))

  const saveRatios = (editor, preview) => {
    try {
      const er = clamp01(editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight))
      const pr = clamp01(preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight))
      const key = getKey()
      if (key) localStorage.setItem(key, JSON.stringify({ editor: er, preview: pr }))
    } catch {}
  }

  const restoreScroll = () => {
    if (viewMode !== 'split') return
    const editor = textareaRef.current
    const preview = previewPaneRef.current
    if (!editor || !preview) return

    try {
      const key = getKey()
      const raw = key ? localStorage.getItem(key) : null
      if (raw) {
        const { editor: er = 0, preview: pr = 0 } = JSON.parse(raw)
        isSyncingRef.current = true
        try {
          editor.scrollTop = clamp01(er) * (editor.scrollHeight - editor.clientHeight)
          preview.scrollTop = clamp01(pr) * (preview.scrollHeight - preview.clientHeight)
          // 恢复后，计算并设置初始偏移量
          scrollOffsetRatioRef.current = clamp01(pr) - clamp01(er)
        } finally {
          setTimeout(() => { isSyncingRef.current = false }, 50) // 稍长延迟以防竞争
        }
      } else {
        scrollOffsetRatioRef.current = 0
      }
    } catch (e) {
      // console.error('Failed to restore scroll position:', e)
      scrollOffsetRatioRef.current = 0
    }
  }

  const syncScroll = (source) => {
    if (viewMode !== 'split' || isSyncingRef.current) return
    const editor = textareaRef.current
    const preview = previewPaneRef.current
    if (!editor || !preview) return

    const editorRatio = clamp01(editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight))
    const previewRatio = clamp01(preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight))

    isSyncingRef.current = true

    if (source === 'editor') {
      // 编辑器滚动，根据存储的偏移量调整预览区
      const newPreviewScrollTop = (editorRatio + scrollOffsetRatioRef.current) * (preview.scrollHeight - preview.clientHeight)
      preview.scrollTop = newPreviewScrollTop
    } else if (source === 'preview') {
      // 预览区滚动，更新偏移量
      scrollOffsetRatioRef.current = previewRatio - editorRatio
    }

    saveRatios(editor, preview) // 始终保存两边的绝对位置

    setTimeout(() => { isSyncingRef.current = false }, 0)
  }

  return { syncScroll, restoreScroll }
}

