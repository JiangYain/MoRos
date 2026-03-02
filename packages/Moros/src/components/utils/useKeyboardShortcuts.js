import { useEffect } from 'react'

export function useKeyboardShortcuts({ handleSave, setViewMode, applyInlineWrap }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if (e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        setViewMode((m) => (m === 'preview' ? 'split' : 'preview'))
      }
      if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        applyInlineWrap('**', '**', '加粗')
      }
      if (e.ctrlKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault()
        applyInlineWrap('*', '*', '斜体')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, setViewMode, applyInlineWrap])
}


