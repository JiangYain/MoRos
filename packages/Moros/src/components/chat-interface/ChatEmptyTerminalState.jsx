import React from 'react'

const MOROS_ASCII_ART = [
  '███╗   ███╗ ██████╗ ██████╗  ██████╗ ███████╗',
  '████╗ ████║██╔═══██╗██╔══██╗██╔═══██╗██╔════╝',
  '██╔████╔██║██║   ██║██████╔╝██║   ██║███████╗',
  '██║╚██╔╝██║██║   ██║██╔══██╗██║   ██║╚════██║',
  '██║ ╚═╝ ██║╚██████╔╝██║  ██║╚██████╔╝███████║',
  '╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
].join('\n')

function ChatEmptyTerminalState() {
  return (
    <div className="chat-empty-ascii-wrapper">
      <pre className="chat-empty-ascii" role="img" aria-label="MoRos">{MOROS_ASCII_ART}</pre>
      <pre className="chat-empty-ascii-glow" aria-hidden="true">{MOROS_ASCII_ART}</pre>
    </div>
  )
}

export default ChatEmptyTerminalState
