import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowUp, Puzzle } from 'lucide-react'
import { CHAT_MODELS_BY_PROVIDER } from '../utils/chatProvider'
import { filesApi } from '../utils/api'
import './ChatComposer.css'

const MIN_COMPOSER_HEIGHT = 100
const MIN_TEXTAREA_HEIGHT = 28
const MAX_TEXTAREA_HEIGHT = 296
const COMPOSER_VERTICAL_PADDING = 56
const TEXTAREA_HEIGHT_BUFFER = 6
const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const VSCODE_ICONS_BASE_URL = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons/icons'

const DEFAULT_SKILL_ICON_BY_NAME = {
  'skill-creator': '/assets/model-icons/claude.png',
  excalidraw: '/assets/file-icons/excaildrawlogo.png',
  pdf: `${VSCODE_ICONS_BASE_URL}/file_type_pdf.svg`,
  pptx: `${VSCODE_ICONS_BASE_URL}/file_type_powerpoint.svg`,
  xlsx: `${VSCODE_ICONS_BASE_URL}/file_type_excel.svg`,
}

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

const isAbsolutePath = (value) => ABSOLUTE_PATH_PATTERN.test(String(value || '').trim())

const resolveDefaultSkillIconUrl = (skill) => {
  const skillName = String(skill?.name || skill?.id || '')
    .trim()
    .toLowerCase()
  return DEFAULT_SKILL_ICON_BY_NAME[skillName] || ''
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

function SkillIcon({ skill }) {
  const [coverFailed, setCoverFailed] = useState(false)
  const [defaultFailed, setDefaultFailed] = useState(false)
  const coverPath = String(skill?.coverImagePath || '').trim()
  const coverIconUrl = coverPath
    ? (isAbsolutePath(coverPath) ? filesApi.getRawAbsoluteFileUrl(coverPath) : filesApi.getRawFileUrl(coverPath))
    : ''
  const fallbackIconUrl = resolveDefaultSkillIconUrl(skill)
  const preferredCoverUrl = coverFailed ? '' : coverIconUrl
  const fallbackUrl = defaultFailed ? '' : fallbackIconUrl
  const iconUrl = preferredCoverUrl || fallbackUrl
  const isUsingCoverIcon = Boolean(preferredCoverUrl)
  const fallback = String(skill?.name || '?').trim().charAt(0).toUpperCase()
  const iconAccentColor = String(skill?.color || '').trim()

  useEffect(() => {
    setCoverFailed(false)
    setDefaultFailed(false)
  }, [coverPath, fallbackIconUrl])

  if (!iconUrl) {
    return (
      <span
        className="chat-composer-skill-icon-fallback"
        aria-hidden
        style={iconAccentColor ? { color: iconAccentColor } : undefined}
      >
        {fallback || '?'}
      </span>
    )
  }

  return (
    <img
      src={iconUrl}
      alt=""
      className="chat-composer-skill-icon-image"
      loading="lazy"
      onError={() => {
        if (isUsingCoverIcon) {
          setCoverFailed(true)
        } else {
          setDefaultFailed(true)
        }
      }}
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
  skillItems = [],
  onSkillSelect,
}) {
  const inputValue = String(value || '')
  const canSendNow = !disabled && canSubmit
  const sendDisabled = !isLoading && !canSendNow
  const [textareaHeight, setTextareaHeight] = useState(MIN_TEXTAREA_HEIGHT)
  const [textareaScrollable, setTextareaScrollable] = useState(false)
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false)
  const [isSkillsMenuOpen, setIsSkillsMenuOpen] = useState(false)
  const [expandedProviderId, setExpandedProviderId] = useState('')
  const textareaElementRef = useRef(null)
  const addMenuPanelRef = useRef(null)
  const addButtonRef = useRef(null)
  const skillsButtonRef = useRef(null)
  const skillsMenuRef = useRef(null)
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

  useEffect(() => {
    if (!isAddMenuOpen) return
    const handleOutsideClick = (event) => {
      const clickTarget = event?.target
      if (!clickTarget) return
      if (addMenuPanelRef.current?.contains(clickTarget)) return
      if (addButtonRef.current?.contains(clickTarget)) return
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

  useEffect(() => {
    if (!isSkillsMenuOpen) return
    const handleOutsideClick = (event) => {
      const clickTarget = event?.target
      if (!clickTarget) return
      if (skillsMenuRef.current?.contains(clickTarget)) return
      if (skillsButtonRef.current?.contains(clickTarget)) return
      setIsSkillsMenuOpen(false)
    }
    const handleEsc = (event) => {
      if (event.key === 'Escape') setIsSkillsMenuOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isSkillsMenuOpen])

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

  const useMultiline = multiline

  const setInputElementRef = useCallback((node) => {
    textareaElementRef.current = node
    if (typeof inputRef === 'function') {
      inputRef(node)
      return
    }
    if (inputRef && typeof inputRef === 'object') {
      inputRef.current = node
    }
  }, [inputRef])

  const resizeTextareaToContent = useCallback(() => {
    if (!useMultiline) return
    const textarea = textareaElementRef.current
    if (!textarea || textarea.tagName !== 'TEXTAREA') return
    textarea.style.overflowY = 'hidden'
    textarea.style.height = '0px'
    const fullContentHeight = Math.ceil(textarea.scrollHeight + TEXTAREA_HEIGHT_BUFFER)
    const measuredHeight = Math.min(
      MAX_TEXTAREA_HEIGHT,
      Math.max(MIN_TEXTAREA_HEIGHT, fullContentHeight),
    )
    const nextScrollable = fullContentHeight > MAX_TEXTAREA_HEIGHT
    textarea.style.height = `${measuredHeight}px`
    textarea.style.overflowY = nextScrollable ? 'auto' : 'hidden'
    if (!nextScrollable) {
      textarea.scrollTop = 0
    }
    setTextareaHeight((prev) => (Math.abs(prev - measuredHeight) < 1 ? prev : measuredHeight))
    setTextareaScrollable((prev) => (prev === nextScrollable ? prev : nextScrollable))
  }, [useMultiline])

  useEffect(() => {
    if (!useMultiline) return
    const frameId = window.requestAnimationFrame(() => {
      resizeTextareaToContent()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [inputValue, useMultiline, resizeTextareaToContent])

  const handleInputChange = useCallback((nextValue) => {
    onValueChange?.(nextValue)
  }, [onValueChange])

  const handleAddButtonClick = () => {
    if (hasAddMenu) {
      setIsAddMenuOpen((open) => !open)
      setIsSkillsMenuOpen(false)
      return
    }
    onAttach?.()
  }

  const handleSkillsButtonClick = () => {
    setIsSkillsMenuOpen((open) => !open)
    setIsAddMenuOpen(false)
  }

  const handleSkillItemClick = (skill) => {
    onSkillSelect?.(skill)
    setIsSkillsMenuOpen(false)
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
    <div className="chat-composer-wrapper">
      {hasAddMenu && isAddMenuOpen && (
        <div className="chat-composer-add-menu" ref={addMenuPanelRef}>
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
      {isSkillsMenuOpen && (
        <div className="chat-composer-skills-menu" ref={skillsMenuRef}>
          <div className="chat-composer-skills-header">
            <span className="chat-composer-skills-title">Skills</span>
            <span className="chat-composer-skills-caption">Runtime</span>
          </div>
          {skillItems.length > 0 ? (
            <div className="chat-composer-skills-list">
              {skillItems.map((skill) => (
                <button
                  key={skill.id || skill.path || skill.name}
                  type="button"
                  className="chat-composer-skill-item"
                  onClick={() => handleSkillItemClick(skill)}
                >
                  <span className="chat-composer-skill-icon" aria-hidden>
                    <SkillIcon skill={skill} />
                  </span>
                  <span className="chat-composer-skill-name">{skill.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="chat-composer-skills-empty">
              <span className="chat-composer-skills-empty-title">暂无可用 Skill</span>
              <span className="chat-composer-skills-empty-hint">在设置页 Skills 中安装精选 Skill</span>
            </div>
          )}
        </div>
      )}
      <form
        className={wrapperClassName}
        onSubmit={handleSubmit}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={useMultiline
          ? {
              minHeight: `${Math.max(MIN_COMPOSER_HEIGHT, textareaHeight + COMPOSER_VERTICAL_PADDING)}px`,
            }
          : undefined}
      >
        {useMultiline ? (
          <textarea
            ref={setInputElementRef}
            className="chat-composer-input chat-input"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={disabled}
            rows={rows}
            autoFocus={autoFocus}
            style={{
              height: `${textareaHeight}px`,
              overflowY: textareaScrollable ? 'auto' : 'hidden',
            }}
          />
        ) : (
          <input
            ref={setInputElementRef}
            type="text"
            className="chat-composer-input chat-landing-input"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={disabled}
            autoFocus={autoFocus}
          />
        )}

        <div className="chat-composer-toolbar">
          <div className="chat-composer-toolbar-left">
            <button
              ref={addButtonRef}
              type="button"
              className={`chat-input-action chat-composer-add chat-composer-circle-btn ${isAddMenuOpen ? 'open' : ''}`}
              onClick={handleAddButtonClick}
              title={attachTitle}
              disabled={disabled || isLoading}
              aria-expanded={hasAddMenu ? isAddMenuOpen : undefined}
            >
              <span className="chat-composer-add-glyph" aria-hidden>/</span>
            </button>

            <button
              ref={skillsButtonRef}
              type="button"
              className="chat-composer-circle-btn chat-composer-skills-btn"
              onClick={handleSkillsButtonClick}
              title="Skills"
              disabled={disabled || isLoading}
              aria-expanded={isSkillsMenuOpen}
            >
              <Puzzle size={14} strokeWidth={2} />
            </button>
          </div>

          <button
            type="submit"
            className={`chat-send-btn ${isLoading ? 'loading' : ''} ${sendDisabled && !isLoading ? 'hidden-when-empty' : ''}`}
            disabled={sendDisabled}
            title={isLoading ? stopTitle : submitTitle}
          >
            {isLoading ? null : (
              <ArrowUp size={16} strokeWidth={2.5} />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ChatComposer
