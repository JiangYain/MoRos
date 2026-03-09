import React from 'react'
import { X } from 'lucide-react'
import ChatComposer from '../ChatComposer'
import FileTypeIcon from './FileTypeIcon'

function ChatInputSection({
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
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
  t,
  isLoading,
  inputRef,
  isDragOver,
  handleKeyDown,
  skillItems,
  handleSkillSelect,
}) {
  return (
    <div
      className="chat-input-container"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {(uploadedFiles.length > 0 || uploadingFiles.length > 0) && (
        <div className="chat-uploaded-files">
          {uploadingFiles.map((file) => (
            <div key={file.id} className="chat-uploaded-file uploading">
              <div className="upload-progress-ring">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="var(--border-subtle)"
                    strokeWidth="2"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="var(--accent-color)"
                    strokeWidth="2"
                    strokeDasharray={`${2 * Math.PI * 8}`}
                    strokeDashoffset={`${2 * Math.PI * 8 * (1 - file.progress / 100)}`}
                    strokeLinecap="round"
                    transform="rotate(-90 10 10)"
                    style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                  />
                </svg>
              </div>
              <span className="chat-uploaded-file-name">{file.name}</span>
            </div>
          ))}

          {uploadedFiles.map((file, index) => (
            <div key={index} className="chat-uploaded-file">
              <FileTypeIcon
                pathValue={file.path}
                nameValue={file.name}
                className="chat-message-artifact-file-icon"
              />
              <span className="chat-uploaded-file-name">{file.name}</span>
              <button
                className="chat-uploaded-file-remove"
                onClick={() => removeUploadedFile(index)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={handleFileUpload}
      />

      <ChatComposer
        value={inputValue}
        onValueChange={setInputValue}
        onSubmit={handleSend}
        onStop={handleStop}
        onPaste={handleComposerPaste}
        onAttach={handleOpenUploadPicker}
        addMenuOptions={composerAddMenuOptions}
        onAddMenuSelect={handleComposerAddMenuSelect}
        placeholder={t('chat.ask_anything')}
        canSubmit={Boolean(inputValue.trim() || uploadedFiles.length > 0)}
        isLoading={isLoading}
        multiline
        rows={1}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        dragOver={isDragOver}
        attachTitle="Add options"
        submitTitle={t('chat.send_message')}
        stopTitle={t('chat.stop_generating')}
        skillItems={skillItems}
        onSkillSelect={handleSkillSelect}
      />
    </div>
  )
}

export default ChatInputSection
