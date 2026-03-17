import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { filesApi } from '../utils/api'
import './PdfPreview.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const MIN_SCALE = 0.72
const MAX_SCALE = 2.4
const THUMB_WIDTH = 96
const FIT_HORIZONTAL_PADDING = 112

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function getPageRenderScale(viewScale) {
  const deviceScale = Math.max(1, window.devicePixelRatio || 1)
  const clarityBoost = viewScale < 1 ? 2.5 : viewScale < 1.2 ? 2.2 : 1.85
  return clamp(deviceScale * clarityBoost, 2.2, 3.2)
}

function getThumbRenderScale() {
  const deviceScale = Math.max(1, window.devicePixelRatio || 1)
  return clamp(deviceScale * 1.1, 1, 1.8)
}

function PdfPageCanvas({ doc, pageNumber, scale, isActive, registerPageRef }) {
  const shellRef = useRef(null)
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    registerPageRef(pageNumber, shellRef.current)
    return () => {
      registerPageRef(pageNumber, null)
    }
  }, [pageNumber, registerPageRef])

  useEffect(() => {
    let cancelled = false

    async function renderPage() {
      setReady(false)

      try {
        const page = await doc.getPage(pageNumber)
        if (cancelled) return

        const viewport = page.getViewport({ scale })
        const outputScale = getPageRenderScale(scale)
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d', { alpha: false })
        if (!canvas || !context) return

        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
        canvas.style.width = '100%'
        canvas.style.height = 'auto'

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        const transform = outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        renderTaskRef.current?.cancel?.()
        renderTaskRef.current = page.render({
          canvasContext: context,
          viewport,
          transform,
        })
        await renderTaskRef.current.promise
        if (cancelled) return

        setSize({
          width: Math.max(1, Math.floor(viewport.width)),
          height: Math.max(1, Math.floor(viewport.height)),
        })
        setReady(true)
      } catch (error) {
        if (cancelled || error?.name === 'RenderingCancelledException') return
        console.error(`Failed to render PDF page ${pageNumber}:`, error)
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel?.()
    }
  }, [doc, pageNumber, scale])

  return (
    <section
      ref={shellRef}
      className={`pdf-refined-page-shell ${isActive ? 'active' : ''}`}
      style={{
        width: size.width ? `${size.width}px` : undefined,
      }}
      data-page={pageNumber}
    >
      <div className="pdf-refined-page">
        <canvas ref={canvasRef} className={`pdf-refined-canvas ${ready ? 'is-ready' : ''}`} />
      </div>
      <div className="pdf-refined-page-caption">{String(pageNumber).padStart(2, '0')}</div>
    </section>
  )
}

function PdfThumbnail({ doc, pageNumber, isActive, onClick }) {
  const canvasRef = useRef(null)
  const renderTaskRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function renderThumbnail() {
      try {
        const page = await doc.getPage(pageNumber)
        if (cancelled) return

        const unitViewport = page.getViewport({ scale: 1 })
        const scale = THUMB_WIDTH / Math.max(1, unitViewport.width)
        const viewport = page.getViewport({ scale })
        const outputScale = getThumbRenderScale()
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d', { alpha: false })
        if (!canvas || !context) return

        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale))
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale))
        canvas.style.width = `${Math.max(1, Math.floor(viewport.width))}px`
        canvas.style.height = `${Math.max(1, Math.floor(viewport.height))}px`

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        const transform = outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
        renderTaskRef.current?.cancel?.()
        renderTaskRef.current = page.render({
          canvasContext: context,
          viewport,
          transform,
        })
        await renderTaskRef.current.promise
      } catch (error) {
        if (cancelled || error?.name === 'RenderingCancelledException') return
        console.error(`Failed to render PDF thumbnail ${pageNumber}:`, error)
      }
    }

    void renderThumbnail()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel?.()
    }
  }, [doc, pageNumber])

  return (
    <button
      type="button"
      className={`pdf-refined-thumb ${isActive ? 'active' : ''}`}
      onClick={() => onClick(pageNumber)}
      aria-label={`Go to page ${pageNumber}`}
    >
      <span className="pdf-refined-thumb-frame">
        <canvas ref={canvasRef} className="pdf-refined-thumb-canvas" />
      </span>
      <span className="pdf-refined-thumb-number">{pageNumber}</span>
    </button>
  )
}

