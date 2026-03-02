import { useCallback } from 'react'
import { filesApi } from '../../utils/api'

export function useMarkdownActions(textareaRef, content, setContent, currentFile) {
  const insertAtCursor = useCallback((text) => {
    const el = textareaRef.current
    if (!el) { setContent((prev) => prev + text); return }
    const start = el.selectionStart || 0
    const end = el.selectionEnd || 0
    const next = content.slice(0, start) + text + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      try { el.setSelectionRange(pos, pos) } catch {}
    })
  }, [textareaRef, content, setContent])

  const applyInlineWrap = useCallback((prefix, suffix, placeholder = '') => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart || 0
    const end = el.selectionEnd || 0
    const selected = content.slice(start, end)
    const inner = selected || placeholder
    const wrapped = `${prefix}${inner}${suffix}`
    const next = content.slice(0, start) + wrapped + content.slice(end)
    setContent(next)
    const cursorStart = start + prefix.length
    const cursorEnd = start + prefix.length + inner.length
    requestAnimationFrame(() => {
      el.focus()
      try { el.setSelectionRange(cursorStart, cursorEnd) } catch {}
    })
  }, [textareaRef, content, setContent])

  const applyLineTransform = useCallback((transformer) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart || 0
    const end = el.selectionEnd || 0
    const selStartLineIdx = (content.slice(0, start).lastIndexOf('\n')) + 1
    const selectedText = content.slice(selStartLineIdx, end)
    const lines = selectedText.split('\n')
    const transformed = transformer(lines).join('\n')
    const next = content.slice(0, selStartLineIdx) + transformed + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      el.focus()
      const newSelStart = selStartLineIdx
      const newSelEnd = selStartLineIdx + transformed.length
      try {
        if (start !== end) {
          el.setSelectionRange(newSelStart, newSelEnd)
        } else {
          el.setSelectionRange(newSelEnd, newSelEnd)
        }
      } catch {}
    })
  }, [textareaRef, content, setContent])

  const toggleHeading = useCallback((level) => {
    applyLineTransform((lines) => lines.map((line) => {
      const trimmed = line.replace(/^\s*#+\s+/, '')
      const prefix = '#'.repeat(level) + ' '
      return prefix + trimmed
    }))
  }, [applyLineTransform])

  const toggleUnorderedList = useCallback(() => {
    applyLineTransform((lines) => lines.map((line) => {
      if (/^\s*[-*+]\s+/.test(line)) return line.replace(/^\s*[-*+]\s+/, '')
      return (line.trim() ? '- ' : '- ') + line.replace(/^\s+/, '')
    }))
  }, [applyLineTransform])

  const toggleOrderedList = useCallback(() => {
    applyLineTransform((lines) => lines.map((line, idx) => `${idx + 1}. ${line.replace(/^\s*\d+\.\s+/, '')}`))
  }, [applyLineTransform])

  const toggleChecklist = useCallback(() => {
    applyLineTransform((lines) => lines.map((line) => {
      if (/^\s*- \[( |x|X)]\s+/.test(line)) return line.replace(/^\s*- \[( |x|X)]\s+/, '')
      return `- [ ] ${line.replace(/^\s+/, '')}`
    }))
  }, [applyLineTransform])

  const toggleQuote = useCallback(() => {
    applyLineTransform((lines) => lines.map((line) => (/^\s*>\s?/.test(line) ? line.replace(/^\s*>\s?/, '') : `> ${line}`)))
  }, [applyLineTransform])

  const insertCodeBlock = useCallback(async () => {
    const lang = window.prompt('代码语言（可留空）：', '') || ''
    applyInlineWrap(```${lang ? lang : ''}\n`, '\n```', '输入代码')
  }, [applyInlineWrap])

  const insertLink = useCallback(async () => {
    const url = window.prompt('输入链接地址：', 'https://')
    if (!url) return
    const el = textareaRef.current
    const start = el?.selectionStart || 0
    const end = el?.selectionEnd || 0
    const selected = content.slice(start, end) || '描述'
    const md = `[${selected}](${url})`
    const next = content.slice(0, start) + md + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => { try { el?.setSelectionRange(start + 1, start + 1 + selected.length) } catch {} })
  }, [textareaRef, content, setContent])

  const triggerImageUpload = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const parentPath = currentFile?.path ? currentFile.path.replace(/[\\/][^\\/]+$/, '') : ''
        const { path: rel } = await filesApi.uploadFile(file, parentPath, true)
        const url = filesApi.getRawFileUrl(rel)
        const alt = file.name.replace(/\.[^.]+$/, '')
        insertAtCursor(`![${alt}](${url})`)
      } catch (err) {
        alert('图片上传失败: ' + (err.message || '未知错误'))
      }
    }
    input.click()
  }, [currentFile, insertAtCursor])

  const insertTable = useCallback(() => {
    const tpl = '\n| 列1 | 列2 |\n| --- | --- |\n| 值1 | 值2 |\n'
    insertAtCursor(tpl)
  }, [insertAtCursor])

  const insertHr = useCallback(() => { insertAtCursor('\n\n---\n\n') }, [insertAtCursor])

  return {
    insertAtCursor,
    applyInlineWrap,
    applyLineTransform,
    toggleHeading,
    toggleUnorderedList,
    toggleOrderedList,
    toggleChecklist,
    toggleQuote,
    insertCodeBlock,
    insertLink,
    triggerImageUpload,
    insertTable,
    insertHr,
  }
}


