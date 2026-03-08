import React from 'react'

function ArtifactsToggleButton({ open, artifactCount = 0, onToggle }) {
  const countLabel = artifactCount > 99 ? '99+' : String(artifactCount)

  return (
    <button
      type="button"
      className={`chat-artifacts-toggle-btn ${open ? 'is-open' : ''}`}
      onClick={onToggle}
      aria-pressed={open}
      title={open ? '隐藏 Artifacts 面板' : '显示 Artifacts 面板'}
    >
      <span className="chat-artifacts-toggle-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M10 4v16" />
          <path d="M13.5 9h5" />
        </svg>
      </span>
      <span className="chat-artifacts-toggle-label">Artifacts</span>
      {artifactCount > 0 && (
        <span className="chat-artifacts-toggle-count" aria-label={`Artifacts ${countLabel}`}>
          {countLabel}
        </span>
      )}
    </button>
  )
}

export default ArtifactsToggleButton
