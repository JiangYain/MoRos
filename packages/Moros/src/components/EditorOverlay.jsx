import React from 'react'

function EditorOverlay({
  layerRef,
  highlightRef,
  renderHtml,
  aiStatus,
  aiPos,
}) {
  return (
    <div className="editor-layer" ref={layerRef}>
      <div className="editor-highlight" ref={highlightRef} dangerouslySetInnerHTML={{ __html: renderHtml }} />
      {aiStatus === 'streaming' && (
        <div className="ai-stream-hint" style={{ ['--ai-left']: `${aiPos.left}px`, ['--ai-top']: `${aiPos.top}px` }}>
          <span className="ai-thinking-label">MoRos&nbsp;Thinking</span>
          <span className="dot"/><span className="dot"/><span className="dot"/>
        </div>
      )}
    </div>
  )
}

export default EditorOverlay


