import React, { useState, useEffect } from 'react'
import { RotateCcw, X } from 'lucide-react'
import './StyleConfigurator.css'
import { useI18n } from '../utils/i18n'

// 预设颜色主题
const colorPresets = {
  nightPurple: {
    name: '朱砂',
    primary: '#1a1a1a',
    secondary: '#F1A094',
    accent: '#1a1a1a',
    background: '#FFF4F2',
    border: '#F1A094'
  },
  ocean: {
    name: '海洋',
    primary: '#0ea5e9',
    secondary: '#7dd3fc',
    accent: '#0284c7',
    background: '#f0f9ff',
    border: '#7dd3fc'
  },
  forest: {
    name: '森林',
    primary: '#22c55e',
    secondary: '#86efac',
    accent: '#16a34a',
    background: '#f0fdf4',
    border: '#86efac'
  },
  sunset: {
    name: '日落',
    primary: '#f97316',
    secondary: '#fed7aa',
    accent: '#ea580c',
    background: '#fff7ed',
    border: '#fed7aa'
  },
  elegant: {
    name: '优雅',
    primary: '#6366f1',
    secondary: '#c7d2fe',
    accent: '#4f46e5',
    background: '#f8fafc',
    border: '#c7d2fe'
  }
}

// 字体选项
const fontOptions = [
  { value: 'system', name: '系统字体', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { value: 'serif', name: '衬线字体', family: 'Georgia, "Times New Roman", Times, serif' },
  { value: 'optima', name: 'Optima', family: 'Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, serif' },
  { value: 'pingfang', name: '苹方', family: 'PingFangSC-Regular, PingFangTC-Regular, sans-serif' },
  { value: 'songti', name: '宋体', family: 'SimSun, "Songti SC", serif' }
]

function StyleConfigurator({ isOpen, onClose, onStyleChange, currentConfig, width = 420, isFixedPanel = false }) {
  const { t } = useI18n()
  const [config, setConfig] = useState({
    // 颜色配置
    colorTheme: 'nightPurple',
    customColors: {
      primary: '#1a1a1a',
      secondary: '#F1A094',
      accent: '#1a1a1a',
      background: '#FFF4F2',
      border: '#F1A094'
    },
    
    // 字体配置
    fontFamily: 'optima',
    fontSize: 16,
    lineHeight: 1.6,
    letterSpacing: 2,
    
    // 标题配置
    h1Size: 25,
    h2Size: 22,
    h3Size: 18,
    h4Size: 16,
    h5Size: 14,
    h6Size: 12,
    
    // 段落配置
    paragraphSize: 14,
    paragraphSpacing: 10,
    
    // 列表配置
    listSize: 15,
    listSpacing: 5,
    
    // 引用配置
    blockquoteStyle: 'left-border', // 'left-border', 'background', 'rounded'
    
    // 代码配置
    codeTheme: 'atom-one-dark', // 'atom-one-dark', 'github', 'vs'
    codeBackground: '#2d3748',
    codeBorderRadius: 8,
    macStyle: true, // Mac风格代码块
    
    // 表格配置
    tableStyle: 'striped', // 'striped', 'bordered', 'minimal'
    
    // 链接配置
    linkStyle: 'underline', // 'underline', 'highlight', 'minimal'
    
    // 间距配置
    contentPadding: 10,
    sectionSpacing: 20,
    
    // 强调样式
    boldStyle: 'brackets', // 'brackets', 'color', 'weight'
    
    ...currentConfig
  })

  useEffect(() => {
    generateCSS()
  }, [config])

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  const updateCustomColor = (colorKey, value) => {
    setConfig(prev => ({
      ...prev,
      customColors: {
        ...prev.customColors,
        [colorKey]: value
      }
    }))
  }

  const applyColorPreset = (presetKey) => {
    const preset = colorPresets[presetKey]
    setConfig(prev => ({
      ...prev,
      colorTheme: presetKey,
      customColors: {
        primary: preset.primary,
        secondary: preset.secondary,
        accent: preset.accent,
        background: preset.background,
        border: preset.border
      }
    }))
  }

  const generateCSS = () => {
    const { customColors, fontFamily, fontSize, lineHeight, letterSpacing } = config
    const font = fontOptions.find(f => f.value === fontFamily)
    
    const css = `/*
 * MoRos 自定义主题
 * 基于用户配置自动生成
 */

/*全局属性*/
#nice {
  font-size: ${fontSize}px;
  color: var(--text-primary);
  padding: 0 ${config.contentPadding}px;
  line-height: ${lineHeight};
  letter-spacing: ${letterSpacing}px;
  word-break: break-word;
  word-wrap: break-word;
  text-align: left;
  font-family: ${font.family};
  margin-top: -10px;
  
  /* 背景纹理 */
  background-image: linear-gradient(90deg, rgba(50, 0, 0, 0.05) 3%, rgba(0, 0, 0, 0) 3%), linear-gradient(360deg, rgba(50, 0, 0, 0.05) 3%, rgba(0, 0, 0, 0) 3%);
  background-size: 20px 20px;
  background-position: center center;
}

/*段落*/
#nice p {
  margin: ${config.paragraphSpacing}px 0px;
  letter-spacing: ${letterSpacing}px;
  font-size: ${config.paragraphSize}px;
  word-spacing: 2px;
  padding-top: 8px;
  padding-bottom: 8px;
  line-height: 26px;
  color: var(--text-primary);
}

/*标题*/
#nice h1,
#nice h2,
#nice h3,
#nice h4,
#nice h5,
#nice h6 {
  margin-top: ${config.sectionSpacing + 10}px;
  margin-bottom: 15px;
  font-weight: bold;
  color: var(--text-primary);
}

/* 一级标题 */
#nice h1 {
  font-size: ${config.h1Size}px;
}
#nice h1 .content {
  display: inline-block;
  font-weight: bold;
  color: ${customColors.accent};
}

/* 二级标题 */
#nice h2 {
  text-align: left;
  margin: ${config.sectionSpacing}px 10px 0px 0px;
  font-size: ${config.h2Size}px;
}
#nice h2 .content {
  font-size: ${config.h2Size - 4}px;
  font-weight: bold;
  display: inline-block;
  padding-left: 10px;
  border-left: 5px solid ${customColors.primary};
}

/* 三级标题 */
#nice h3 {
  font-size: ${config.h3Size}px;
  font-weight: bold;
  text-align: center;
}
#nice h3 .content {
  border-bottom: 2px solid ${customColors.secondary};
}

#nice h4 { font-size: ${config.h4Size}px; }
#nice h5 { font-size: ${config.h5Size}px; }
#nice h6 { font-size: ${config.h6Size}px; }

/*列表*/
#nice ul,
#nice ol {
  margin-top: 8px;
  margin-bottom: 8px;
  padding-left: 25px;
  color: var(--text-primary);
}
#nice ul {
  font-size: ${config.listSize}px;
  list-style-type: circle;
}
#nice ol {
  font-size: ${config.listSize}px;
  list-style-type: decimal;
}
#nice li section {
  font-size: ${config.listSize - 1}px;
  font-weight: normal;
  margin-top: ${config.listSpacing}px;
  margin-bottom: ${config.listSpacing}px;
  line-height: 26px;
  text-align: left;
  color: var(--text-primary);
}

/*引用*/
#nice blockquote {
  display: block;
  font-size: 0.9em;
  overflow: auto;
  border-left: 3px solid ${customColors.border};
  background: ${customColors.background};
  color: #6a737d;
  padding: 10px 10px 10px 20px;
  margin: ${config.sectionSpacing}px 0;
  ${config.blockquoteStyle === 'rounded' ? 'border-radius: 8px;' : ''}
}
#nice blockquote p {
  margin: 0px;
  color: var(--text-primary);
  line-height: 26px;
}

/*链接*/
#nice a {
  color: ${customColors.primary};
  font-weight: bolder;
  ${config.linkStyle === 'underline' ? `border-bottom: 1px solid ${customColors.primary};` : ''}
  ${config.linkStyle === 'highlight' ? `background: ${customColors.background}; padding: 2px 4px; border-radius: 3px;` : ''}
  text-decoration: none;
  word-wrap: break-word;
}

/*加粗*/
#nice strong {
  color: ${customColors.primary};
  font-weight: bold;
}
${config.boldStyle === 'brackets' ? `
#nice strong::before { content: '「'; }
#nice strong::after { content: '」'; }
` : ''}

/*代码块*/
#nice pre {
  margin-top: 10px;
  margin-bottom: 10px;
  border-radius: ${config.codeBorderRadius}px;
  font-size: 14px;
  -webkit-overflow-scrolling: touch;
  ${config.macStyle ? `
  position: relative;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  ` : ''}
}
#nice pre code {
  padding: ${config.macStyle ? '40px 15px 15px 15px' : '15px 12px'};
  overflow: auto;
  display: block;
  background: ${config.codeBackground};
  color: #abb2bf;
  border-radius: ${config.codeBorderRadius}px;
  ${config.macStyle ? `
  position: relative;
  ` : ''}
}

${config.macStyle ? `
/* Mac风格窗口装饰 */
#nice pre:before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(to bottom, #f6f6f6, #e8e8e8);
  border-radius: ${config.codeBorderRadius}px ${config.codeBorderRadius}px 0 0;
  border-bottom: 1px solid #d1d1d1;
}

#nice pre:after {
  content: '';
  position: absolute;
  top: 9px;
  left: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff5f56;
  box-shadow: 
    20px 0 0 #ffbd2e,
    40px 0 0 #27ca3f;
}

[data-theme="dark"] #nice pre:before {
  background: linear-gradient(to bottom, #3c3c3c, #2d2d2d);
  border-bottom-color: #1a1a1a;
}
` : ''}

/*行内代码*/
#nice p code,
#nice li code {
  font-size: 14px;
  word-wrap: break-word;
  padding: 2px 4px;
  border-radius: 3px;
  color: #476582;
  background: rgba(71, 101, 130, 0.1);
  font-family: 'SF Mono', Monaco, Inconsolata, 'Roboto Mono', Consolas, 'Courier New', Courier, monospace;
}

/*表格*/
#nice table {
  display: table;
  text-align: left;
  margin: ${config.sectionSpacing}px auto;
  border-collapse: collapse;
  ${config.tableStyle === 'bordered' ? `border: 1px solid ${customColors.border};` : ''}
}
#nice tbody {
  border: 0;
}
#nice table tr {
  border: 0;
  ${config.tableStyle === 'striped' ? `border-top: 1px solid ${customColors.border};` : ''}
}
#nice table tr:nth-child(2n) {
  ${config.tableStyle === 'striped' ? `background-color: ${customColors.background};` : ''}
}
#nice table tr th,
#nice table tr td {
  font-size: 14px;
  border: ${config.tableStyle === 'bordered' ? `1px solid ${customColors.border}` : '0'};
  padding: 10px;
  text-align: left;
}
#nice table tr th {
  font-weight: bold;
  background: ${customColors.background};
  border-bottom: 2px solid ${customColors.primary};
}

/* 图片 */
#nice img {
  display: block;
  margin: ${config.sectionSpacing}px auto;
  max-width: 100%;
  border-radius: 6px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

/* 分割线 */
#nice hr {
  border: none;
  border-top: 2px solid ${customColors.secondary};
  margin: ${config.sectionSpacing * 2}px 0;
}

/* Mac风格代码语法高亮 */
.hljs {
  background: ${config.codeBackground} !important;
  color: #abb2bf !important;
  border-radius: ${config.codeBorderRadius}px !important;
}
.hljs-comment { color: #5c6370 !important; font-style: italic !important; }
.hljs-quote { color: #5c6370 !important; font-style: italic !important; }
.hljs-doctag, .hljs-keyword, .hljs-formula { color: #c678dd !important; }
.hljs-section, .hljs-name, .hljs-selector-tag, .hljs-deletion, .hljs-subst { color: #e06c75 !important; }
.hljs-literal { color: #56b6c2 !important; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute, .hljs-meta-string { color: #98c379 !important; }
.hljs-built_in, .hljs-class .hljs-title { color: #e6c07b !important; }
.hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-type, .hljs-selector-class, .hljs-selector-attr, .hljs-selector-pseudo, .hljs-number { color: #d19a66 !important; }
.hljs-symbol, .hljs-bullet, .hljs-link, .hljs-meta, .hljs-selector-id, .hljs-title { color: #61aeee !important; }
.hljs-emphasis { font-style: italic !important; }
.hljs-strong { font-weight: bold !important; }
.hljs-link { text-decoration: underline !important; }
`

    onStyleChange?.(css)
  }

  const handleReset = () => {
    setConfig({
      colorTheme: 'nightPurple',
      customColors: colorPresets.nightPurple,
      fontFamily: 'optima',
      fontSize: 16,
      lineHeight: 1.6,
      letterSpacing: 2,
      h1Size: 25,
      h2Size: 22,
      h3Size: 18,
      h4Size: 16,
      h5Size: 14,
      h6Size: 12,
      paragraphSize: 14,
      paragraphSpacing: 10,
      listSize: 15,
      listSpacing: 5,
      blockquoteStyle: 'left-border',
      codeTheme: 'atom-one-dark',
      codeBackground: '#2d3748',
      codeBorderRadius: 8,
      macStyle: true,
      tableStyle: 'striped',
      linkStyle: 'underline',
      contentPadding: 10,
      sectionSpacing: 20,
      boldStyle: 'brackets'
    })
  }

  if (!isOpen) return null

  return (
    <>
      {/* 侧边栏/面板 */}
      <div 
        className={`style-configurator ${isFixedPanel ? 'fixed-panel' : ''}`}
        style={{ width: `${width}px`, position: isFixedPanel ? 'relative' : undefined }}
      >
        <div className="style-configurator-header">
          <div className="configurator-title">
            <span>{t('style.header.title')}</span>
          </div>
          <div className="configurator-controls">
            <button
              className="control-btn reset-btn"
              onClick={handleReset}
              title={t('style.header.reset_title')}
            >
              <RotateCcw size={14} />
            </button>
            <button
              className="control-btn close-btn"
              onClick={onClose}
              title={t('style.header.close_title')}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="style-configurator-content">
            {/* 颜色主题 */}
            <div className="config-section">
              <div className="color-theme-header">
                <h3 className="section-title">{t('style.sections.color_theme')}</h3>
                <div className="color-theme-slider">
                  <div className="slider-track">
                    <div className="slider-segments">
                      {Object.entries(colorPresets).map(([key, preset]) => (
                        <div
                          key={key}
                          className={`slider-segment ${config.colorTheme === key ? 'active' : ''}`}
                          onClick={() => applyColorPreset(key)}
                        >
                          <div 
                            className="slider-segment-background"
                            style={{ 
                              '--primary': preset.primary,
                              '--secondary': preset.secondary,
                              background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`
                            }}
                          />
                          <div className="slider-segment-label">{t(`style.presets.${key}`)}</div>
                        </div>
                      ))}
                    </div>
                    <div 
                      className="slider-indicator"
                                          style={{
                      width: `calc(${100 / Object.keys(colorPresets).length}% - 4px)`,
                      left: `calc(${Object.keys(colorPresets).indexOf(config.colorTheme) * (100 / Object.keys(colorPresets).length)}% + 2px)`,
                      '--primary': config.customColors.primary,
                      '--secondary': config.customColors.secondary,
                      background: `linear-gradient(135deg, ${config.customColors.primary}, ${config.customColors.secondary})`
                    }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="custom-colors-horizontal">
                <div className="color-item">
                  <label>{t('style.labels.primary')}</label>
                  <input
                    type="color"
                    value={config.customColors.primary}
                    onChange={(e) => updateCustomColor('primary', e.target.value)}
                  />
                </div>
                <div className="color-item">
                  <label>{t('style.labels.secondary')}</label>
                  <input
                    type="color"
                    value={config.customColors.secondary}
                    onChange={(e) => updateCustomColor('secondary', e.target.value)}
                  />
                </div>
                <div className="color-item">
                  <label>{t('style.labels.accent')}</label>
                  <input
                    type="color"
                    value={config.customColors.accent}
                    onChange={(e) => updateCustomColor('accent', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 字体设置 */}
            <div className="config-section">
              <h3 className="section-title">{t('style.sections.font_settings')}</h3>
              <div className="form-row">
                <label>{t('style.labels.font_family')}</label>
                <select
                  className="form-select"
                  value={config.fontFamily}
                  onChange={(e) => updateConfig('fontFamily', e.target.value)}
                >
                  {fontOptions.map(font => (
                    <option key={font.value} value={font.value}>{t(`style.fonts.${font.value}`, { default: font.name })}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.base_font_size')}</label>
                <select
                  className="form-select"
                  value={config.fontSize}
                  onChange={(e) => updateConfig('fontSize', parseInt(e.target.value))}
                >
                  {[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map(size => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.line_height')}</label>
                <select
                  className="form-select"
                  value={config.lineHeight}
                  onChange={(e) => updateConfig('lineHeight', parseFloat(e.target.value))}
                >
                  {[1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0].map(height => (
                    <option key={height} value={height}>{height}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 标题尺寸 */}
            <div className="config-section">
              <h3 className="section-title">{t('style.sections.heading_sizes')}</h3>
              {[1,2,3,4,5,6].map(level => (
                <div key={level} className="form-row">
                  <label>H{level}</label>
                  <select
                    className="form-select"
                    value={config[`h${level}Size`]}
                    onChange={(e) => updateConfig(`h${level}Size`, parseInt(e.target.value))}
                  >
                    {[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].map(size => (
                      <option key={size} value={size}>{size}px</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* 样式选项 */}
            <div className="config-section">
              <h3 className="section-title">{t('style.sections.style_options')}</h3>
              <div className="form-row">
                <label>{t('style.labels.blockquote_style')}</label>
                <select
                  className="form-select"
                  value={config.blockquoteStyle}
                  onChange={(e) => updateConfig('blockquoteStyle', e.target.value)}
                >
                  <option value="left-border">{t('style.options.blockquote_left_border')}</option>
                  <option value="background">{t('style.options.blockquote_background')}</option>
                  <option value="rounded">{t('style.options.blockquote_rounded')}</option>
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.link_style')}</label>
                <select
                  className="form-select"
                  value={config.linkStyle}
                  onChange={(e) => updateConfig('linkStyle', e.target.value)}
                >
                  <option value="underline">{t('style.options.link_underline')}</option>
                  <option value="highlight">{t('style.options.link_highlight')}</option>
                  <option value="minimal">{t('style.options.link_minimal')}</option>
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.bold_style')}</label>
                <select
                  className="form-select"
                  value={config.boldStyle}
                  onChange={(e) => updateConfig('boldStyle', e.target.value)}
                >
                  <option value="brackets">{t('style.options.bold_brackets')}</option>
                  <option value="color">{t('style.options.bold_color')}</option>
                  <option value="weight">{t('style.options.bold_weight')}</option>
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.table_style')}</label>
                <select
                  className="form-select"
                  value={config.tableStyle}
                  onChange={(e) => updateConfig('tableStyle', e.target.value)}
                >
                  <option value="striped">{t('style.options.table_striped')}</option>
                  <option value="bordered">{t('style.options.table_bordered')}</option>
                  <option value="minimal">{t('style.options.table_minimal')}</option>
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.codeblock_style')}</label>
                <select
                  className="form-select"
                  value={config.macStyle ? 'mac' : 'simple'}
                  onChange={(e) => updateConfig('macStyle', e.target.value === 'mac')}
                >
                  <option value="mac">{t('style.options.code_style_mac')}</option>
                  <option value="simple">{t('style.options.code_style_simple')}</option>
                </select>
              </div>
            </div>

            {/* 间距设置 */}
            <div className="config-section">
              <h3 className="section-title">{t('style.sections.spacing_settings')}</h3>
              <div className="form-row">
                <label>{t('style.labels.content_padding')}</label>
                <select
                  className="form-select"
                  value={config.contentPadding}
                  onChange={(e) => updateConfig('contentPadding', parseInt(e.target.value))}
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40].map(padding => (
                    <option key={padding} value={padding}>{padding}px</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.paragraph_spacing')}</label>
                <select
                  className="form-select"
                  value={config.sectionSpacing}
                  onChange={(e) => updateConfig('sectionSpacing', parseInt(e.target.value))}
                >
                  {[5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30].map(spacing => (
                    <option key={spacing} value={spacing}>{spacing}px</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 段落设置 */}
            <div className="config-section">
              <h3 className="section-title">{t('style.sections.paragraph_settings')}</h3>
              <div className="form-row">
                <label>{t('style.labels.paragraph_font_size')}</label>
                <select
                  className="form-select"
                  value={config.paragraphSize}
                  onChange={(e) => updateConfig('paragraphSize', parseInt(e.target.value))}
                >
                  {[12, 13, 14, 15, 16, 17, 18, 19, 20].map(size => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.letter_spacing')}</label>
                <select
                  className="form-select"
                  value={config.letterSpacing}
                  onChange={(e) => updateConfig('letterSpacing', parseInt(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5].map(spacing => (
                    <option key={spacing} value={spacing}>{spacing}px</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 列表设置 */}
            <div className="config-section">
              <h3 className="section-title">{t('style.sections.list_settings')}</h3>
              <div className="form-row">
                <label>{t('style.labels.list_font_size')}</label>
                <select
                  className="form-select"
                  value={config.listSize}
                  onChange={(e) => updateConfig('listSize', parseInt(e.target.value))}
                >
                  {[12, 13, 14, 15, 16, 17, 18, 19, 20].map(size => (
                    <option key={size} value={size}>{size}px</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.list_item_spacing')}</label>
                <select
                  className="form-select"
                  value={config.listSpacing}
                  onChange={(e) => updateConfig('listSpacing', parseInt(e.target.value))}
                >
                  {[0, 2, 4, 5, 6, 8, 10].map(spacing => (
                    <option key={spacing} value={spacing}>{spacing}px</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 代码配置 */}
            <div className="config-section">
              <h3 className="section-title">{t('style.sections.code_settings')}</h3>
              <div className="form-row">
                <label>{t('style.labels.code_theme')}</label>
                <select
                  className="form-select"
                  value={config.codeTheme}
                  onChange={(e) => updateConfig('codeTheme', e.target.value)}
                >
                  <option value="atom-one-dark">Atom One Dark</option>
                  <option value="github">GitHub</option>
                  <option value="vs">Visual Studio</option>
                  <option value="monokai">Monokai</option>
                </select>
              </div>
              <div className="form-row">
                <label>{t('style.labels.border_radius')}</label>
                <select
                  className="form-select"
                  value={config.codeBorderRadius}
                  onChange={(e) => updateConfig('codeBorderRadius', parseInt(e.target.value))}
                >
                  {[0, 4, 6, 8, 10, 12, 16].map(radius => (
                    <option key={radius} value={radius}>{radius}px</option>
                  ))}
                </select>
              </div>
            </div>

        </div>
      </div>
    </>
  )
}

export default StyleConfigurator
