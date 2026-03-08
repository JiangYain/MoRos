export const normalizeMathDelimiters = (text) => {
  if (!text) return ''
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part) => {
      if (part.startsWith('```')) return part
      let out = part.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
      out = out.replace(/\\\(([^\n]*?)\\\)/g, (_, inner) => `$${inner}$`)
      return out
    })
    .join('')
}

export const normalizeCompactTableRows = (text) => {
  const source = String(text || '')
  if (!source) return ''
  const hasTableSeparator = /\|[\t ]*:?-{3,}:?[\t ]*(\|[\t ]*:?-{3,}:?[\t ]*)+/.test(source)
  if (!hasTableSeparator) return source
  return source
    .replace(/[ \t]+\|(?=\s*:?-{3,}:?\s*\|)/g, '\n|')
    .replace(/[ \t]+\|(?=\s*\d+\s*\|)/g, '\n|')
}

export const normalizeMarkdownForRender = (text) => {
  if (!text) return ''
  const normalizedMath = normalizeMathDelimiters(text)
  const parts = normalizedMath.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part) => (part.startsWith('```') ? part : normalizeCompactTableRows(part)))
    .join('')
}

export const normalizeBrandText = (text) => {
  return String(text || '').replace(/markov/gi, 'MoRos')
}
