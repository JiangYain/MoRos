import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, StopCircle } from 'lucide-react'
import './ChatComposer.css'

const MIN_HEIGHT = 64
const MAX_HEIGHT = 320

const resolveMenuSectionType = (optionId) => {
  const id = String(optionId || '')
  if (id.startsWith('action:')) return 'action'
  if (id.startsWith('provider:')) return 'provider'
  if (id.startsWith('model:')) return 'model'
  return 'general'
}

const resolveMenuSectionTitle = (sectionType) => {
  if (sectionType === 'action') return 'Action'
  if (sectionType === 'provider') return 'Provider'
  if (sectionType === 'model') return 'Model'
  return 'Options'
}

const resolveOptionLabel = (label) => {
  return String(label || '')
    .replace(/^Provider:\s*/i, '')
    .replace(/^Model:\s*/i, '')
    .trim()
}

const MODEL_LOGO_MAP = {
  'gpt-5.4': '/assets/model-icons/openai.png',
  'gpt-5.3-codex': '/assets/model-icons/openai.png',
  'gemini-3.1-pro-preview': '/assets/model-icons/gemini.png',
  'claude-sonnet-4.6': '/assets/model-icons/claude.png',
  'gpt-4o': '/assets/model-icons/openai.png',
  'glm-5': '/assets/model-icons/glm5.png',
  'kimi-k2.5': '/assets/model-icons/kimi.svg',
  'minimax-m2.5': '/assets/model-icons/minimax.svg',
}

const resolveModelLogo = (optionId) => {
  const id = String(optionId || '').replace(/^model:/, '')
  const logoUrl = MODEL_LOGO_MAP[id]
  if (!logoUrl) return null
  return <img src={logoUrl} alt="" className="model-logo" />
}

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
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
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
  const addMenuSections = React.useMemo(() => {
    if (!hasAddMenu) return []
    const sections = []
    let current = []
    for (const option of addMenuOptions) {
      if (option?.type === 'separator') {
        if (current.length > 0) sections.push(current)
        current = []
        continue
      }
      if (!option || !option.id) continue
      current.push(option)
    }
    if (current.length > 0) sections.push(current)
    return sections.map((items, index) => {
      const sectionType = resolveMenuSectionType(items[0]?.id)
      return {
        id: `${sectionType}-${index}`,
        title: resolveMenuSectionTitle(sectionType),
        items,
      }
    })
  }, [hasAddMenu, addMenuOptions])

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
          {addMenuSections.map((section) => (
            <div key={section.id} className="chat-composer-add-menu-section">
              <div className="chat-composer-add-menu-section-title">{section.title}</div>
              {section.items.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`chat-composer-add-menu-item ${option.selected ? 'selected' : ''}`}
                  onClick={() => handleAddMenuSelect(option)}
                  disabled={option.disabled}
                >
                  {resolveModelLogo(option.id)}
                  <span className="chat-composer-add-menu-item-label">{resolveOptionLabel(option.label)}</span>
                  {option.selected && <span className="chat-composer-add-menu-item-check" aria-hidden />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div
        className="chat-composer-resize-handle"
        onMouseDown={handleResizeStart}
      />
      <form
        className={wrapperClassName}
        onSubmit={handleSubmit}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={composerHeight > MIN_HEIGHT ? { minHeight: composerHeight + 'px', alignItems: 'flex-end' } : undefined}
      >
        <button
          type="button"
          className={`chat-input-action chat-composer-add ${isAddMenuOpen ? 'open' : ''}`}
          onClick={handleAddButtonClick}
          title={attachTitle}
          disabled={disabled || isLoading}
          aria-expanded={hasAddMenu ? isAddMenuOpen : undefined}
        >
          <span className="chat-composer-add-glyph" aria-hidden>/</span>
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
