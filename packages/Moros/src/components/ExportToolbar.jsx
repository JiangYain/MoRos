import React, { useState } from 'react'
import { Download, Copy, Settings, Check, Monitor, FileText, Image } from 'lucide-react'
import html2canvas from 'html2canvas'
import { saveAs } from 'file-saver'
import './ExportToolbar.css'
import juice from 'juice'
import { useI18n } from '../utils/i18n'
// mdnice theme CSS strings
import { basicCss } from '../utils/mdnice/themes'
// 移除主题选择器的导入，使用统一主题

// 自定义PDF图标组件 - 更清晰地表示PDF
const PDFIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <text x="12" y="17" fontSize="6" textAnchor="middle" fill="currentColor" fontWeight="600">PDF</text>
  </svg>
)

function ExportToolbar({ currentFile, previewPaneRef, previewMode = 'markdown', onChangePreviewMode, onEditStyles }) {
  const { t } = useI18n()
  const [isExporting, setIsExporting] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [copyRichSuccess, setCopyRichSuccess] = useState(false)
  // 移除主题选择状态，使用统一主题

  // 获取当前文件名（不包含扩展名）
  const getFileName = () => {
    if (!currentFile?.name) return 'markdown-export'
    return currentFile.name.replace(/\.[^/.]+$/, '')
  }

  // 简化方案：直接打开系统打印流程导出 PDF（更快、更稳定）
  const showPDFPreviewModal = async () => {
    if (!previewPaneRef?.current) {
      alert('预览内容不可用，请先选择一个Markdown文件')
      return
    }
    await exportToPDF()
  }

  // 实际导出PDF
  const exportToPDF = async () => {
    if (!previewPaneRef?.current) {
      return
    }

    setIsExporting(true)

    try {
      const targetNode = previewMode === 'rich-html'
        ? previewPaneRef.current.querySelector('#nice')
        : previewPaneRef.current.querySelector('.markdown-content')

      if (!targetNode) {
        throw new Error('找不到可导出的预览内容')
      }

      const clonedNode = targetNode.cloneNode(true)
      clonedNode.querySelectorAll?.('.copy-code-btn, .toolbar-btn, .editor-btn, script').forEach((node) => {
        node.remove()
      })

      const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map((link) => {
          const href = link.getAttribute('href')
          return href ? `<link rel="stylesheet" href="${href}">` : ''
        })
        .filter(Boolean)
        .join('\n')

      const inlineStyles = Array.from(document.querySelectorAll('style'))
        .map((style) => `<style>${style.textContent || ''}</style>`)
        .join('\n')

      const safeTitle = getFileName()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')

      const printableHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  ${styleLinks}
  ${inlineStyles}
  <style>
    :root { color-scheme: light; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #101114;
    }
    @page {
      size: A4;
      margin: 14mm 12mm;
    }
    .print-pdf-root {
      max-width: 186mm;
      margin: 0 auto;
    }
    .print-pdf-root #nice,
    .print-pdf-root .markdown-content {
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .print-pdf-root .copy-code-btn,
    .print-pdf-root .export-toolbar,
    .print-pdf-root .toolbar-btn,
    .print-pdf-root .editor-btn {
      display: none !important;
    }
  </style>
</head>
<body>
  <main class="print-pdf-root">${clonedNode.outerHTML}</main>
</body>
</html>`

      if (window.electronAPI?.savePDF) {
        const result = await window.electronAPI.savePDF(printableHtml, getFileName())
        if (result.error) throw new Error(result.error)
      } else {
        const printWindow = window.open('', '_blank', 'width=1100,height=820')
        if (printWindow) {
          printWindow.document.open()
          printWindow.document.write(printableHtml)
          printWindow.document.close()
          const doPrint = () => {
            setTimeout(() => {
              try { printWindow.focus() } catch (_) {}
              printWindow.print()
            }, 200)
          }
          if (printWindow.document.readyState === 'complete') {
            doPrint()
          } else {
            printWindow.addEventListener('load', doPrint, { once: true })
          }
          printWindow.addEventListener('afterprint', () => { printWindow.close() }, { once: true })
        } else {
          const iframe = document.createElement('iframe')
          iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
          document.body.appendChild(iframe)
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
          iframeDoc.open()
          iframeDoc.write(printableHtml)
          iframeDoc.close()
          const triggerPrint = () => {
            setTimeout(() => {
              try { iframe.contentWindow.focus() } catch (_) {}
              iframe.contentWindow.print()
              setTimeout(() => { document.body.removeChild(iframe) }, 1000)
            }, 200)
          }
          if (iframeDoc.readyState === 'complete') {
            triggerPrint()
          } else {
            iframe.addEventListener('load', triggerPrint, { once: true })
          }
        }
      }
    } catch (error) {
      console.error('PDF导出失败:', error)
      alert(`PDF 导出失败：${error?.message || '未知错误'}`)
    } finally {
      setIsExporting(false)
    }
  }

  // 复制图像到剪切板
  const copyToClipboard = async () => {
    if (!previewPaneRef?.current) {
      return
    }

    // 立即显示成功状态
    setCopySuccess(true)
    setTimeout(() => {
      setCopySuccess(false)
    }, 1500)

    // 后台异步执行复制操作
    try {
      const previewElement = previewPaneRef.current.querySelector('.markdown-content')
      if (!previewElement) return

      const canvas = await html2canvas(previewElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        width: previewElement.scrollWidth,
        height: previewElement.scrollHeight
      })

      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              'image/png': blob
            })
          ])
        } catch (clipboardError) {
          console.error('复制到剪切板失败:', clipboardError)
        }
      }, 'image/png')
    } catch (error) {
      console.error('生成图像失败:', error)
    }
  }

  // 复制富文本HTML到剪切板（带样式）
  const copyRichHtml = async () => {
    if (!previewPaneRef?.current) return

    // 立即显示成功状态（异步复制完成后若失败不回滚 UI）
    setCopyRichSuccess(true)
    setTimeout(() => setCopyRichSuccess(false), 1500)

    try {
      const root = previewPaneRef.current.querySelector('#nice')
      if (!root) throw new Error('找不到 #nice 容器')

      // 深拷贝用于操作，避免影响屏幕预览
      const cloned = root.cloneNode(true)

      // 用于将 CSS 变量替换成当前页面计算值
      const unifiedTag = document.getElementById('mdnice-unified-theme-style')
      const unifiedCssRaw = unifiedTag?.textContent || ''
      const resolveCssVars = (cssText) => {
        if (!cssText) return cssText
        const varNames = Array.from(new Set((cssText.match(/var\((--[\w-]+)\)/g) || []).map((m) => m.replace(/var\(|\)/g, ''))))
        const rootStyle = getComputedStyle(document.documentElement)
        let out = cssText
        varNames.forEach((name) => {
          const v = rootStyle.getPropertyValue(name)?.trim()
          if (v) out = out.replace(new RegExp(`var\\(${name.replace(/[-\\]/g, (s)=>'\\'+s)}\\)`, 'g'), v)
        })
        return out
      }
      const unifiedCss = resolveCssVars(unifiedCssRaw)
      const css = [basicCss, unifiedCss].join('\n')

      // 1) 表格：读取当前预览的计算样式，逐格写入克隆节点（完全尊重样式配置）
      const originalTables = root.querySelectorAll('table')
      const clonedTables = cloned.querySelectorAll('table')
      originalTables.forEach((ot, i) => {
        const ct = clonedTables[i]
        if (!ct) return

        // 外包裹用于圆角溢出裁切（边框/圆角从原样式推断）
        const computedTable = window.getComputedStyle(ot)
        const wrap = document.createElement('div')
        wrap.style.overflow = 'hidden'
        wrap.style.margin = '12px 0'
        wrap.style.borderRadius = computedTable.borderRadius || '6px'
        const tableBorderColor = computedTable.borderColor || '#e5e7eb'
        const tableBorderWidth = computedTable.borderWidth || '1px'
        if (parseFloat(tableBorderWidth) > 0) {
          wrap.style.border = `${tableBorderWidth} solid ${tableBorderColor}`
        }
        ct.parentNode && ct.parentNode.insertBefore(wrap, ct)
        wrap.appendChild(ct)

        // 复制表格级别样式
        ct.style.borderCollapse = 'separate'
        ct.style.borderSpacing = '0'
        ct.style.width = computedTable.width || '100%'

        // thead th
        const oThs = ot.querySelectorAll('thead th')
        const cThs = ct.querySelectorAll('thead th')
        oThs.forEach((th, idx) => {
          const cs = window.getComputedStyle(th)
          const dst = cThs[idx]
          if (!dst) return
          dst.style.background = cs.backgroundColor
          dst.style.color = cs.color
          dst.style.fontWeight = cs.fontWeight
          dst.style.fontSize = cs.fontSize
          dst.style.padding = cs.padding
          dst.style.borderBottom = cs.borderBottom
          dst.style.borderRight = cs.borderRight
          dst.style.textAlign = cs.textAlign
        })
        // tbody tr 背景斑马纹等
        const oRows = ot.querySelectorAll('tbody tr')
        const cRows = ct.querySelectorAll('tbody tr')
        oRows.forEach((tr, idx) => {
          const cs = window.getComputedStyle(tr)
          const dst = cRows[idx]
          if (!dst) return
          dst.style.background = cs.backgroundColor
        })
        // cells
        const oCells = ot.querySelectorAll('td')
        const cCells = ct.querySelectorAll('td')
        oCells.forEach((td, idx) => {
          const cs = window.getComputedStyle(td)
          const dst = cCells[idx]
          if (!dst) return
          dst.style.fontSize = cs.fontSize
          dst.style.padding = cs.padding
          dst.style.borderTop = cs.borderTop
          dst.style.borderRight = cs.borderRight
          dst.style.borderLeft = cs.borderLeft
          dst.style.borderBottom = cs.borderBottom
          dst.style.color = cs.color
          dst.style.textAlign = cs.textAlign
          dst.style.verticalAlign = cs.verticalAlign
          dst.style.fontWeight = cs.fontWeight
        })
      })

      // 2) 代码块：根据配置是否为 Mac 风格；无论哪种，均内联实际颜色与背景
      const macStyleEnabled = /#nice\s*.custom:before|#nice\s*.custom:after|Mac风格代码块装饰/.test(unifiedCssRaw)
      const origCodes = root.querySelectorAll('pre > code.hljs')
      const cloneCodes = cloned.querySelectorAll('pre > code.hljs')
      origCodes.forEach((ocode, i) => {
        const ccode = cloneCodes[i]
        if (!ccode) return
        const opre = ocode.parentElement
        const cpre = ccode.parentElement
        if (!opre || !cpre) return

        const preStyle = window.getComputedStyle(opre)
        const codeStyle = window.getComputedStyle(ocode)
        cpre.style.margin = '12px 0'
        cpre.style.borderRadius = preStyle.borderRadius || '5px'
        cpre.style.overflow = 'auto'
        cpre.style.background = preStyle.backgroundColor || codeStyle.backgroundColor || '#282c34'
        ccode.style.display = 'block'
        ccode.style.padding = codeStyle.padding || '16px'
        ccode.style.background = codeStyle.backgroundColor || preStyle.backgroundColor || '#282c34'
        ccode.style.color = codeStyle.color || '#abb2bf'

        // 为所有 token 写入颜色/字重，保证语法高亮复制到微信
        const otokens = ocode.querySelectorAll('*')
        const ctokens = ccode.querySelectorAll('*')
        otokens.forEach((t, idx2) => {
          const dst = ctokens[idx2]
          if (!dst) return
          const cs = window.getComputedStyle(t)
          if (cs.color) dst.style.color = cs.color
          if (cs.fontWeight) dst.style.fontWeight = cs.fontWeight
          if (cs.fontStyle) dst.style.fontStyle = cs.fontStyle
        })

        if (macStyleEnabled) {
          // 注入顶部三色栏（真实 DOM，避免伪元素丢失）
          const wrap = document.createElement('div')
          wrap.style.borderRadius = cpre.style.borderRadius
          wrap.style.boxShadow = '0 2px 10px rgba(0,0,0,0.35)'
          wrap.style.margin = cpre.style.margin
          cpre.parentNode && cpre.parentNode.insertBefore(wrap, cpre)
          const bar = document.createElement('div')
          bar.style.height = '30px'
          bar.style.width = '100%'
          bar.style.background = cpre.style.background || '#282c34'
          bar.style.borderTopLeftRadius = cpre.style.borderRadius
          bar.style.borderTopRightRadius = cpre.style.borderRadius
          bar.style.display = 'flex'
          bar.style.alignItems = 'center'
          bar.style.padding = '8px 12px'
          ;['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i2) => {
            const dot = document.createElement('span')
            dot.style.display = 'inline-block'
            dot.style.width = '12px'
            dot.style.height = '12px'
            dot.style.borderRadius = '50%'
            dot.style.background = c
            dot.style.marginRight = i2 < 2 ? '8px' : '0'
            bar.appendChild(dot)
          })
          wrap.appendChild(bar)
          wrap.appendChild(cpre)
          // 底部圆角
          cpre.style.borderTopLeftRadius = '0'
          cpre.style.borderTopRightRadius = '0'
        }
      })

      // 3) 生成 HTML 字符串并内联 CSS
      const html = cloned.outerHTML
      let inlined = ''
      try {
        inlined = juice.inlineContent(html, css, {
          inlinePseudoElements: true,
          preserveImportant: true,
        })
      } catch (e) {
        console.warn('CSS 内联失败，改为原样复制:', e)
        inlined = html
      }

      // 4) 复制为 text/html 和 text/plain（降级兜底）
      const plain = cloned.textContent || ''
      const tryClipboardAPI = async () => {
        if (navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({
            'text/html': new Blob([inlined], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          })
          await navigator.clipboard.write([item])
          return true
        }
        return false
      }

      const tryExecCommand = () => {
        let ok = false
        const input = document.createElement('input')
        input.style.position = 'absolute'
        input.style.left = '-10000px'
        input.style.top = '-10000px'
        document.body.appendChild(input)
        input.value = 'X'
        input.setSelectionRange(0, 1)
        input.focus()
        const onCopy = (e) => {
          e.preventDefault()
          e.clipboardData.setData('text/html', inlined)
          e.clipboardData.setData('text/plain', plain)
          document.removeEventListener('copy', onCopy)
        }
        document.addEventListener('copy', onCopy)
        try { ok = document.execCommand('copy') } catch {}
        document.body.removeChild(input)
        return ok
      }

      const ok = (await tryClipboardAPI()) || tryExecCommand()
      if (!ok) await navigator.clipboard.writeText(plain)
    } catch (error) {
      console.error('复制失败:', error)
      // 最后兜底：复制纯文本
      try {
        const previewElement = previewPaneRef.current.querySelector('.markdown-content')
        if (previewElement) {
          const text = previewElement.innerText || previewElement.textContent
          await navigator.clipboard.writeText(text)
        }
      } catch (fallbackError) {
        console.error('降级复制也失败:', fallbackError)
      }
    }
  }

  // 保存富文本 HTML 为文件（仅富文本预览可用）
  const saveHtmlFile = async () => {
    if (!previewPaneRef?.current) return

    try {
      const root = previewPaneRef.current.querySelector('#nice')
      if (!root) throw new Error('找不到 #nice 容器')

      // 深拷贝用于操作，避免影响屏幕预览
      const cloned = root.cloneNode(true)

      // 将 CSS 变量解析为实际值
      const unifiedTag = document.getElementById('mdnice-unified-theme-style')
      const unifiedCssRaw = unifiedTag?.textContent || ''
      const resolveCssVars = (cssText) => {
        if (!cssText) return cssText
        const varNames = Array.from(new Set((cssText.match(/var\((--[\w-]+)\)/g) || []).map((m) => m.replace(/var\(|\)/g, ''))))
        const rootStyle = getComputedStyle(document.documentElement)
        let out = cssText
        varNames.forEach((name) => {
          const v = rootStyle.getPropertyValue(name)?.trim()
          if (v) out = out.replace(new RegExp(`var\\(${name.replace(/[-\\]/g, (s)=>'\\'+s)}\\)`, 'g'), v)
        })
        return out
      }
      const unifiedCss = resolveCssVars(unifiedCssRaw)
      const css = [basicCss, unifiedCss].join('\n')

      // 表格：复制计算样式到克隆节点
      const originalTables = root.querySelectorAll('table')
      const clonedTables = cloned.querySelectorAll('table')
      originalTables.forEach((ot, i) => {
        const ct = clonedTables[i]
        if (!ct) return
        const computedTable = window.getComputedStyle(ot)
        const wrap = document.createElement('div')
        wrap.style.overflow = 'hidden'
        wrap.style.margin = '12px 0'
        wrap.style.borderRadius = computedTable.borderRadius || '6px'
        const tableBorderColor = computedTable.borderColor || '#e5e7eb'
        const tableBorderWidth = computedTable.borderWidth || '1px'
        if (parseFloat(tableBorderWidth) > 0) {
          wrap.style.border = `${tableBorderWidth} solid ${tableBorderColor}`
        }
        ct.parentNode && ct.parentNode.insertBefore(wrap, ct)
        wrap.appendChild(ct)

        const oThs = ot.querySelectorAll('thead th')
        const cThs = ct.querySelectorAll('thead th')
        oThs.forEach((th, idx) => {
          const cs = window.getComputedStyle(th)
          const dst = cThs[idx]
          if (!dst) return
          dst.style.background = cs.backgroundColor
          dst.style.color = cs.color
          dst.style.fontWeight = cs.fontWeight
          dst.style.fontSize = cs.fontSize
          dst.style.padding = cs.padding
          dst.style.borderBottom = cs.borderBottom
          dst.style.borderRight = cs.borderRight
          dst.style.textAlign = cs.textAlign
        })
        const oRows = ot.querySelectorAll('tbody tr')
        const cRows = ct.querySelectorAll('tbody tr')
        oRows.forEach((tr, idx) => {
          const cs = window.getComputedStyle(tr)
          const dst = cRows[idx]
          if (!dst) return
          dst.style.background = cs.backgroundColor
        })
        const oCells = ot.querySelectorAll('td')
        const cCells = ct.querySelectorAll('td')
        oCells.forEach((td, idx) => {
          const cs = window.getComputedStyle(td)
          const dst = cCells[idx]
          if (!dst) return
          dst.style.fontSize = cs.fontSize
          dst.style.padding = cs.padding
          dst.style.borderTop = cs.borderTop
          dst.style.borderRight = cs.borderRight
          dst.style.borderLeft = cs.borderLeft
          dst.style.borderBottom = cs.borderBottom
          dst.style.color = cs.color
          dst.style.textAlign = cs.textAlign
          dst.style.verticalAlign = cs.verticalAlign
          dst.style.fontWeight = cs.fontWeight
        })
      })

      // 代码块：复制计算样式
      const macStyleEnabled = /#nice\s*.custom:before|#nice\s*.custom:after|Mac风格代码块装饰/.test(unifiedCssRaw)
      const origCodes = root.querySelectorAll('pre > code.hljs')
      const cloneCodes = cloned.querySelectorAll('pre > code.hljs')
      origCodes.forEach((ocode, i) => {
        const ccode = cloneCodes[i]
        if (!ccode) return
        const opre = ocode.parentElement
        const cpre = ccode.parentElement
        if (!opre || !cpre) return
        const preStyle = window.getComputedStyle(opre)
        const codeStyle = window.getComputedStyle(ocode)
        cpre.style.margin = '12px 0'
        cpre.style.borderRadius = preStyle.borderRadius || '5px'
        cpre.style.overflow = 'auto'
        cpre.style.background = preStyle.backgroundColor || codeStyle.backgroundColor || '#282c34'
        ccode.style.display = 'block'
        ccode.style.padding = codeStyle.padding || '16px'
        ccode.style.background = codeStyle.backgroundColor || preStyle.backgroundColor || '#282c34'
        ccode.style.color = codeStyle.color || '#abb2bf'
        const otokens = ocode.querySelectorAll('*')
        const ctokens = ccode.querySelectorAll('*')
        otokens.forEach((t, idx2) => {
          const dst = ctokens[idx2]
          if (!dst) return
          const cs = window.getComputedStyle(t)
          if (cs.color) dst.style.color = cs.color
          if (cs.fontWeight) dst.style.fontWeight = cs.fontWeight
          if (cs.fontStyle) dst.style.fontStyle = cs.fontStyle
        })
        if (macStyleEnabled) {
          const wrap = document.createElement('div')
          wrap.style.borderRadius = cpre.style.borderRadius
          wrap.style.boxShadow = '0 2px 10px rgba(0,0,0,0.35)'
          wrap.style.margin = cpre.style.margin
          cpre.parentNode && cpre.parentNode.insertBefore(wrap, cpre)
          const bar = document.createElement('div')
          bar.style.height = '30px'
          bar.style.width = '100%'
          bar.style.background = cpre.style.background || '#282c34'
          bar.style.borderTopLeftRadius = cpre.style.borderRadius
          bar.style.borderTopRightRadius = cpre.style.borderRadius
          bar.style.display = 'flex'
          bar.style.alignItems = 'center'
          bar.style.padding = '8px 12px'
          ;['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i2) => {
            const dot = document.createElement('span')
            dot.style.display = 'inline-block'
            dot.style.width = '12px'
            dot.style.height = '12px'
            dot.style.borderRadius = '50%'
            dot.style.background = c
            dot.style.marginRight = i2 < 2 ? '8px' : '0'
            bar.appendChild(dot)
          })
          wrap.appendChild(bar)
          wrap.appendChild(cpre)
          cpre.style.borderTopLeftRadius = '0'
          cpre.style.borderTopRightRadius = '0'
        }
      })

      // 生成 HTML 并内联 CSS
      const html = cloned.outerHTML
      let inlined = ''
      try {
        inlined = juice.inlineContent(html, css, {
          inlinePseudoElements: true,
          preserveImportant: true,
        })
      } catch (e) {
        inlined = html
      }

      // 组装完整 HTML 文档
      const title = getFileName()
      const full = `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<title>${title}</title>\n<style>html,body{background:#fff;margin:0;padding:0;}\n/* 为导出文档提供最小包裹 */\n#nice{max-width: 820px; margin: 24px auto;}\n</style>\n</head>\n<body>${inlined}</body>\n</html>`

      const blob = new Blob([full], { type: 'text/html;charset=utf-8' })
      saveAs(blob, `${getFileName()}.html`)
    } catch (error) {
      console.error('保存 HTML 失败:', error)
      alert('保存 HTML 失败，请重试')
    }
  }

  return (
    <>
      <div className="export-toolbar">
        <div className="preview-mode-toggle" data-active={previewMode}>
          <button
            className={`mode-toggle-btn ${previewMode === 'markdown' ? 'active' : ''}`}
            onClick={() => onChangePreviewMode?.('markdown')}
            disabled={!currentFile}
            title="Markdown 预览"
          >
            <FileText size={16} />
          </button>
          <button
            className={`mode-toggle-btn ${previewMode === 'rich-html' ? 'active' : ''}`}
            onClick={() => onChangePreviewMode?.('rich-html')}
            disabled={!currentFile}
            title="富文本 HTML 预览"
          >
            <Monitor size={16} />
          </button>
        </div>
        
        <div className="export-actions">
          {previewMode === 'rich-html' && (
            <button
              className="editor-btn"
              onClick={onEditStyles}
              title={t('main.edit_style_theme')}
            >
              <Settings size={16} />
            </button>
          )}
          
          <button
            className="toolbar-btn"
            onClick={showPDFPreviewModal}
            disabled={isExporting || !currentFile}
            title={t('main.export_pdf')}
          >
            <PDFIcon size={16} />
          </button>
          {previewMode === 'rich-html' && (
            <button
              className="toolbar-btn"
              onClick={saveHtmlFile}
              disabled={!currentFile}
              title={t('main.export_html')}
            >
              <Download size={16} />
            </button>
          )}
          
          <button
            className="toolbar-btn"
            onClick={copyToClipboard}
            disabled={!currentFile}
            title={copySuccess ? t('main.copied_to_clipboard') : t('main.copy_image')}
          >
            {copySuccess ? (
              <Check size={16} className="copy-check" />
            ) : (
              <Image size={16} />
            )}
          </button>

          {previewMode === 'rich-html' && (
            <button
              className="toolbar-btn"
              onClick={copyRichHtml}
              disabled={!currentFile}
              title={copyRichSuccess ? t('main.copied_rich_text') : t('main.copy_rich_text')}
            >
              {copyRichSuccess ? (
                <Check size={16} className="copy-check" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default ExportToolbar
