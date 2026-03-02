// Horizontal image flow plugin: supports <(![alt](src), ...)> syntax
export default function markdownItImageFlow(md, opt) {
  const options = Object.assign({ limitless: false, limit: 10 }, opt)

  function tokenize(state, startLine) {
    const srcLine = state.src.slice(state.bMarks[startLine], state.eMarks[startLine])
    if (srcLine.charCodeAt(0) !== 0x3c) return false // <
    const matchReg = /^<((!\[[^[\]]*\]\([^()]+\)(,?\s*(?=>)|,\s*(?!>)))+)>/
    const match = matchReg.exec(srcLine)
    if (!match) return false
    const images = match[1].match(/\[[^\]]*\]\([^)]+\)/g)
    if (!options.limitless && images.length > options.limit) return false
    const token = state.push('imageFlow', '', 0)
    token.meta = images
    token.block = true
    state.line++
    return true
  }

  md.renderer.rules.imageFlow = (tokens, idx) => {
    const contents = tokens[idx].meta
    let wrapped = ''
    contents.forEach((content) => {
      const altMatch = content.match(/\[([^\]]*)\]/)
      const srcMatch = content.match(/\(([^()]*)\)/)
      const alt = altMatch ? altMatch[1] : ''
      const src = srcMatch ? srcMatch[1] : ''
      wrapped += `<section class="imageflow-layer3"><img alt="${alt}" src="${src}" class="imageflow-img" /></section>`
    })
    return `<section class="imageflow-layer1"><section class="imageflow-layer2">${wrapped}</section></section>`
  }

  md.block.ruler.before('paragraph', 'imageFlow', tokenize)
}

