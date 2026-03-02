import React, { useState, useEffect } from 'react'
import StyleConfigurator from './StyleConfigurator'

function StyleSidebar({ isOpen, onClose, onStyleChange, customCSS, width = 420, isFixedPanel = false }) {
  // 处理样式变化（包含自动保存）
  const handleStyleChange = (css) => {
    onStyleChange?.(css)
    
    // 自动保存到localStorage
    try {
      localStorage.setItem('markov-custom-theme', css)
      console.log('样式已自动保存')
    } catch (error) {
      console.error('自动保存样式失败:', error)
    }
  }

  if (!isOpen) return null

  return (
    <StyleConfigurator
      isOpen={isOpen}
      onClose={onClose}
      onStyleChange={handleStyleChange}
      currentConfig={{}} // 可以传入当前配置进行初始化
      width={width}
      isFixedPanel={isFixedPanel}
    />
  )
}

export default StyleSidebar
