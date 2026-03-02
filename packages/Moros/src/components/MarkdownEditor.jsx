import React from 'react'

function MarkdownEditor({
  textareaRef,
  value,
  onChange,
  placeholder,
  onKeyDown,
  onClick,
  onDrop,
  onDragOver,
  onScroll,
  className = 'markdown-editor',
}) {
  return (
    <textarea
      ref={textareaRef}
      className={className}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      spellCheck={false}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onScroll={onScroll}
    />
  )
}

export default MarkdownEditor


