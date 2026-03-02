import React, { useState, useEffect, useRef } from 'react'
import './SettingsModal.css'
import { User, Settings as SettingsIcon, Plug, X, Upload, Sun, Moon, Monitor } from 'lucide-react'
import { useI18n } from '../utils/i18n'
import { getDifyApiKey, getDifyBaseUrl, setDifyApiKey, setDifyBaseUrl, testDifyConnection } from '../utils/dify'
import { getMorosBaseUrl, getMorosApiKey, setMorosBaseUrl, setMorosApiKey, testMorosConnection } from '../utils/markovImage'
import {
  clearGitHubCopilotCredentials,
  getGitHubCopilotCredentials,
  getGitHubCopilotProxyEnabled,
  getGitHubCopilotProxyUrl,
  getValidGitHubCopilotCredentials,
  loginGitHubCopilot,
  setGitHubCopilotProxyEnabled,
  setGitHubCopilotProxyUrl,
  testGitHubCopilotConnection,
} from '../utils/githubCopilot'
import LanguageSelector from './LanguageSelector'

const AccountSettings = ({ avatar, onAvatarChange, username, onUsernameChange }) => {
  const { t } = useI18n()
  const fileInputRef = useRef(null)
  const [email, setEmail] = useState(() => {
    const saved = localStorage.getItem('moros-email')
    return saved || `${String(username || 'moros').trim().toLowerCase().replace(/\s+/g, '') || 'moros'}@moros.local`
  })

  const handlePick = () => fileInputRef.current?.click()
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onAvatarChange?.(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleEmailChange = (e) => {
    setEmail(e.target.value)
    try { localStorage.setItem('moros-email', e.target.value) } catch {}
  }

  return (
    <div className="settings-view">
      <h1 className="settings-view-title">Account</h1>
      <p className="settings-view-subtitle">Profile and identity</p>

      <div className="settings-card">
        <div className="account-header">
          <div className="account-avatar" onClick={handlePick} title={t('settings.upload')}>
            {avatar ? <img src={avatar} alt="Avatar" /> : <User size={28} />}
            <span className="avatar-edit-hint">Edit</span>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
        </div>

        <div className="settings-grid">
          <div className="field-item">
            <label className="field-label">{t('settings.display_name')}</label>
            <input
              className="field-input"
              value={username || ''}
              onChange={(e) => onUsernameChange?.(e.target.value)}
              placeholder={t('settings.placeholders.your_name')}
            />
          </div>
          <div className="field-item">
            <label className="field-label">Email</label>
            <input
              className="field-input"
              value={email}
              onChange={handleEmailChange}
              placeholder="your@email.com"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const GeneralSettings = ({
  language,
  onLanguageChange,
  hoverPreview,
  onHoverPreviewChange,
  showFileExtensions,
  onShowFileExtensionsChange,
  dynamicCursorGuide,
  onDynamicCursorGuideChange,
  themeMode,
  onThemeModeChange,
  darkMode,
  onToggleDarkMode,
}) => {
  const { t } = useI18n()
  const currentTheme = themeMode || (darkMode ? 'dark' : 'light')
  const applyThemeMode = (mode) => {
    if (onThemeModeChange) {
      onThemeModeChange(mode)
      return
    }
    if (!onToggleDarkMode) return
    if (mode === 'light' && darkMode) onToggleDarkMode()
    if (mode === 'dark' && !darkMode) onToggleDarkMode()
    if (mode === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (systemDark !== darkMode) onToggleDarkMode()
    }
  }

  return (
    <div className="settings-view">
      <h1 className="settings-view-title">Settings</h1>
      <p className="settings-view-subtitle">General behavior and appearance</p>

      <div className="settings-card">
        <div className="field-item">
          <label className="field-label">{t('settings.language')}</label>
          <LanguageSelector value={language || 'zh-CN'} onChange={onLanguageChange} />
        </div>

        <div className="field-item">
          <label className="field-label">Appearance</label>
          <div className="theme-options">
            <button
              className={`theme-option ${currentTheme === 'light' ? 'active' : ''}`}
              onClick={() => applyThemeMode('light')}
            >
              <div className="theme-preview light-preview">
                <div className="tp-sidebar"><div className="tp-line" /><div className="tp-line short" /></div>
                <div className="tp-content"><div className="tp-line" /><div className="tp-line short" /><div className="tp-line" /></div>
              </div>
              <span>Light</span>
            </button>
            <button
              className={`theme-option ${currentTheme === 'dark' ? 'active' : ''}`}
              onClick={() => applyThemeMode('dark')}
            >
              <div className="theme-preview dark-preview">
                <div className="tp-sidebar"><div className="tp-line" /><div className="tp-line short" /></div>
                <div className="tp-content"><div className="tp-line" /><div className="tp-line short" /><div className="tp-line" /></div>
              </div>
              <span>Dark</span>
            </button>
            <button
              className={`theme-option ${currentTheme === 'system' ? 'active' : ''}`}
              onClick={() => applyThemeMode('system')}
            >
              <div className="theme-preview system-preview">
                <div className="tp-half light-half">
                  <div className="tp-sidebar"><div className="tp-line" /><div className="tp-line short" /></div>
                  <div className="tp-content"><div className="tp-line" /><div className="tp-line short" /></div>
                </div>
                <div className="tp-half dark-half">
                  <div className="tp-sidebar"><div className="tp-line" /><div className="tp-line short" /></div>
                  <div className="tp-content"><div className="tp-line" /><div className="tp-line short" /></div>
                </div>
              </div>
              <span>Follow System</span>
            </button>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="switch-row">
          <div className="switch-meta">
            <p className="switch-title">{t('settings.appearance_enable_hover_preview') || 'Enable Hover Preview'}</p>
            <p className="switch-description">{t('settings.appearance_hover_preview_desc') || 'Show Markdown preview when hovering files.'}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={hoverPreview}
              onChange={(e) => onHoverPreviewChange?.(e.target.checked)}
            />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="switch-row">
          <div className="switch-meta">
            <p className="switch-title">{t('settings.appearance_show_extensions') || 'Show File Extensions'}</p>
            <p className="switch-description">{t('settings.appearance_show_extensions_desc') || 'Show .md/.MoRos/.excalidraw suffix in sidebar.'}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={showFileExtensions}
              onChange={(e) => onShowFileExtensionsChange?.(e.target.checked)}
            />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="switch-row">
          <div className="switch-meta">
            <p className="switch-title">{t('settings.appearance_dynamic_cursor_guide') || 'Dynamic Cursor Guide'}</p>
            <p className="switch-description">{t('settings.appearance_dynamic_cursor_guide_desc') || 'Show split-view cursor guide line and curve.'}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={!!dynamicCursorGuide}
              onChange={(e) => onDynamicCursorGuideChange?.(e.target.checked)}
            />
            <span className="slider round"></span>
          </label>
        </div>
      </div>
    </div>
  )
}

const IntegrationsSettings = () => {
  const { t } = useI18n()
  const [difyBaseUrl, setBaseUrl] = useState(() => getDifyBaseUrl())
  const [difyApiKey, setApiKey] = useState(() => getDifyApiKey())
  const [apiVisible, setApiVisible] = useState(false)
  const [connStatus, setConnStatus] = useState('')

  const [morosBaseUrl, setMorosBase] = useState(() => getMorosBaseUrl())
  const [morosApiKey, setMorosKey] = useState(() => getMorosApiKey())
  const [morosApiVisible, setMorosApiVisible] = useState(false)
  const [morosConnStatus, setMorosConnStatus] = useState('')
  const [enterpriseDomain, setEnterpriseDomain] = useState(() => getGitHubCopilotCredentials()?.enterpriseDomain || '')
  const [copilotStatus, setCopilotStatus] = useState('')
  const [copilotBusy, setCopilotBusy] = useState(false)
  const [copilotCredentials, setCopilotCredentials] = useState(() => getGitHubCopilotCredentials())
  const [authStep, setAuthStep] = useState({ url: '', code: '' })
  const [copilotProxyEnabled, setCopilotProxyEnabledState] = useState(() => getGitHubCopilotProxyEnabled())
  const [copilotProxyUrl, setCopilotProxyUrlState] = useState(() => getGitHubCopilotProxyUrl())

  const refreshCopilotCredentials = async () => {
    const next = await getValidGitHubCopilotCredentials()
    setCopilotCredentials(next)
    return next
  }

  useEffect(() => {
    refreshCopilotCredentials()
  }, [])

  const handleLoginCopilot = async () => {
    const manualDomain = window.prompt(
      'GitHub Enterprise URL/domain（留空则使用 github.com）',
      enterpriseDomain || '',
    )
    if (manualDomain === null) return
    const inputDomain = String(manualDomain || '').trim()
    setEnterpriseDomain(inputDomain)
    setCopilotBusy(true)
    setCopilotStatus('正在初始化 OAuth...')
    setAuthStep({ url: '', code: '' })
    try {
      const credentials = await loginGitHubCopilot({
        enterpriseDomain: inputDomain,
        onAuth: ({ url, userCode }) => {
          setAuthStep({ url, code: userCode })
          try {
            window.open(url, '_blank', 'noopener,noreferrer')
          } catch {}
        },
        onProgress: (message) => setCopilotStatus(message),
      })
      setCopilotCredentials(credentials)
      setCopilotStatus('GitHub Copilot 已连接')
    } catch (error) {
      setCopilotStatus(`连接失败：${error.message}`)
    } finally {
      setCopilotBusy(false)
    }
  }

  const handleLogoutCopilot = () => {
    clearGitHubCopilotCredentials()
    setCopilotCredentials(null)
    setAuthStep({ url: '', code: '' })
    setCopilotStatus('已退出 GitHub Copilot')
  }

  const handleTestCopilot = async () => {
    setCopilotBusy(true)
    setCopilotStatus('正在测试连接...')
    try {
      await refreshCopilotCredentials()
      const result = await testGitHubCopilotConnection()
      setCopilotStatus(result.ok ? '连接成功' : `连接失败：${result.error || 'Unknown Error'}`)
    } finally {
      setCopilotBusy(false)
    }
  }

  const handleCopyDeviceCode = async () => {
    if (!authStep.code) return
    try {
      await navigator.clipboard.writeText(authStep.code)
      setCopilotStatus('设备码已复制')
    } catch {
      setCopilotStatus('复制失败，请手动复制设备码')
    }
  }

  return (
    <div className="settings-view">
      <h1 className="settings-view-title">Integrations</h1>
      <p className="settings-view-subtitle">External API connections</p>

      <div className="settings-card">
        <h2 className="settings-card-title">{t('settings.dify.title')}</h2>
        <div className="field-item">
          <label className="field-label">{t('settings.dify.base_url')}</label>
          <input
            className="field-input"
            placeholder={t('settings.placeholders.base_url')}
            value={difyBaseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            onBlur={() => setDifyBaseUrl(difyBaseUrl.trim())}
          />
        </div>
        <div className="field-item">
          <label className="field-label">{t('settings.dify.api_key')}</label>
          <div className="inline-actions">
            <input
              className="field-input"
              type={apiVisible ? 'text' : 'password'}
              placeholder="sk-..."
              value={difyApiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => setDifyApiKey(difyApiKey.trim())}
            />
            <button className="settings-btn ghost" onClick={() => setApiVisible((v) => !v)}>
              {apiVisible ? t('settings.dify.hide') : t('settings.dify.show')}
            </button>
          </div>
          <p className="field-hint">{t('settings.dify.stored_hint')}</p>
        </div>
        <div className="field-item">
          <button
            className="settings-btn"
            onClick={async () => {
              setDifyBaseUrl(difyBaseUrl.trim())
              setDifyApiKey(difyApiKey.trim())
              const r = await testDifyConnection(difyBaseUrl.trim(), difyApiKey.trim())
              setConnStatus(r.ok ? 'success' : `error:${r.error || 'Unknown Error'}`)
            }}
          >
            {t('settings.dify.test_connection')}
          </button>
          {connStatus && (
            <span className={`connection-status ${connStatus.startsWith('success') ? 'success' : 'error'}`}>
              {connStatus.startsWith('success')
                ? t('settings.dify.connection_success')
                : t('settings.dify.connection_failed', { msg: (connStatus.split(':')[1] || '').trim() })}
            </span>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-card-title">MoRos Image</h2>
        <div className="field-item">
          <label className="field-label">Base URL</label>
          <input
            className="field-input"
            placeholder="https://api.tu-zi.com/v1"
            value={morosBaseUrl}
            onChange={(e) => setMorosBase(e.target.value)}
            onBlur={() => setMorosBaseUrl(morosBaseUrl.trim())}
          />
        </div>
        <div className="field-item">
          <label className="field-label">API Key</label>
          <div className="inline-actions">
            <input
              className="field-input"
              type={morosApiVisible ? 'text' : 'password'}
              placeholder="sk-..."
              value={morosApiKey}
              onChange={(e) => setMorosKey(e.target.value)}
              onBlur={() => setMorosApiKey(morosApiKey.trim())}
            />
            <button className="settings-btn ghost" onClick={() => setMorosApiVisible((v) => !v)}>
              {morosApiVisible ? t('settings.dify.hide') : t('settings.dify.show')}
            </button>
          </div>
        </div>
        <div className="field-item">
          <button
            className="settings-btn"
            onClick={async () => {
              setMorosBaseUrl(morosBaseUrl.trim())
              setMorosApiKey(morosApiKey.trim())
              const r = await testMorosConnection(morosBaseUrl.trim(), morosApiKey.trim())
              setMorosConnStatus(r.ok ? 'success' : `error:${r.error || 'Unknown Error'}`)
            }}
          >
            测试连接
          </button>
          {morosConnStatus && (
            <span className={`connection-status ${morosConnStatus.startsWith('success') ? 'success' : 'error'}`}>
              {morosConnStatus.startsWith('success') ? '连接成功' : `连接失败：${(morosConnStatus.split(':')[1] || '').trim()}`}
            </span>
          )}
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-card-title">GitHub Copilot OAuth</h2>
        <div className="field-item">
          <label className="field-label">CORS Proxy</label>
          <div className="inline-actions">
            <label className="proxy-toggle">
              <input
                type="checkbox"
                checked={copilotProxyEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked
                  setCopilotProxyEnabledState(enabled)
                  setGitHubCopilotProxyEnabled(enabled)
                }}
              />
              <span>Enable</span>
            </label>
            <input
              className="field-input"
              value={copilotProxyUrl}
              placeholder="http://localhost:53211/api/proxy"
              onChange={(e) => {
                const next = e.target.value
                setCopilotProxyUrlState(next)
                setGitHubCopilotProxyUrl(next)
              }}
              disabled={!copilotProxyEnabled}
            />
          </div>
          <p className="field-hint">建议保持开启，避免浏览器环境下 GitHub OAuth/Copilot API 的 CORS 限制。</p>
        </div>

        <div className="field-item">
          <label className="field-label">Enterprise Domain (optional)</label>
          <input
            className="field-input"
            placeholder="github.com / company.ghe.com"
            value={enterpriseDomain}
            onChange={(e) => setEnterpriseDomain(e.target.value)}
          />
          <p className="field-hint">
            {copilotCredentials
              ? `当前状态：已登录${copilotCredentials.enterpriseDomain ? ` (${copilotCredentials.enterpriseDomain})` : ''}`
              : '当前状态：未登录'}
          </p>
        </div>

        {authStep.code && (
          <div className="field-item">
            <label className="field-label">Device Code</label>
            <div className="inline-actions">
              <input className="field-input readonly" readOnly value={authStep.code} />
              <button className="settings-btn ghost" onClick={handleCopyDeviceCode}>
                复制
              </button>
            </div>
            {authStep.url && (
              <p className="field-hint">
                授权页：
                <a href={authStep.url} target="_blank" rel="noreferrer">{authStep.url}</a>
              </p>
            )}
          </div>
        )}

        <div className="field-item">
          <div className="inline-actions">
            {!copilotCredentials ? (
              <button className="settings-btn" onClick={handleLoginCopilot} disabled={copilotBusy}>
                {copilotBusy ? '授权中...' : 'Login with GitHub'}
              </button>
            ) : (
              <>
                <button className="settings-btn" onClick={handleTestCopilot} disabled={copilotBusy}>
                  测试连接
                </button>
                <button className="settings-btn ghost" onClick={handleLogoutCopilot} disabled={copilotBusy}>
                  Logout
                </button>
              </>
            )}
          </div>
          {copilotStatus && (
            <p className="field-hint" style={{ marginTop: '10px' }}>
              {copilotStatus}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const SettingsModal = ({ isOpen, onClose, ...props }) => {
  const {
    avatar, onAvatarChange,
    language, onLanguageChange,
    username, onUsernameChange,
    darkMode,
    themeMode,
    onThemeModeChange,
    onToggleDarkMode,
    hoverPreview, onHoverPreviewChange,
    showFileExtensions, onShowFileExtensionsChange,
    dynamicCursorGuide, onDynamicCursorGuideChange,
  } = props

  const [activeCategory, setActiveCategory] = useState('account')
  const { t } = useI18n()

  useEffect(() => {
    const handleEsc = (event) => { if (event.key === 'Escape') onClose?.() }
    if (isOpen) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) setActiveCategory('account')
  }, [isOpen])

  if (!isOpen) return null

  const renderContent = () => {
    switch (activeCategory) {
      case 'account':
        return (
          <AccountSettings
            avatar={avatar}
            onAvatarChange={onAvatarChange}
            username={username}
            onUsernameChange={onUsernameChange}
          />
        )
      case 'settings':
        return (
          <GeneralSettings
            language={language}
            onLanguageChange={onLanguageChange}
            hoverPreview={hoverPreview}
            onHoverPreviewChange={onHoverPreviewChange}
            showFileExtensions={showFileExtensions}
            onShowFileExtensionsChange={onShowFileExtensionsChange}
            dynamicCursorGuide={dynamicCursorGuide}
            onDynamicCursorGuideChange={onDynamicCursorGuideChange}
            darkMode={darkMode}
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
            onToggleDarkMode={onToggleDarkMode}
          />
        )
      case 'integrations':
        return <IntegrationsSettings />
      default:
        return null
    }
  }

  return (
    <div className="settings-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="settings-modal">
        <button
          className="settings-close-btn"
          onClick={onClose}
          aria-label={t('main.close') || 'Close'}
          title="ESC"
        >
          <X size={16} />
        </button>

        <aside className="settings-nav">
          <div className="settings-brand">
            <img src="/favicon.svg" alt="MoRos" />
            <span>MoRos</span>
          </div>
          <button
            className={`settings-nav-item ${activeCategory === 'account' ? 'active' : ''}`}
            onClick={() => setActiveCategory('account')}
          >
            <User size={15} />
            <span>Account</span>
          </button>
          <button
            className={`settings-nav-item ${activeCategory === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveCategory('settings')}
          >
            <SettingsIcon size={15} />
            <span>Settings</span>
          </button>
          <button
            className={`settings-nav-item ${activeCategory === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveCategory('integrations')}
          >
            <Plug size={15} />
            <span>{t('settings.integrations') || 'Integrations'}</span>
          </button>
        </aside>

        <section className="settings-content">
          {renderContent()}
        </section>
      </div>
    </div>
  )
}

export default SettingsModal
