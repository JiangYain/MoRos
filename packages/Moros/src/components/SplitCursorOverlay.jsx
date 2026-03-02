import React from 'react'

function SplitCursorOverlay({
  visible,
  editorRect,
  previewRect,
  yEditor,
  yPreview,
  xEditor,
  dynamicGuideEnabled = true,
}) {
  if (!visible || !editorRect || !previewRect || !Number.isFinite(yEditor) || !Number.isFinite(yPreview)) {
    return null
  }

  const dash = '8 6'
  const strokeWidth = 1.6
  const accent = '#1a1a1a'

  // 计算中间线（编辑区右缘与预览区左缘之间的中心）
  const centerX = Math.round((editorRect.right + previewRect.left) / 2)

  // 左侧编辑器直线：从光标位置到中间线，长度随光标动态变化
  const safeCursorX = Number.isFinite(xEditor) ? Math.round(xEditor) : Math.round(editorRect.left + 16)
  const xL1 = Math.min(safeCursorX, centerX - 8)
  const xL2 = Math.max(safeCursorX, centerX - 8)
  const xR1 = Math.round(previewRect.left + 8)
  const xR2 = Math.round(previewRect.right - 8)

  // 曲线连接从中间线到右侧线段
  const cx1 = centerX
  const cy1 = Math.round(yEditor)
  const cx2 = xR1
  const cy2 = Math.round(yPreview)

  // 创建优雅的贝塞尔曲线控制点（水平延伸）
  const deltaX = cx2 - cx1
  const controlOffset = Math.min(Math.abs(deltaX) * 0.42, 96)
  const cp1x = cx1 + controlOffset
  const cp1y = cy1
  const cp2x = cx2 - controlOffset
  const cp2y = cy2

  const minX = Math.min(xL1, xR1, cx1, cx2, cp1x, cp2x) - 16
  const minY = Math.min(yEditor, yPreview) - 40
  const maxX = Math.max(xL2, xR2, cx1, cx2, cp1x, cp2x) + 16
  const maxY = Math.max(yEditor, yPreview) + 40

  const w = Math.max(0, maxX - minX)
  const h = Math.max(0, maxY - minY)

  const toLocalX = (x) => x - minX
  const toLocalY = (y) => y - minY

  const svgStyle = {
    position: 'fixed',
    left: minX,
    top: minY,
    width: w,
    height: h,
    pointerEvents: 'none',
    zIndex: 20,
    '--split-cursor-color': accent,
  }

  return (
    <svg className="split-cursor-overlay" style={svgStyle}>
      {/* 左侧水平虚线（光标 → 中间线） */}
      {dynamicGuideEnabled && (
        <line
          className="split-cursor-line"
          x1={toLocalX(xL1)}
          y1={toLocalY(yEditor)}
          x2={toLocalX(xL2)}
          y2={toLocalY(yEditor)}
          stroke={accent}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          shapeRendering="geometricPrecision"
          strokeLinecap="round"
        />
      )}
      {/* 右侧水平虚线 */}
      <line
        className="split-cursor-line"
        x1={toLocalX(xR1)}
        y1={toLocalY(yPreview)}
        x2={toLocalX(xR2)}
        y2={toLocalY(yPreview)}
        stroke={accent}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        shapeRendering="geometricPrecision"
        strokeLinecap="round"
      />
      {/* 中间曲线连接（中间线 → 预览左缘） */}
      <path
        className="split-cursor-connector"
        d={`M ${toLocalX(cx1)} ${toLocalY(cy1)} C ${toLocalX(cp1x)} ${toLocalY(cp1y)}, ${toLocalX(cp2x)} ${toLocalY(cp2y)}, ${toLocalX(cx2)} ${toLocalY(cy2)}`}
        fill="none"
        stroke={accent}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        shapeRendering="geometricPrecision"
        strokeLinecap="round"
      />
      {/* 端点小圆 */}
      <circle className="split-cursor-dot" cx={toLocalX(cx1)} cy={toLocalY(cy1)} r={3} fill={accent} />
      <circle className="split-cursor-dot" cx={toLocalX(cx2)} cy={toLocalY(cy2)} r={3} fill={accent} />
    </svg>
  )
}

export default SplitCursorOverlay
