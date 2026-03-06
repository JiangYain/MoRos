import React from 'react'

function MorosShapeIcon({ className = '', title = 'MoRos', strokeWidth = 10 }) {
  return (
    <svg
      className={className}
      viewBox="0 0 180 120"
      fill="none"
      role="img"
      aria-label={title}
    >
      <g fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="60,20 20,60 60,100" stroke="currentColor" />
        <line x1="75" y1="100" x2="105" y2="20" style={{ stroke: 'var(--moros-shape-accent, #D94632)' }} />
        <polyline points="120,20 160,60 120,100" stroke="currentColor" />
      </g>
    </svg>
  )
}

export default MorosShapeIcon
