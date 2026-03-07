const CHAT_DRAFT_KEY_PREFIX = 'moros-chat-draft:'

const getChatDraftStorageKey = (chatPath) => {
  const normalizedPath = String(chatPath || '').trim().toLowerCase()
  if (!normalizedPath) return ''
  return `${CHAT_DRAFT_KEY_PREFIX}${normalizedPath}`
}

export const loadChatDraft = (chatPath) => {
  const key = getChatDraftStorageKey(chatPath)
  if (!key) return ''
  try {
    return String(sessionStorage.getItem(key) || '')
  } catch {
    return ''
  }
}

export const persistChatDraft = (chatPath, value) => {
  const key = getChatDraftStorageKey(chatPath)
  if (!key) return
  const normalizedValue = String(value || '')
  try {
    if (!normalizedValue) {
      sessionStorage.removeItem(key)
      return
    }
    sessionStorage.setItem(key, normalizedValue)
  } catch {}
}
