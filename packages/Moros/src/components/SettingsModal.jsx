import React, { useState, useEffect, useRef, useCallback } from 'react'
import './SettingsModal.css'
import {
  CircleUserRound,
  X,
} from 'lucide-react'
import { useI18n } from '../utils/i18n'
import { filesApi } from '../utils/api'
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
import {
  getOpenCodeGoApiKey,
  getOpenCodeGoBaseUrl,
  setOpenCodeGoApiKey,
  setOpenCodeGoBaseUrl,
  testOpenCodeGoConnection,
} from '../utils/opencodeGo'
import {
  clearOpenAICodexCredentials,
  getOpenAICodexCredentials,
  getValidOpenAICodexCredentials,
  loginOpenAICodex,
  testOpenAICodexConnection,
} from '../utils/openaiCodex'
import LanguageSelector from './LanguageSelector'

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\\\\|\/)/
const VSCODE_ICONS_BASE_URL = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons/icons'
const DEFAULT_SKILL_ICON_BY_NAME = {
  'skill-creator': '/assets/model-icons/claude.png',
  excalidraw: '/assets/file-icons/excaildrawlogo.png',
  pdf: `${VSCODE_ICONS_BASE_URL}/file_type_pdf.svg`,
  pptx: `${VSCODE_ICONS_BASE_URL}/file_type_powerpoint.svg`,
  xlsx: `${VSCODE_ICONS_BASE_URL}/file_type_excel.svg`,
}

