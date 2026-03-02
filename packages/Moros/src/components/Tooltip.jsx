import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

const Tooltip = ({
  children,
  content,
  placement = 'top',
  delay = 300,
  className = '',
  disabled = false
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isMounted, setIsMounted] = useState(false)
  const triggerRef = useRef(null)
  const tooltipRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  const calculatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()

    let top
    let left

    switch (placement) {
      case 'bottom':
        top = triggerRect.bottom + 8
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
        break
      case 'left':
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2)
        left = triggerRect.left - tooltipRect.width - 8
        break
      case 'right':
        top = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2)
        left = triggerRect.right + 8
        break
      case 'top':
      default:
        top = triggerRect.top - tooltipRect.height - 8
        left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2)
        break
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    if (left < 8) left = 8
    if (left + tooltipRect.width > viewportWidth - 8) {
      left = viewportWidth - tooltipRect.width - 8
    }
    if (top < 8) top = 8
    if (top + tooltipRect.height > viewportHeight - 8) {
      top = viewportHeight - tooltipRect.height - 8
    }

    setPosition({ top, left })
  }

  const showTooltip = (immediate = false) => {
    if (disabled || !content) return

    clearTimeout(timeoutRef.current)
    if (immediate || delay <= 0) {
      setIsVisible(true)
      requestAnimationFrame(calculatePosition)
      return
    }

    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      requestAnimationFrame(calculatePosition)
    }, delay)
  }

  const hideTooltip = () => {
    clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return undefined

    calculatePosition()
    window.addEventListener('scroll', calculatePosition, true)
    window.addEventListener('resize', calculatePosition)
    window.addEventListener('orientationchange', calculatePosition)

    return () => {
      window.removeEventListener('scroll', calculatePosition, true)
      window.removeEventListener('resize', calculatePosition)
      window.removeEventListener('orientationchange', calculatePosition)
    }
  }, [isVisible, placement, content])

  const tooltipNode = isVisible && content ? (
    <div
      ref={tooltipRef}
      className={`tooltip tooltip-${placement}`}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999
      }}
    >
      <div className="tooltip-content">
        {content}
      </div>
      <div className={`tooltip-arrow tooltip-arrow-${placement}`} />
    </div>
  ) : null

  return (
    <>
      <div
        ref={triggerRef}
        className={`tooltip-trigger ${className}`}
        onMouseEnter={() => showTooltip()}
        onMouseLeave={hideTooltip}
        onFocus={() => showTooltip()}
        onBlur={hideTooltip}
        onClick={() => {
          if (disabled || !content) return
          if (isVisible) {
            hideTooltip()
          } else {
            showTooltip(true)
          }
        }}
      >
        {children}
      </div>
      {isMounted && tooltipNode ? createPortal(tooltipNode, document.body) : tooltipNode}
    </>
  )
}

export default Tooltip
