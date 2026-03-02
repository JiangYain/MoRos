// Tiny in-memory store to share preview settings across components
const listeners = new Set()

// 简化的预览设置：固定使用统一主题
const state = {
  themeId: 'unified', // 统一主题
  codeThemeId: 'unified', // 统一代码主题
  macStyle: true, // 固定使用Mac风格
}

export function getPreviewSettings() {
  return { ...state }
}

export function setPreviewSettings(patch) {
  let changed = false
  if (patch && typeof patch === 'object') {
    for (const k of Object.keys(patch)) {
      if (k in state && state[k] !== patch[k]) {
        state[k] = patch[k]
        changed = true
      }
    }
  }
  if (changed) {
    for (const cb of Array.from(listeners)) {
      try { cb({ ...state }) } catch {}
    }
  }
  return { ...state }
}

export function subscribePreviewSettings(cb) {
  if (typeof cb !== 'function') return () => {}
  listeners.add(cb)
  return () => listeners.delete(cb)
}
