import { useEffect } from 'react'

export function useTableOfContents({ content, isEditing, viewMode, previewPaneRef, contentRef, onSectionChange }) {
  useEffect(() => {
    const handleScroll = () => {
      const container = viewMode === 'split' ? previewPaneRef.current : contentRef.current
      if (!container || isEditing) return
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
      const scrollTop = container.scrollTop + 100
      let activeHeading = null
      headings.forEach(heading => {
        if (heading.offsetTop <= scrollTop) {
          activeHeading = heading
        }
      })
      if (activeHeading && onSectionChange) {
        onSectionChange(activeHeading.id)
      }
    }
    const container = viewMode === 'split' ? previewPaneRef.current : contentRef.current
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [onSectionChange, isEditing, viewMode])

  useEffect(() => {
    const container = viewMode === 'split' ? previewPaneRef.current : contentRef.current
    if (!container || isEditing) return
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    headings.forEach(heading => {
      if (!heading.id) {
        const text = heading.textContent.trim()
        const id = text
          .toLowerCase()
          .replace(/[^\u4e00-\u9fa5a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
        heading.id = id || `heading-${Math.random().toString(36).substr(2, 9)}`
      }
    })
  }, [content, isEditing, viewMode])
}