function PdfPreview({ currentFile }) {
  const scrollRef = useRef(null)
  const viewportRef = useRef(null)
  const pageRefs = useRef(new Map())

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [doc, setDoc] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageBaseSize, setPageBaseSize] = useState({ width: 612, height: 792 })
  const [currentPage, setCurrentPage] = useState(1)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [manualScale, setManualScale] = useState(null)

  const pdfUrl = useMemo(
    () => filesApi.getRawFileUrl(currentFile?.path || ''),
    [currentFile?.path],
  )

  useEffect(() => {
    let disposed = false
    let loadingTask = null
    let loadedDoc = null

    async function loadPdf() {
      setLoading(true)
      setError('')
      setPageCount(0)
      setCurrentPage(1)
      setManualScale(null)
      setDoc((previous) => {
        void previous?.destroy?.()
        return null
      })

      try {
        const response = await fetch(pdfUrl)
        if (!response.ok) {
          throw new Error(`Failed to load PDF (HTTP ${response.status}).`)
        }

        const data = await response.arrayBuffer()
        if (disposed) return

        loadingTask = pdfjsLib.getDocument({ data })
        loadedDoc = await loadingTask.promise
        if (disposed) {
          await loadedDoc.destroy().catch(() => {})
          return
        }

        const firstPage = await loadedDoc.getPage(1)
        if (disposed) {
          await loadedDoc.destroy().catch(() => {})
          return
        }

        const firstViewport = firstPage.getViewport({ scale: 1 })
        setPageBaseSize({
          width: firstViewport.width,
          height: firstViewport.height,
        })
        setPageCount(Number(loadedDoc.numPages || 0))
        setDoc(loadedDoc)
        setLoading(false)
      } catch (loadError) {
        if (disposed) return
        console.error('Failed to load PDF preview:', loadError)
        setError(String(loadError?.message || 'Unable to preview this PDF file.'))
        setLoading(false)
      }
    }

    void loadPdf()

    return () => {
      disposed = true
      loadingTask?.destroy?.()
      loadedDoc?.destroy?.().catch(() => {})
    }
  }, [pdfUrl])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect?.width || 0
      setViewportWidth(nextWidth)
    })

    observer.observe(node)
    setViewportWidth(node.clientWidth || 0)
    return () => observer.disconnect()
  }, [])

  const fitScale = useMemo(() => {
    const availableWidth = Math.max(320, viewportWidth - FIT_HORIZONTAL_PADDING)
    return clamp(availableWidth / Math.max(1, pageBaseSize.width), MIN_SCALE, 1.42)
  }, [pageBaseSize.width, viewportWidth])

  const effectiveScale = manualScale ?? fitScale

  const registerPageRef = useCallback((pageNumber, node) => {
    if (node) {
      pageRefs.current.set(pageNumber, node)
    } else {
      pageRefs.current.delete(pageNumber)
    }
  }, [])

  const scrollToPage = useCallback((pageNumber) => {
    const node = pageRefs.current.get(pageNumber)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setCurrentPage(pageNumber)
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container || pageCount <= 0) return

    const updateCurrentPage = () => {
      const anchor = container.scrollTop + container.clientHeight * 0.22
      let nextPage = 1
      let minDistance = Number.POSITIVE_INFINITY

      for (const [pageNumber, node] of pageRefs.current.entries()) {
        const distance = Math.abs((node?.offsetTop || 0) - anchor)
        if (distance < minDistance) {
          minDistance = distance
          nextPage = pageNumber
        }
      }

      setCurrentPage(nextPage)
    }

    let rafId = 0
    const onScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(updateCurrentPage)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    updateCurrentPage()

    return () => {
      cancelAnimationFrame(rafId)
      container.removeEventListener('scroll', onScroll)
    }
  }, [effectiveScale, pageCount])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const direction = e.deltaY < 0 ? 1 : -1
        setManualScale((prev) => clamp((prev ?? fitScale) * (1 + direction * 0.08), MIN_SCALE, MAX_SCALE))
      }
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [fitScale])

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)

  return (
    <main className="main-content">
      <div className="content-wrapper pdf-refined-wrapper">
        <section className="pdf-refined-shell">
          <div className="pdf-refined-body with-sidebar">
            <aside className="pdf-refined-sidebar">
              <div className="pdf-refined-thumbs">
                {doc && pages.map((pageNumber) => (
                  <PdfThumbnail
                    key={`thumb-${pageNumber}`}
                    doc={doc}
                    pageNumber={pageNumber}
                    isActive={currentPage === pageNumber}
                    onClick={scrollToPage}
                  />
                ))}
              </div>
            </aside>

            <div ref={viewportRef} className="pdf-refined-stage">
              {loading ? (
                <div className="pdf-refined-state">
                  <div className="pdf-refined-state-card">
                    <div className="pdf-refined-state-title">Preparing preview</div>
                    <div className="pdf-refined-state-subtitle">{currentFile?.name}</div>
                  </div>
                </div>
              ) : error ? (
                <div className="pdf-refined-state">
                  <div className="pdf-refined-state-card pdf-refined-state-error">
                    <div className="pdf-refined-state-title">Unable to render this PDF</div>
                    <div className="pdf-refined-state-subtitle">{error}</div>
                    <a className="pdf-refined-open-link" href={pdfUrl} target="_blank" rel="noreferrer">
                      Open separately
                    </a>
                  </div>
                </div>
              ) : (
                <div ref={scrollRef} className="pdf-refined-scroll">
                  <div className="pdf-refined-pages">
                    {doc && pages.map((pageNumber) => (
                      <PdfPageCanvas
                        key={`page-${pageNumber}-${effectiveScale.toFixed(3)}`}
                        doc={doc}
                        pageNumber={pageNumber}
                        scale={effectiveScale}
                        isActive={currentPage === pageNumber}
                        registerPageRef={registerPageRef}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

    </main>
  )
}

export default PdfPreview
