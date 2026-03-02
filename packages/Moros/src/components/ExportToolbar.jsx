import React, { useState } from 'react'
import { Download, Copy, Loader2, Eye, X, Settings, Check, Edit3, Monitor, FileText, Image } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { saveAs } from 'file-saver'
import './ExportToolbar.css'
import juice from 'juice'
import { useI18n } from '../utils/i18n'
// mdnice theme CSS strings
import { basicCss, markdownThemes } from '../utils/mdnice/themes'
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
  const [exportType, setExportType] = useState(null)
  const [showPDFPreview, setShowPDFPreview] = useState(false)
  const [previewCanvas, setPreviewCanvas] = useState(null)
  const [previewPages, setPreviewPages] = useState([])
  const [previewZoom, setPreviewZoom] = useState(1)
  const [copySuccess, setCopySuccess] = useState(false)
  const [copyRichSuccess, setCopyRichSuccess] = useState(false)
  const [pdfOptions, setPdfOptions] = useState({
    format: 'a4',
    orientation: 'portrait',
    margin: 20,
    scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1))
  })
  const [marginInput, setMarginInput] = useState('20')
  // 移除主题选择状态，使用统一主题

  const MM_TO_PX = 96 / 25.4
  const getPageSizeMM = (format, orientation) => {
    const sizes = {
      a4: { w: 210, h: 297 },
      letter: { w: 216, h: 279 }
    }
    const base = sizes[format] || sizes.a4
    return orientation === 'landscape' ? { w: base.h, h: base.w } : base
  }

  const computeFitPreviewZoom = () => {
    try {
      const viewport = document.querySelector('.preview-viewport')
      if (!viewport) return
      const pageWidthPx = getPageSizeMM(pdfOptions.format, pdfOptions.orientation).w * MM_TO_PX
      const available = Math.max(200, viewport.clientWidth - 48)
      const fitZoom = Math.max(0.5, Math.min(1.2, available / pageWidthPx)) // 限制最大缩放为1.2，提供更好的预览体验
      setPreviewZoom(fitZoom)
    } catch {}
  }

  // 获取当前文件名（不包含扩展名）
  const getFileName = () => {
    if (!currentFile?.name) return 'markdown-export'
    return currentFile.name.replace(/\.[^/.]+$/, '')
  }

  // 生成预览页面
  const generatePreviewPages = async (options) => {
    if (!previewPaneRef?.current) return []

    try {
      const previewElement = previewPaneRef.current.querySelector('.markdown-content')
      if (!previewElement) return []

      // 创建高分辨率canvas（使用设备像素比）
      const h2cScale = Math.max(1.5, window.devicePixelRatio || 1)
      const canvas = await html2canvas(previewElement, {
        scale: h2cScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        width: previewElement.scrollWidth,
        height: previewElement.scrollHeight
      })

      // 计算页面尺寸（毫米 → 像素）
      const { w: pageWmm, h: pageHmm } = getPageSizeMM(options.format, options.orientation)
      const pageWidthPx = pageWmm * MM_TO_PX
      const pageHeightPx = pageHmm * MM_TO_PX
      const marginPx = options.margin * MM_TO_PX
      const contentWidthPx = pageWidthPx - 2 * marginPx
      const contentHeightPx = pageHeightPx - 2 * marginPx

      // 预览分页：按目标页内容宽度计算源切片高度，确保目标高度恰好填满内容区域
      const pages = []

      for (let i = 0, y = 0; y < canvas.height; i++) {
        const pageCanvas = document.createElement('canvas')
        const ctx = pageCanvas.getContext('2d')
        const dprOut = Math.max(1, window.devicePixelRatio || 1)

        // 输出画布使用设备像素比，保证预览清晰
        pageCanvas.width = Math.round(pageWidthPx * dprOut)
        pageCanvas.height = Math.round(pageHeightPx * dprOut)

        const marginOut = marginPx * dprOut
        const contentWidthOut = contentWidthPx * dprOut
        const contentHeightOut = pageCanvas.height - 2 * marginOut

        // 源->目标的宽度缩放比，以及匹配目标内容高度所需的源切片高度
        const widthScale = contentWidthOut / canvas.width
        const sliceHeightSourcePx = Math.max(1, Math.floor(contentHeightOut / widthScale))
        // 以目标空间约 6px 的重叠量，换算回源空间，避免边界文字被切断
        const overlapDestPx = Math.round(6 * dprOut)
        const overlapSourcePx = Math.max(2, Math.round(overlapDestPx / widthScale))

        const sourceY = y
        const sourceHeight = Math.min(sliceHeightSourcePx, canvas.height - sourceY)

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        if (sourceHeight > 0) {
          const destHeight = Math.min(
            contentHeightOut,
            Math.round((sourceHeight * contentWidthOut) / canvas.width)
          )
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sourceHeight,
            marginOut,
            marginOut,
            contentWidthOut,
            destHeight
          )
        }

        pages.push({
          pageNumber: i + 1,
          dataUrl: pageCanvas.toDataURL('image/png')
        })

        // 前进到下一页（源坐标系），加入重叠
        y = Math.min(canvas.height, y + sliceHeightSourcePx - overlapSourcePx)
      }

      return pages
    } catch (error) {
      console.error('生成预览页面失败:', error)
      return []
    }
  }

  // 显示PDF预览
  const showPDFPreviewModal = async () => {
    if (!previewPaneRef?.current) {
      alert('预览内容不可用，请先选择一个Markdown文件')
      return
    }
    
    setShowPDFPreview(true)
    // 同步边距输入框显示值
    setMarginInput(pdfOptions.margin.toString())
    // 初次打开时计算最佳预览缩放并生成预览页面
    setTimeout(async () => {
      computeFitPreviewZoom()
      const pages = await generatePreviewPages(pdfOptions)
      setPreviewPages(pages)
    }, 100)
  }

  // 当PDF选项改变时重新生成预览
  const handlePdfOptionsChange = async (newOptions) => {
    setPdfOptions(newOptions)
    if (showPDFPreview) {
      const pages = await generatePreviewPages(newOptions)
      setPreviewPages(pages)
    }
  }

  // 处理边距输入
  const handleMarginChange = (e) => {
    const value = e.target.value
    setMarginInput(value)
    
    // 只有在输入有效数字时才更新pdfOptions
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0) {
      // 限制最大边距，确保内容区域至少有50mm宽度和高度
      const { w: pageW, h: pageH } = getPageSizeMM(pdfOptions.format, pdfOptions.orientation)
      const maxMargin = Math.min((pageW - 50) / 2, (pageH - 50) / 2, 50)
      const clampedMargin = Math.min(numValue, maxMargin)
      
      if (clampedMargin !== pdfOptions.margin) {
        handlePdfOptionsChange({...pdfOptions, margin: clampedMargin})
      }
    }
  }

  // 处理边距输入失焦
  const handleMarginBlur = () => {
    const numValue = parseFloat(marginInput)
    if (isNaN(numValue) || numValue < 0) {
      // 如果输入无效，恢复为当前有效值
      setMarginInput(pdfOptions.margin.toString())
    } else {
      // 确保输入框显示实际使用的值
      setMarginInput(pdfOptions.margin.toString())
    }
  }

  // 移除预览区域的滚轮缩放功能

  // 实际导出PDF
  const exportToPDF = async () => {
    if (!previewPaneRef?.current) {
      return
    }

    setIsExporting(true)
    setExportType('pdf')

    try {
      // 获取预览内容元素
      const previewElement = previewPaneRef.current.querySelector('.markdown-content')
      if (!previewElement) {
        throw new Error('找不到预览内容')
      }

      // 生成高分辨率源画布
      const scale = Math.max(2, Number(pdfOptions.scale) || 2)
      const canvas = await html2canvas(previewElement, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        width: previewElement.scrollWidth,
        height: previewElement.scrollHeight
      })

      // 初始化 PDF
      const pdf = new jsPDF({
        orientation: pdfOptions.orientation,
        unit: 'mm',
        format: pdfOptions.format
      })

      // 计算页面与内容尺寸（mm）
      const { w: pageWmm, h: pageHmm } = getPageSizeMM(pdfOptions.format, pdfOptions.orientation)
      const marginMm = pdfOptions.margin
      const contentWmm = pageWmm - 2 * marginMm
      const contentHmm = pageHmm - 2 * marginMm

      // 逐页裁切并写入 PDF：按目标内容宽度换算源切片高度，避免底部丢字
      for (let i = 0, y = 0; y < canvas.height; i++) {
        // 使目标高度正好为 contentHmm（毫米）所对应的源切片高度（像素）
        const sliceHeightSourcePx = Math.max(1, Math.floor((contentHmm * canvas.width) / contentWmm))
        // 以目标空间约 1mm 的重叠量，换算回源像素
        const overlapMm = 1
        const overlapSourcePx = Math.max(2, Math.round((overlapMm * canvas.width) / contentWmm))

        const sourceY = y
        const sliceHeight = Math.min(sliceHeightSourcePx, canvas.height - sourceY)

        // 创建一个切片画布
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = canvas.width
        sliceCanvas.height = sliceHeight
        const sctx = sliceCanvas.getContext('2d')
        sctx.imageSmoothingEnabled = true
        sctx.imageSmoothingQuality = 'high'
        sctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

        const sliceImg = sliceCanvas.toDataURL('image/png')

        if (i > 0) pdf.addPage()
        pdf.addImage(
          sliceImg,
          'PNG',
          marginMm,
          marginMm,
          contentWmm,
          (sliceHeight / canvas.width) * contentWmm
        )

        // 前进到下一页（源坐标系），加入重叠
        y = Math.min(canvas.height, y + sliceHeightSourcePx - overlapSourcePx)
      }

      // 保存PDF
      pdf.save(`${getFileName()}.pdf`)
      setShowPDFPreview(false)
    } catch (error) {
      console.error('PDF导出失败:', error)
      alert('PDF导出失败，请重试')
    } finally {
      setIsExporting(false)
      setExportType(null)
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

      {/* PDF预览模态框 */}
      {showPDFPreview && (
        <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
          <div className="pdf-modal-overlay" onClick={() => setShowPDFPreview(false)} />
          <div className="pdf-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-body">
              <div className="preview-area">
                <div className="preview-viewport">
                  {previewPages.length > 0 ? (
                    <div className="pages-zoom" style={{ transform: `scale(${previewZoom})` }}>
                      <div className="pages-stack">
                        {previewPages.map((p, idx) => (
                          <div
                            key={idx}
                            className={`print-page ${pdfOptions.orientation === 'landscape' ? 'landscape' : ''}`}
                            style={{
                              width: `${getPageSizeMM(pdfOptions.format, pdfOptions.orientation).w}mm`,
                              minHeight: `${getPageSizeMM(pdfOptions.format, pdfOptions.orientation).h}mm`
                            }}
                          >
                            <div className="page-shadow"></div>
                            <img src={p.dataUrl} alt={`Page ${idx + 1}`} className="page-content-image" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="preview-loading">
                      <Loader2 size={24} className="export-loading" />
                      <p>正在生成预览...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pdf-options">
                
                <div className="option-group">
                  <label>页面格式</label>
                  <select 
                    value={pdfOptions.format}
                    onChange={(e) => handlePdfOptionsChange({...pdfOptions, format: e.target.value})}
                  >
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                  </select>
                </div>
                
                <div className="option-group">
                  <label>方向</label>
                  <select 
                    value={pdfOptions.orientation}
                    onChange={(e) => handlePdfOptionsChange({...pdfOptions, orientation: e.target.value})}
                  >
                    <option value="portrait">纵向</option>
                    <option value="landscape">横向</option>
                  </select>
                </div>
                
                <div className="option-group">
                   <label>边距 (mm)</label>
                   <input 
                     type="number"
                     min="0"
                     max="50"
                     value={marginInput}
                     onChange={handleMarginChange}
                     onBlur={handleMarginBlur}
                     placeholder="边距"
                   />
                 </div>
                
                <div className="option-group">
                  <label>清晰度（导出）</label>
                  <select 
                    value={pdfOptions.scale}
                    onChange={(e) => handlePdfOptionsChange({...pdfOptions, scale: parseInt(e.target.value) || 2})}
                  >
                    <option value="1">标准</option>
                    <option value="2">高清</option>
                    <option value="3">超清</option>
                  </select>
                </div>


                
                <div className="pdf-modal-footer">
                  <button 
                    className="btn-secondary"
                    onClick={() => setShowPDFPreview(false)}
                  >
                    取消
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={exportToPDF}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <Loader2 size={16} className="export-loading" />
                        导出中...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        导出PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default ExportToolbar
