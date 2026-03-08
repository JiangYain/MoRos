import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, StopCircle } from 'lucide-react'
import { CHAT_MODELS_BY_PROVIDER } from '../utils/chatProvider'
import './ChatComposer.css'

const MIN_HEIGHT = 64
const MAX_HEIGHT = 320

const PROVIDER_ICON_MAP = {
  'github-copilot': '/assets/provider-icons/github.png',
  'openai-codex': '/assets/provider-icons/codex.png',
  'opencode-go': '/assets/provider-icons/opencode.png',
}

const MODEL_ICON_MAP = {
  'gpt-5.3-codex': '/assets/model-icons/openai.png',
  'gemini-3.1-pro-preview': '/assets/model-icons/gemini.png',
  'claude-sonnet-4.6': '/assets/model-icons/claude.png',
  'gpt-4o': '/assets/model-icons/openai.png',
  'gpt-5.4': '/assets/model-icons/codex.png',
  'glm-5': '/assets/model-icons/glm5.png',
  'kimi-k2.5': '/assets/model-icons/kimi.svg',
  'minimax-m2.5': '/assets/model-icons/minimax.svg',
}

const parseOptionEntityId = (optionId, prefix) => {
  const value = String(optionId || '')
  if (!value.startsWith(prefix)) return ''
  return value.slice(prefix.length).trim()
}

const resolveOptionLabel = (label) => {
  return String(label || '')
    .replace(/^Provider:\s*/i, '')
    .replace(/^Model:\s*/i, '')
    .trim()
}

function ProviderIcon({ providerId, label }) {
  const [iconFailed, setIconFailed] = useState(false)
  const iconUrl = PROVIDER_ICON_MAP[providerId]
  const fallback = String(label || providerId || '?').trim().charAt(0).toUpperCase()

  if (!iconUrl || iconFailed) {
    return <span className="chat-composer-provider-icon-fallback" aria-hidden>{fallback || '?'}</span>
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className="chat-composer-provider-icon-image"
      onError={() => setIconFailed(true)}
      loading="lazy"
    />
  )
}

