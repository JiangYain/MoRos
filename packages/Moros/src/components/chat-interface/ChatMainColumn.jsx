import React from 'react'
import ArtifactsToggleButton from './ArtifactsToggleButton'
import ChatMessagesPanel from './ChatMessagesPanel'
import ChatInputSection from './ChatInputSection'

function ChatMainColumn({
  artifactsOpen,
  onToggleArtifactsOpen,
  artifactEntriesCount,
  messages,
  chatFilePath,
  streamingSegments,
  isThinking,
  thinkingState,
  streamingContent,
  justFinished,
  normalizeMarkdownForRender,
  t,
  avatar,
  username,
  timeLocale,
  messagesEndRef,
  onOpenArtifact,
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  uploadedFiles,
  uploadingFiles,
  removeUploadedFile,
  fileInputRef,
  handleFileUpload,
  inputValue,
  setInputValue,
  handleSend,
  handleStop,
  handleComposerPaste,
  handleOpenUploadPicker,
  composerAddMenuOptions,
  handleComposerAddMenuSelect,
  isLoading,
  inputRef,
  isDragOver,
  handleKeyDown,
}) {
  return (
    <div className="chat-main-column">
      <div className="chat-top-actions">
        <div className="chat-top-actions-inner">
          <ArtifactsToggleButton
            open={artifactsOpen}
            artifactCount={artifactEntriesCount}
            onToggle={onToggleArtifactsOpen}
          />
        </div>
      </div>

      <ChatMessagesPanel
        messages={messages}
        chatFilePath={chatFilePath}
        streamingSegments={streamingSegments}
        isThinking={isThinking}
        thinkingState={thinkingState}
        streamingContent={streamingContent}
        justFinished={justFinished}
        normalizeMarkdownForRender={normalizeMarkdownForRender}
        t={t}
        avatar={avatar}
        username={username}
        timeLocale={timeLocale}
        messagesEndRef={messagesEndRef}
        onOpenArtifact={onOpenArtifact}
      />

      <ChatInputSection
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        uploadedFiles={uploadedFiles}
        uploadingFiles={uploadingFiles}
        removeUploadedFile={removeUploadedFile}
        fileInputRef={fileInputRef}
        handleFileUpload={handleFileUpload}
        inputValue={inputValue}
        setInputValue={setInputValue}
        handleSend={handleSend}
        handleStop={handleStop}
        handleComposerPaste={handleComposerPaste}
        handleOpenUploadPicker={handleOpenUploadPicker}
        composerAddMenuOptions={composerAddMenuOptions}
        handleComposerAddMenuSelect={handleComposerAddMenuSelect}
        t={t}
        isLoading={isLoading}
        inputRef={inputRef}
        isDragOver={isDragOver}
        handleKeyDown={handleKeyDown}
      />
    </div>
  )
}

export default ChatMainColumn
