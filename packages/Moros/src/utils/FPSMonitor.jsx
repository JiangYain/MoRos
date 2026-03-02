import React, { useEffect, useRef, useState } from 'react'

/**
 * FPS监控器组件 - 仅在开发环境显示
 */
function FPSMonitor() {
  const [fps, setFps] = useState(60)
  const [avgFps, setAvgFps] = useState(60)
  const [minFps, setMinFps] = useState(60)
  const [maxFps, setMaxFps] = useState(60)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const fpsHistoryRef = useRef([])
  
  useEffect(() => {
    // 仅在开发环境启用
    if (import.meta.env.PROD) return
    
    let rafId
    const measureFPS = () => {
      const currentTime = performance.now()
      const deltaTime = currentTime - lastTimeRef.current
      
      frameCountRef.current++
      
      // 每250ms更新一次FPS显示
      if (deltaTime >= 250) {
        const currentFps = Math.round((frameCountRef.current * 1000) / deltaTime)
        setFps(currentFps)
        
        // 更新历史记录
        fpsHistoryRef.current.push(currentFps)
        if (fpsHistoryRef.current.length > 120) { // 保留最近30秒的数据
          fpsHistoryRef.current.shift()
        }
        
        // 计算统计数据
        if (fpsHistoryRef.current.length > 0) {
          const sum = fpsHistoryRef.current.reduce((a, b) => a + b, 0)
          const avg = Math.round(sum / fpsHistoryRef.current.length)
          const min = Math.min(...fpsHistoryRef.current)
          const max = Math.max(...fpsHistoryRef.current)
          
          setAvgFps(avg)
          setMinFps(min)
          setMaxFps(max)
        }
        
        frameCountRef.current = 0
        lastTimeRef.current = currentTime
      }
      
      rafId = requestAnimationFrame(measureFPS)
    }
    
    measureFPS()
    
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])
  
  // 生产环境不渲染
  if (import.meta.env.PROD) return null
  
  // 根据FPS值确定颜色
  const getColor = (fpsValue) => {
    if (fpsValue >= 55) return '#00ff00' // 绿色 - 优秀
    if (fpsValue >= 40) return '#ffff00' // 黄色 - 良好
    if (fpsValue >= 25) return '#ff8800' // 橙色 - 一般
    return '#ff0000' // 红色 - 差
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.8)',
      color: '#fff',
      padding: '10px',
      borderRadius: '5px',
      fontFamily: 'Monaco, monospace',
      fontSize: '12px',
      zIndex: 10000,
      minWidth: '150px',
      pointerEvents: 'none',
      userSelect: 'none'
    }}>
      <div style={{ marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>
        FPS Monitor
      </div>
      <div style={{ color: getColor(fps), fontSize: '20px', fontWeight: 'bold' }}>
        {fps} FPS
      </div>
      <div style={{ marginTop: '8px', borderTop: '1px solid #555', paddingTop: '8px' }}>
        <div>Avg: <span style={{ color: getColor(avgFps) }}>{avgFps}</span></div>
        <div>Min: <span style={{ color: getColor(minFps) }}>{minFps}</span></div>
        <div>Max: <span style={{ color: getColor(maxFps) }}>{maxFps}</span></div>
      </div>
      <div style={{ 
        marginTop: '8px', 
        fontSize: '10px', 
        color: '#888',
        borderTop: '1px solid #555',
        paddingTop: '8px'
      }}>
        Target: ≥55 FPS
      </div>
    </div>
  )
}

export default FPSMonitor
