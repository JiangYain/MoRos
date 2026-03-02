import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../utils/i18n'
import {
  Edit3, Save, Eye, Columns, Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Quote, Link as LinkIcon, Image as ImageIcon, Table as TableIcon,
  Minus, Code, MoreHorizontal
} from 'lucide-react'

function Toolbar({
  parentDirName,
  currentFileName,
  hasChanges,
  onSave,
  saving,
  stats,
  viewMode,
  setViewMode,
  applyInlineWrap,
  toggleHeading,
  toggleUnorderedList,
  toggleOrderedList,
  toggleChecklist,
  toggleQuote,
  insertLink,
  triggerImageUpload,
  insertCodeBlock,
  insertTable,
  insertHr,
}) {
  const { t } = useI18n()
  const [moreOpen, setMoreOpen] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const moreBtnRef = useRef(null)
  const moreMenuRef = useRef(null)
  const modeBtnRef = useRef(null)
  const modeMenuRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      const target = e.target
      // more
      if (moreOpen) {
        if (moreMenuRef.current && moreMenuRef.current.contains(target)) return
        if (moreBtnRef.current && moreBtnRef.current.contains(target)) return
        setMoreOpen(false)
      }
      // mode
      if (modeOpen) {
        if (modeMenuRef.current && modeMenuRef.current.contains(target)) return
        if (modeBtnRef.current && modeBtnRef.current.contains(target)) return
        setModeOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [moreOpen, modeOpen])

  return (
    <div className="content-toolbar">
      <div className="file-info">
        {parentDirName && <span className="folder-name">{parentDirName}</span>}
        {parentDirName && <span className="breadcrumb-sep">›</span>}
        <span className="file-name">{currentFileName}</span>
        {hasChanges && <span className="unsaved-indicator">•</span>}
      </div>

      <div className="toolbar-actions">
        <div className="toolbar-group">
          <button
            ref={modeBtnRef}
            className={`toolbar-btn mode-btn ${viewMode}`}
            onClick={() => {
              // 点击循环切换：preview <-> split
              setViewMode((m) => (m === 'preview' ? 'split' : 'preview'))
            }}
            onContextMenu={(e) => { e.preventDefault(); setModeOpen((v) => !v) }}
            title={t('main.tooltips.editor_mode_switch_hint')}
          >
            {viewMode === 'preview' && <Eye size={16} />}
            {viewMode === 'split' && <Columns size={16} />}
            <span className="mode-label">{viewMode === 'preview' ? t('main.mode_preview') : t('main.mode_split')}</span>
          </button>
        </div>

        {modeOpen && (
          <div ref={modeMenuRef} className="toolbar-menu mode">
            <div className="toolbar-menu-section">
              <span className="toolbar-menu-title">{t('main.editor_mode')}</span>
              <div className="toolbar-menu-grid">
                <button onClick={() => { setViewMode('preview'); setModeOpen(false) }} title={t('main.tooltips.preview')}><Eye size={16} /></button>
                <button onClick={() => { setViewMode('split'); setModeOpen(false) }} title={t('main.tooltips.split')}><Columns size={16} /></button>
              </div>
            </div>
            <div className="toolbar-menu-section">
              <span className="toolbar-menu-title">{t('main.shortcuts_menu')}</span>
              <div className="toolbar-menu-hints">Ctrl+E</div>
            </div>
          </div>
        )}

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button className="toolbar-btn" title={t('main.tooltips.bold')} onClick={() => applyInlineWrap('**', '**', 'bold')}><Bold size={16} /></button>
          <button className="toolbar-btn" title={t('main.tooltips.h2')} onClick={() => toggleHeading(2)}><Heading2 size={16} /></button>
          <button className="toolbar-btn" title={t('main.tooltips.ul')} onClick={toggleUnorderedList}><List size={16} /></button>
          <button className="toolbar-btn" title={t('main.tooltips.link')} onClick={insertLink}><LinkIcon size={16} /></button>
          <button className="toolbar-btn" title={t('main.tooltips.image')} onClick={triggerImageUpload}><ImageIcon size={16} /></button>
        </div>

        <button ref={moreBtnRef} className="toolbar-btn" title={t('main.tooltips.more_formats')} onClick={() => setMoreOpen((v) => !v)}>
          <MoreHorizontal size={16} />
        </button>

        {hasChanges && (
          <button className="toolbar-btn save-btn" onClick={onSave} disabled={saving} title={t('main.tooltips.save')}><Save size={16} />{saving ? t('main.saving') : t('main.save')}</button>
        )}
        <div className="toolbar-meta"><span>{stats.words} {t('main.words')} · {stats.chars} {t('main.chars')}</span></div>

        {moreOpen && (
          <div ref={moreMenuRef} className="toolbar-menu">
            <div className="toolbar-menu-section">
              <span className="toolbar-menu-title">{t('main.inline')}</span>
              <div className="toolbar-menu-grid">
                <button onClick={() => { applyInlineWrap('*', '*', 'italic'); setMoreOpen(false) }} title={t('main.tooltips.italic')}><Italic size={16} /></button>
                <button onClick={() => { applyInlineWrap('~~', '~~', 'strike'); setMoreOpen(false) }} title={t('main.tooltips.strike')}><Strikethrough size={16} /></button>
                <button onClick={() => { applyInlineWrap('`', '`', 'code'); setMoreOpen(false) }} title={t('main.tooltips.code_inline')}><Code size={16} /></button>
              </div>
            </div>
            <div className="toolbar-menu-section">
              <span className="toolbar-menu-title">{t('main.headings')}</span>
              <div className="toolbar-menu-grid">
                <button onClick={() => { toggleHeading(1); setMoreOpen(false) }} title="H1"><Heading1 size={16} /></button>
                <button onClick={() => { toggleHeading(2); setMoreOpen(false) }} title="H2"><Heading2 size={16} /></button>
                <button onClick={() => { toggleHeading(3); setMoreOpen(false) }} title="H3"><Heading3 size={16} /></button>
              </div>
            </div>
            <div className="toolbar-menu-section">
              <span className="toolbar-menu-title">{t('main.lists_quotes')}</span>
              <div className="toolbar-menu-grid">
                <button onClick={() => { toggleUnorderedList(); setMoreOpen(false) }} title={t('main.tooltips.ul')}><List size={16} /></button>
                <button onClick={() => { toggleOrderedList(); setMoreOpen(false) }} title={t('main.tooltips.ol')}><ListOrdered size={16} /></button>
                <button onClick={() => { toggleChecklist(); setMoreOpen(false) }} title={t('main.tooltips.checklist')}><CheckSquare size={16} /></button>
                <button onClick={() => { toggleQuote(); setMoreOpen(false) }} title={t('main.tooltips.quote')}><Quote size={16} /></button>
              </div>
            </div>
            <div className="toolbar-menu-section">
              <span className="toolbar-menu-title">{t('main.insert')}</span>
              <div className="toolbar-menu-grid">
                <button onClick={() => { insertCodeBlock(); setMoreOpen(false) }} title={t('main.tooltips.code_block')}><Code size={16} /></button>
                <button onClick={() => { insertTable(); setMoreOpen(false) }} title={t('main.tooltips.table')}><TableIcon size={16} /></button>
                <button onClick={() => { insertHr(); setMoreOpen(false) }} title={t('main.tooltips.hr')}><Minus size={16} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Toolbar

