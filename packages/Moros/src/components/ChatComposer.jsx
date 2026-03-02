import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Plus, StopCircle } from 'lucide-react'
import './ChatComposer.css'

const MIN_HEIGHT = 56
const MAX_HEIGHT = 320

function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  onStop,
  onAttach,
  onPaste,
  placeholder,
  disabled = false,
  canSubmit = false,
  isLoading = false,
  multiline = false,
  rows = 1,
  autoFocus = false,
  onKeyDown,
  inputRef,
  className = '',
  dragOver = false,
  addMenuOptions = null,
  onAddMenuSelect,
  attachTitle = 'Attach file',
  submitTitle = 'Send',
  stopTitle = 'Stop',
}) {
  const inputValue = String(value || '')
  const canSendNow = !disabled && canSubmit
  const sendDisabled = !isLoading && !canSendNow
  const [composerHeight, setComposerHeight] = useState(MIN_HEIGHT)
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(MIN_HEIGHT)
  const addMenuRef = useRef(null)
  const hasAddMenu = Array.isArray(addMenuOptions) && addMenuOptions.length > 0

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    isDraggingRef.current = true
    startYRef.current = e.clientY
    startHeightRef.current = composerHeight
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }, [composerHeight])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return
      const delta = startYRef.current - e.clientY
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta))
      setComposerHeight(next)
    }
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    if (!isAddMenuOpen) return
    const handleOutsideClick = (event) => {
      if (!addMenuRef.current) return
      if (addMenuRef.current.contains(event.target)) return
      setIsAddMenuOpen(false)
    }
    const handleEsc = (event) => {
      if (event.key === 'Escape') setIsAddMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isAddMenuOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isLoading) {
      onStop?.()
      return
    }
    if (!sendDisabled) {
      onSubmit?.()
    }
  }

  const useMultiline = multiline || composerHeight > MIN_HEIGHT

  const handleAddButtonClick = () => {
    if (hasAddMenu) {
      setIsAddMenuOpen((open) => !open)
      return
    }
    onAttach?.()
  }

  const handleAddMenuSelect = (option) => {
    if (!option || option.type === 'separator' || option.disabled) return
    onAddMenuSelect?.(option.id, option)
    setIsAddMenuOpen(false)
  }

  const wrapperClassName = [
    'chat-composer',
    'chat-landing-card',
    'chat-input-wrapper',
    dragOver ? 'drag-over' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="chat-composer-wrapper" ref={addMenuRef}>
      {hasAddMenu && isAddMenuOpen && (
        <div className="chat-composer-add-menu">
          {addMenuOptions.map((option) => {
            if (option?.type === 'separator') {
              return <div key={option.id} className="chat-composer-add-menu-separator" />
            }
            return (
              <button
                key={option.id}
                type="button"
                className={`chat-composer-add-menu-item ${option.selected ? 'selected' : ''}`}
                onClick={() => handleAddMenuSelect(option)}
                disabled={option.disabled}
              >
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
      <div
        className="chat-composer-resize-handle"
        onMouseDown={handleResizeStart}
      />
      <form
        className={wrapperClassName}
        onSubmit={handleSubmit}
        style={composerHeight > MIN_HEIGHT ? { minHeight: composerHeight + 'px', alignItems: 'flex-end' } : undefined}
      >
        <button
          type="button"
          className="chat-input-action chat-composer-add"
          onClick={handleAddButtonClick}
          title={attachTitle}
          disabled={disabled || isLoading}
        >
          <Plus size={18} />
        </button>

        {useMultiline ? (
          <textarea
            ref={inputRef}
            className="chat-composer-input chat-input"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => onValueChange?.(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={disabled}
            rows={rows}
            autoFocus={autoFocus}
            style={composerHeight > MIN_HEIGHT ? { height: (composerHeight - 24) + 'px' } : undefined}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="chat-composer-input chat-landing-input"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => onValueChange?.(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={disabled}
            autoFocus={autoFocus}
          />
        )}

        <button
          type="submit"
          className={`chat-send-btn ${isLoading ? 'loading' : ''}`}
          disabled={sendDisabled}
          title={isLoading ? stopTitle : submitTitle}
        >
          {isLoading ? (
            <StopCircle size={18} strokeWidth={2.5} />
          ) : (
            <ArrowUp size={18} strokeWidth={2.5} />
          )}
        </button>
      </form>
    </div>
  )
}

export default ChatComposer