function ModelIcon({ modelId, label }) {
  const [iconFailed, setIconFailed] = useState(false)
  const iconUrl = MODEL_ICON_MAP[modelId]
  const fallback = String(label || modelId || '?').trim().charAt(0).toUpperCase()

  if (!iconUrl || iconFailed) {
    return <span className="chat-composer-provider-icon-fallback" aria-hidden>{fallback || '?'}</span>
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className="chat-composer-provider-icon-image"
      onError={() => setIconFailed(true)}
      loading="lazy"
    />
  )
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
  const [expandedProviderId, setExpandedProviderId] = useState('')
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(MIN_HEIGHT)
  const addMenuRef = useRef(null)
  const providerOptions = React.useMemo(() => {
    if (!Array.isArray(addMenuOptions)) return []
    return addMenuOptions
      .filter((option) => option && option.id && String(option.id).startsWith('provider:'))
      .map((option) => {
        const providerId = parseOptionEntityId(option.id, 'provider:')
        return {
          ...option,
          providerId,
          label: resolveOptionLabel(option.label),
          rawOption: option,
        }
      })
      .filter((option) => option.providerId)
  }, [addMenuOptions])

  const visibleProviderOptions = React.useMemo(() => {
    if (providerOptions.length === 0) return []
    return providerOptions
  }, [providerOptions])

  const modelOptionLookup = React.useMemo(() => {
    const modelMap = new Map()
    if (!Array.isArray(addMenuOptions)) return modelMap
    for (const option of addMenuOptions) {
      const modelId = parseOptionEntityId(option?.id, 'model:')
      if (!modelId) continue
      modelMap.set(modelId, {
        ...option,
        modelId,
        label: resolveOptionLabel(option.label),
      })
    }
    return modelMap
  }, [addMenuOptions])

  const selectedProviderId = React.useMemo(() => {
    const selectedOption = providerOptions.find((option) => option.selected)
    return selectedOption?.providerId || ''
  }, [providerOptions])

  const selectedModelId = React.useMemo(() => {
    for (const option of modelOptionLookup.values()) {
      if (option.selected) return option.modelId
    }
    return ''
  }, [modelOptionLookup])

  const providerModelsById = React.useMemo(() => {
    const mapped = {}
    for (const providerOption of providerOptions) {
      const staticModels = CHAT_MODELS_BY_PROVIDER[providerOption.providerId] || []
      mapped[providerOption.providerId] = staticModels.map((model) => {
        const fromOptions = modelOptionLookup.get(model.id)
        return {
          id: `model:${model.id}`,
          modelId: model.id,
          label: fromOptions?.label || model.label,
          selected: fromOptions ? Boolean(fromOptions.selected) : selectedModelId === model.id,
          disabled: Boolean(fromOptions?.disabled),
        }
      })
    }
    return mapped
  }, [providerOptions, modelOptionLookup, selectedModelId])

  const hasAddMenu = visibleProviderOptions.length > 0

  const expandedProviderOption = React.useMemo(() => {
    if (!expandedProviderId) return null
    return providerOptions.find((option) => option.providerId === expandedProviderId) || null
  }, [expandedProviderId, providerOptions])

  const expandedProviderModels = React.useMemo(() => {
    if (!expandedProviderId) return []
    return providerModelsById[expandedProviderId] || []
  }, [expandedProviderId, providerModelsById])

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

  useEffect(() => {
    if (isAddMenuOpen) {
      setExpandedProviderId(selectedProviderId || '')
    }
  }, [isAddMenuOpen, selectedProviderId])

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

  const handleAddMenuSelect = (option, shouldCloseMenu = true) => {
    if (!option || option.type === 'separator' || option.disabled) return
    onAddMenuSelect?.(option.id, option)
    if (shouldCloseMenu) {
      setIsAddMenuOpen(false)
    }
  }

  const handleProviderSelect = (providerOption) => {
    if (!providerOption) return
    if (!providerOption.disabled) {
      handleAddMenuSelect(providerOption.rawOption, false)
    }
    setExpandedProviderId(providerOption.providerId === expandedProviderId ? '' : providerOption.providerId)
  }

  const handleModelSelect = (providerOption, modelOption) => {
    if (!providerOption || !modelOption || modelOption.disabled) return
    handleAddMenuSelect(providerOption.rawOption, false)
    handleAddMenuSelect(
      {
        id: modelOption.id,
        label: modelOption.label,
      },
      true,
    )
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
          <div className="chat-composer-provider-strip" role="list" aria-label="Providers">
            {providerOptions.map((providerOption) => (
              <button
                key={providerOption.id}
                type="button"
                role="listitem"
                className={[
                  'chat-composer-provider-chip',
                  providerOption.providerId === selectedProviderId ? 'selected' : '',
                  providerOption.providerId === expandedProviderId ? 'expanded' : '',
                  providerOption.disabled ? 'unavailable' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleProviderSelect(providerOption)}
                title={providerOption.label}
                aria-label={providerOption.label}
              >
                <ProviderIcon providerId={providerOption.providerId} label={providerOption.label} />
              </button>
            ))}
          </div>

          {expandedProviderOption ? (
            <div className="chat-composer-provider-models">
              <div className="chat-composer-provider-models-header">
                <span className="chat-composer-provider-models-title">{expandedProviderOption.label}</span>
                <span className="chat-composer-provider-models-caption">Models</span>
              </div>
              <div className="chat-composer-provider-models-list">
                {expandedProviderModels.length > 0 ? (
                  expandedProviderModels.map((modelOption) => (
                    <button
                      key={modelOption.id}
                      type="button"
                      className={`chat-composer-model-item ${modelOption.selected ? 'selected' : ''}`}
                      onClick={() => handleModelSelect(expandedProviderOption, modelOption)}
                      disabled={modelOption.disabled}
                    >
                      <span className="chat-composer-model-item-icon">
                        <ModelIcon modelId={modelOption.modelId} label={modelOption.label} />
                      </span>
                      <span className="chat-composer-model-item-label">{modelOption.label}</span>
                    </button>
                  ))
                ) : (
                  <div className="chat-composer-provider-models-empty">暂无可用模型</div>
                )}
              </div>
            </div>
          ) : (
            <div className="chat-composer-provider-select-hint">选择 Provider 以展开 Models</div>
          )}
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
