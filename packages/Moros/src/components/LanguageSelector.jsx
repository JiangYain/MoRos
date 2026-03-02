import React, { useState, useRef, useEffect } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import './LanguageSelector.css'
import { useI18n } from '../utils/i18n'

const languages = [
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文' },
  { code: 'en', name: 'English', nativeName: 'English' },
]

const LanguageSelector = ({ value, onChange }) => {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const dropdownRef = useRef(null)
  const triggerRef = useRef(null)

  const selectedLanguage = languages.find((lang) => lang.code === value) || languages[0]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setFocusedIndex(-1)
      }
    }

    const handleKeyDown = (event) => {
      if (!isOpen) return
      switch (event.key) {
        case 'Escape':
          setIsOpen(false)
          setFocusedIndex(-1)
          triggerRef.current?.focus()
          break
        case 'ArrowDown':
          event.preventDefault()
          setFocusedIndex((prev) => (prev + 1) % languages.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          setFocusedIndex((prev) => (prev - 1 + languages.length) % languages.length)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (focusedIndex >= 0) {
            onChange(languages[focusedIndex].code)
            setIsOpen(false)
            setFocusedIndex(-1)
          }
          break
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, focusedIndex, onChange])

  const handleToggle = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      const currentIndex = languages.findIndex((lang) => lang.code === value)
      setFocusedIndex(currentIndex)
    }
  }

  const handleSelect = (languageCode) => {
    onChange(languageCode)
    setIsOpen(false)
    setFocusedIndex(-1)
    triggerRef.current?.focus()
  }

  return (
    <div className="language-selector" ref={dropdownRef}>
      <button
        ref={triggerRef}
        className={`language-trigger ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('settings.language')}
      >
        <div className="language-trigger-content">
          <Globe size={16} className="language-icon" />
          <span className="language-name">{selectedLanguage.nativeName}</span>
        </div>
        <ChevronDown size={16} className={`language-chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {isOpen && (
        <div className="language-dropdown">
          <div className="language-dropdown-content">
            <div className="language-list" role="listbox" aria-label={t('settings.language')}>
              {languages.map((language, index) => (
                <button
                  key={language.code}
                  className={`language-option ${language.code === value ? 'selected' : ''} ${index === focusedIndex ? 'focused' : ''}`}
                  onClick={() => handleSelect(language.code)}
                  role="option"
                  aria-selected={language.code === value}
                  onMouseEnter={() => setFocusedIndex(index)}
                  onMouseLeave={() => setFocusedIndex(-1)}
                >
                  <div className="language-option-content">
                    <span className="language-option-name">{language.nativeName}</span>
                  </div>
                  {language.code === value && <Check size={16} className="language-check" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LanguageSelector