const normalizePath = (value) => String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
const isAbsolutePath = (value) => ABSOLUTE_PATH_PATTERN.test(String(value || '').trim())
const resolveDefaultSkillIconUrl = (skill) => {
  const skillName = String(skill?.name || skill?.id || '')
    .trim()
    .toLowerCase()
  return DEFAULT_SKILL_ICON_BY_NAME[skillName] || ''
}

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
      <h1 className="settings-view-title">{t('settings.profile') || 'Account'}</h1>
      <p className="settings-view-subtitle">Profile and identity</p>

      <div className="settings-card">
        <div className="account-header">
          <div className="account-avatar" onClick={handlePick} title={t('settings.upload')}>
            {avatar ? <img src={avatar} alt="Avatar" /> : <CircleUserRound size={28} />}
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
  globalSystemPrompt,
  onSaveGlobalSystemPrompt,
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

  const [systemPromptDraft, setSystemPromptDraft] = useState(() => String(globalSystemPrompt || ''))
  const [systemPromptSaving, setSystemPromptSaving] = useState(false)
  const [systemPromptSaved, setSystemPromptSaved] = useState(false)
  const saveTimerRef = useRef(null)

  useEffect(() => {
    setSystemPromptDraft(String(globalSystemPrompt || ''))
  }, [globalSystemPrompt])

  const autoSaveSystemPrompt = useCallback(async (value) => {
    if (!onSaveGlobalSystemPrompt) return
    try {
      setSystemPromptSaving(true)
      setSystemPromptSaved(false)
      await onSaveGlobalSystemPrompt(value)
      setSystemPromptSaving(false)
      setSystemPromptSaved(true)
      setTimeout(() => setSystemPromptSaved(false), 2400)
    } catch {
      setSystemPromptSaving(false)
    }
  }, [onSaveGlobalSystemPrompt])

  const handleSystemPromptChange = (e) => {
    const val = e.target.value
    setSystemPromptDraft(val)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => autoSaveSystemPrompt(val), 800)
  }

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  return (
    <div className="settings-view">
      <h1 className="settings-view-title">{t('settings.app_settings') || 'Settings'}</h1>
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
        <div className="field-item" style={{ position: 'relative' }}>
          <div className="settings-inline-row" style={{ marginBottom: 8 }}>
            <label className="field-label" style={{ margin: 0 }}>Global System Prompt</label>
            <span className="system-prompt-status">
              {systemPromptSaving && (
                <svg className="system-prompt-spinner" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="var(--border-color)" strokeWidth="1" />
                  <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="var(--text-primary)" strokeWidth="1" strokeLinecap="round" />
                </svg>
              )}
              {systemPromptSaved && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3.5 7.5l2.5 2.5 4.5-5" stroke="#d94632" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </div>
          <textarea
            className="field-input settings-textarea"
            value={systemPromptDraft}
            onChange={handleSystemPromptChange}
            placeholder="为当前项目定义全局系统提示词（会应用到所有 Chat 请求）"
            rows={8}
          />
          <div className="settings-inline-row" style={{ justifyContent: 'flex-end' }}>
            <span className="field-hint">{systemPromptDraft.length}/20000</span>
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
  const [opencodeGoBaseUrl, setOpenCodeGoBase] = useState(() => getOpenCodeGoBaseUrl())
  const [opencodeGoApiKey, setOpenCodeGoKey] = useState(() => getOpenCodeGoApiKey())
  const [opencodeGoApiVisible, setOpenCodeGoApiVisible] = useState(false)
  const [opencodeGoStatus, setOpenCodeGoStatus] = useState('')
  const [opencodeGoBusy, setOpenCodeGoBusy] = useState(false)
  const [openAICodexBusy, setOpenAICodexBusy] = useState(false)
  const [openAICodexStatus, setOpenAICodexStatus] = useState('')
  const [openAICodexCredentials, setOpenAICodexCredentials] = useState(() => getOpenAICodexCredentials())

  const refreshCopilotCredentials = async () => {
    const next = await getValidGitHubCopilotCredentials()
    setCopilotCredentials(next)
    return next
  }

  const refreshOpenAICodexCredentials = async () => {
    const next = await getValidOpenAICodexCredentials()
    setOpenAICodexCredentials(next)
    return next
  }

  useEffect(() => {
    refreshCopilotCredentials()
    refreshOpenAICodexCredentials()
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

  const handleLoginOpenAICodex = async () => {
    if (openAICodexBusy) return
    setOpenAICodexBusy(true)
    setOpenAICodexStatus('正在初始化 OAuth...')
    try {
      const credentials = await loginOpenAICodex({
        onAuth: ({ url }) => {
          try {
            window.open(url, '_blank', 'noopener,noreferrer')
          } catch {}
        },
        onProgress: (message) => setOpenAICodexStatus(message),
      })
      setOpenAICodexCredentials(credentials)
      setOpenAICodexStatus('OpenAI Codex 已连接')
    } catch (error) {
      setOpenAICodexStatus(`连接失败：${error?.message || '未知错误'}`)
    } finally {
      setOpenAICodexBusy(false)
    }
  }

  const handleLogoutOpenAICodex = () => {
    clearOpenAICodexCredentials()
    setOpenAICodexCredentials(null)
    setOpenAICodexStatus('已退出 OpenAI Codex')
  }

  const handleTestOpenAICodex = async () => {
    if (openAICodexBusy) return
    setOpenAICodexBusy(true)
    setOpenAICodexStatus('正在测试连接...')
    try {
      const result = await testOpenAICodexConnection()
      if (!result.ok) {
        setOpenAICodexStatus(`连接失败：${result.error || 'Unknown Error'}`)
        return
      }
      const next = await getValidOpenAICodexCredentials()
      setOpenAICodexCredentials(next)
      setOpenAICodexStatus('连接成功')
    } catch (error) {
      setOpenAICodexStatus(`连接失败：${error?.message || 'Unknown Error'}`)
    } finally {
      setOpenAICodexBusy(false)
    }
  }

  const openAICodexAccountIdPreview = (() => {
    const accountId = String(openAICodexCredentials?.accountId || '').trim()
    if (!accountId) return ''
    if (accountId.length <= 16) return accountId
    return `${accountId.slice(0, 8)}...${accountId.slice(-6)}`
  })()

  const isDifyConfigured = Boolean(String(difyBaseUrl || '').trim() && String(difyApiKey || '').trim())
  const isMorosConfigured = Boolean(String(morosBaseUrl || '').trim() && String(morosApiKey || '').trim())
  const isCopilotConfigured = Boolean(copilotCredentials?.access)
  const isOpenAICodexConfigured = Boolean(openAICodexCredentials?.access)
  const isOpenCodeConfigured = Boolean(String(opencodeGoApiKey || '').trim())

  return (
    <div className="settings-view integrations-view">
      <h1 className="settings-view-title">{t('settings.integrations') || 'Integrations'}</h1>
      <p className="settings-view-subtitle">External API connections</p>

      <div className="integrations-grid">
        <div className="settings-card integration-card">
          <div className="integration-card-head">
            <div className="integration-card-heading">
              <span className="integration-card-icon" aria-hidden>
                <img src="/assets/provider-icons/dify.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
              </span>
              <h2 className="settings-card-title">{t('settings.dify.title')}</h2>
            </div>
            <span className={`integration-card-status ${isDifyConfigured ? 'ready' : 'pending'}`}>
              {isDifyConfigured ? '已配置' : '待配置'}
            </span>
          </div>

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

        <div className="settings-card integration-card">
          <div className="integration-card-head">
            <div className="integration-card-heading">
              <span className="integration-card-icon" aria-hidden>
                <img src="/favicon.svg" alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
              </span>
              <h2 className="settings-card-title">MoRos Image</h2>
            </div>
            <span className={`integration-card-status ${isMorosConfigured ? 'ready' : 'pending'}`}>
              {isMorosConfigured ? '已配置' : '待配置'}
            </span>
          </div>
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

        <div className="settings-card integration-card integration-card-wide">
          <div className="integration-card-head">
            <div className="integration-card-heading">
              <span className="integration-card-icon" aria-hidden>
                <img src="/assets/provider-icons/github.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              </span>
              <h2 className="settings-card-title">GitHub Copilot OAuth</h2>
            </div>
            <span className={`integration-card-status ${isCopilotConfigured ? 'ready' : 'pending'}`}>
              {isCopilotConfigured ? '已连接' : '未登录'}
            </span>
          </div>

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

        <div className="settings-card integration-card integration-card-wide">
          <div className="integration-card-head">
            <div className="integration-card-heading">
              <span className="integration-card-icon" aria-hidden>
                <img src="/assets/provider-icons/codex.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              </span>
              <h2 className="settings-card-title">OpenAI Codex OAuth</h2>
            </div>
            <span className={`integration-card-status ${isOpenAICodexConfigured ? 'ready' : 'pending'}`}>
              {isOpenAICodexConfigured ? '已连接' : '未登录'}
            </span>
          </div>

          <div className="field-item">
            <label className="field-label">Account</label>
            <p className="field-hint">
              {openAICodexCredentials
                ? `当前状态：已登录${openAICodexAccountIdPreview ? ` (${openAICodexAccountIdPreview})` : ''}`
                : '当前状态：未登录'}
            </p>
            <p className="field-hint">
              登录流程会使用 PKCE 打开 OpenAI 授权页，并通过本地回调地址
              {' '}
              <code>http://localhost:1455/auth/callback</code>
              {' '}
              完成授权。
            </p>
          </div>
          <div className="field-item">
            <div className="inline-actions">
              {!openAICodexCredentials ? (
                <button className="settings-btn" onClick={handleLoginOpenAICodex} disabled={openAICodexBusy}>
                  {openAICodexBusy ? '授权中...' : 'Login with OpenAI Codex'}
                </button>
              ) : (
                <>
                  <button className="settings-btn" onClick={handleTestOpenAICodex} disabled={openAICodexBusy}>
                    测试连接
                  </button>
                  <button className="settings-btn ghost" onClick={handleLogoutOpenAICodex} disabled={openAICodexBusy}>
                    Logout
                  </button>
                </>
              )}
            </div>
            {openAICodexStatus && (
              <p className="field-hint" style={{ marginTop: '10px' }}>
                {openAICodexStatus}
              </p>
            )}
          </div>
        </div>

        <div className="settings-card integration-card integration-card-wide">
          <div className="integration-card-head">
            <div className="integration-card-heading">
              <span className="integration-card-icon" aria-hidden>
                <img src="/assets/provider-icons/opencode.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
              </span>
              <h2 className="settings-card-title">OpenCode Go</h2>
            </div>
            <span className={`integration-card-status ${isOpenCodeConfigured ? 'ready' : 'pending'}`}>
              {isOpenCodeConfigured ? '已配置' : '待配置'}
            </span>
          </div>
          <div className="field-item">
            <label className="field-label">Base URL</label>
            <input
              className="field-input"
              placeholder="https://opencode.ai/zen/go/v1"
              value={opencodeGoBaseUrl}
              onChange={(e) => setOpenCodeGoBase(e.target.value)}
              onBlur={() => setOpenCodeGoBaseUrl(opencodeGoBaseUrl.trim())}
            />
            <p className="field-hint">默认即可，除非你有自托管或代理端点。</p>
          </div>

          <div className="field-item">
            <label className="field-label">OPENCODE_API_KEY</label>
            <div className="inline-actions">
              <input
                className="field-input"
                type={opencodeGoApiVisible ? 'text' : 'password'}
                placeholder="ocg_..."
                value={opencodeGoApiKey}
                onChange={(e) => setOpenCodeGoKey(e.target.value)}
                onBlur={() => setOpenCodeGoApiKey(opencodeGoApiKey.trim())}
              />
              <button className="settings-btn ghost" onClick={() => setOpenCodeGoApiVisible((v) => !v)}>
                {opencodeGoApiVisible ? t('settings.dify.hide') : t('settings.dify.show')}
              </button>
            </div>
            <p className="field-hint">用于 provider=`opencode-go`（GLM-5 / Kimi K2.5 / MiniMax M2.5）。</p>
          </div>

          <div className="field-item">
            <button
              className="settings-btn"
              disabled={opencodeGoBusy}
              onClick={async () => {
                setOpenCodeGoBusy(true)
                try {
                  setOpenCodeGoBaseUrl(opencodeGoBaseUrl.trim())
                  setOpenCodeGoApiKey(opencodeGoApiKey.trim())
                  const result = await testOpenCodeGoConnection(opencodeGoBaseUrl.trim(), opencodeGoApiKey.trim())
                  setOpenCodeGoStatus(result.ok ? 'success' : `error:${result.error || 'Unknown Error'}`)
                } finally {
                  setOpenCodeGoBusy(false)
                }
              }}
            >
              {opencodeGoBusy ? '测试中...' : '测试连接'}
            </button>
            {opencodeGoStatus && (
              <span className={`connection-status ${opencodeGoStatus.startsWith('success') ? 'success' : 'error'}`}>
                {opencodeGoStatus.startsWith('success')
                    ? '连接成功'
                    : `连接失败：${(opencodeGoStatus.split(':')[1] || '').trim()}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const SkillsSettings = () => {
  const [presets, setPresets] = useState([])
  const [loading, setLoading] = useState(true)
  const [installingId, setInstallingId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const SkillPresetIcon = ({ preset }) => {
    const [coverFailed, setCoverFailed] = useState(false)
    const [defaultFailed, setDefaultFailed] = useState(false)
    const coverPath = String(preset?.coverImagePath || '').trim()
    const coverIconUrl = coverPath
      ? (isAbsolutePath(coverPath) ? filesApi.getRawAbsoluteFileUrl(coverPath) : filesApi.getRawFileUrl(coverPath))
      : ''
    const fallbackIconUrl = resolveDefaultSkillIconUrl(preset)
    const preferredCoverUrl = coverFailed ? '' : coverIconUrl
    const fallbackUrl = defaultFailed ? '' : fallbackIconUrl
    const iconUrl = preferredCoverUrl || fallbackUrl
    const isUsingCoverIcon = Boolean(preferredCoverUrl)
    const fallback = String(preset?.name || preset?.id || '?').trim().charAt(0).toUpperCase()
    const iconAccentColor = String(preset?.color || '').trim()

    useEffect(() => {
      setCoverFailed(false)
      setDefaultFailed(false)
    }, [coverPath, fallbackIconUrl])

    return (
      <span
        className="skill-preset-icon"
        style={iconAccentColor ? { boxShadow: `inset 0 0 0 1px ${iconAccentColor}` } : undefined}
        aria-hidden
      >
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className="skill-preset-icon-image"
            loading="lazy"
            onError={() => {
              if (isUsingCoverIcon) {
                setCoverFailed(true)
              } else {
                setDefaultFailed(true)
              }
            }}
          />
        ) : (
          <span className="skill-preset-icon-fallback">{fallback || '?'}</span>
        )}
      </span>
    )
  }

  const loadPresets = useCallback(async () => {
    try {
      setLoading(true)
      setErrorMessage('')
      const [items, fileTree] = await Promise.all([
        filesApi.getSkillPresets(),
        filesApi.getFileTree(),
      ])
      const folderMap = new Map(
        (Array.isArray(fileTree) ? fileTree : [])
          .filter((node) => node?.type === 'folder')
          .map((node) => [normalizePath(node?.path).toLowerCase(), node]),
      )
      const nextItems = (Array.isArray(items) ? items : []).map((preset) => {
        const presetPath = normalizePath(preset?.path || `skills/${preset?.id || ''}`).toLowerCase()
        const folderNode = folderMap.get(presetPath)
        return {
          ...preset,
          color: String(folderNode?.color || '').trim() || undefined,
          coverImagePath: String(folderNode?.coverImagePath || '').trim() || undefined,
        }
      })
      setPresets(nextItems)
    } catch (error) {
      setErrorMessage(error?.message || '读取 Skills 列表失败')
      setPresets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPresets()
  }, [loadPresets])

  const handleInstallPreset = async (presetId) => {
    if (!presetId || installingId) return
    try {
      setInstallingId(presetId)
      setErrorMessage('')
      await filesApi.installSkillPreset(presetId)
      await loadPresets()
      window.dispatchEvent(new CustomEvent('moros:file-tree-refresh-request', {
        detail: { source: 'settings-skill-install' },
      }))
      window.dispatchEvent(new CustomEvent('moros:skills-updated'))
    } catch (error) {
      setErrorMessage(error?.message || '安装 Skill 失败')
    } finally {
      setInstallingId('')
    }
  }

  const handleUninstallPreset = async (preset) => {
    const folderPath = String(preset?.path || `skills/${preset?.folderName || preset?.id || ''}`).trim()
    if (!folderPath || installingId) return
    try {
      setInstallingId(String(preset?.id || ''))
      await filesApi.deleteItem(folderPath)
      await loadPresets()
      window.dispatchEvent(new CustomEvent('moros:file-tree-refresh-request', {
        detail: { source: 'settings-skill-uninstall' },
      }))
      window.dispatchEvent(new CustomEvent('moros:skills-updated'))
    } catch (error) {
      setErrorMessage(error?.message || '卸载 Skill 失败')
    } finally {
      setInstallingId('')
    }
  }

  const installedPresets = presets.filter((p) => p?.installed)
  const notInstalledPresets = presets.filter((p) => !p?.installed)

  const renderRow = (preset) => {
    const presetId = String(preset?.id || '')
    const isInstalled = Boolean(preset?.installed)
    const isBusy = installingId === presetId
    return (
      <div key={presetId} className="skill-row">
        <SkillPresetIcon preset={preset} />
        <div className="skill-row-meta">
          <span className="skill-row-name">{preset?.name || presetId}</span>
          <span className="skill-row-desc">{preset?.description || ''}</span>
        </div>
        <div className="skill-row-action">
          {isInstalled ? (
            <label className="skill-toggle">
              <input
                type="checkbox"
                checked
                disabled={isBusy}
                onChange={() => handleUninstallPreset(preset)}
              />
              <span className="skill-toggle-track" />
            </label>
          ) : (
            <button
              type="button"
              className="skill-row-install-btn"
              disabled={isBusy}
              onClick={() => handleInstallPreset(presetId)}
              title="Install"
            >
              {isBusy ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spinnerRotate 0.8s linear infinite' }}>
                  <circle cx="7" cy="7" r="5.5" stroke="var(--border-color)" strokeWidth="1" />
                  <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="var(--text-primary)" strokeWidth="1" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="settings-view skills-view">
      <h1 className="settings-view-title">Skills</h1>
      <p className="settings-view-subtitle">Give MoRos superpowers</p>

      {errorMessage && (
        <div className="settings-card skills-error-card">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="skills-loading">Loading skills...</div>
      ) : presets.length === 0 ? (
        <div className="skills-loading">No skills available</div>
      ) : (
        <>
          {installedPresets.length > 0 && (
            <div className="skills-group">
              <h3 className="skills-group-title">Installed</h3>
              <div className="skills-grid">
                {installedPresets.map((preset) => renderRow(preset))}
              </div>
            </div>
          )}
          {notInstalledPresets.length > 0 && (
            <div className="skills-group">
              <h3 className="skills-group-title">Available</h3>
              <div className="skills-grid">
                {notInstalledPresets.map((preset) => renderRow(preset))}
              </div>
            </div>
          )}
        </>
      )}
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
    globalSystemPrompt,
    onSaveGlobalSystemPrompt,
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
            globalSystemPrompt={globalSystemPrompt}
            onSaveGlobalSystemPrompt={onSaveGlobalSystemPrompt}
          />
        )
      case 'integrations':
        return <IntegrationsSettings />
      case 'skills':
        return <SkillsSettings />
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
            <span className="settings-nav-item-label">{t('settings.profile') || 'Account'}</span>
          </button>
          <button
            className={`settings-nav-item ${activeCategory === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveCategory('settings')}
          >
            <span className="settings-nav-item-label">{t('settings.app_settings') || 'Settings'}</span>
          </button>
          <button
            className={`settings-nav-item ${activeCategory === 'integrations' ? 'active' : ''}`}
            onClick={() => setActiveCategory('integrations')}
          >
            <span className="settings-nav-item-label">{t('settings.integrations') || 'Integrations'}</span>
          </button>
          <button
            className={`settings-nav-item ${activeCategory === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveCategory('skills')}
          >
            <span className="settings-nav-item-label">Skills</span>
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
