// Convert [text](url "title as footnote") to link+footnote tokens and render a footnote block
export default function markdownItLinkFoot(md) {
  function renderFootnoteAnchorName(tokens, idx, options, env) {
    const n = String(Number(tokens[idx].meta.id + 1))
    let prefix = ''
    if (typeof env.docId === 'string') prefix = '-' + env.docId + '-'
    return prefix + n
  }

  function renderFootnoteCaption(tokens, idx) {
    let n = String(Number(tokens[idx].meta.id + 1))
    if (tokens[idx].meta.subId > 0) n += ':' + tokens[idx].meta.subId
    return '[' + n + ']'
  }

  function renderFootnoteWord(tokens, idx) {
    return '<span class="footnote-word">' + tokens[idx].content + '</span>'
  }

  function renderFootnoteRef(tokens, idx, options, env, slf) {
    const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf)
    return '<sup class="footnote-ref">' + caption + '</sup>'
  }

  function renderFootnoteBlockOpen() {
    return '<h3 class="footnotes-sep"></h3>\n<section class="footnotes">\n'
  }
  function renderFootnoteBlockClose() {
    return '</section>\n'
  }
  function renderFootnoteOpen(tokens, idx, options, env, slf) {
    let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf)
    if (tokens[idx].meta.subId > 0) id += ':' + tokens[idx].meta.subId
    return '<span id="fn' + id + '" class="footnote-item"><span class="footnote-num">[' + id + '] </span>'
  }
  function renderFootnoteClose() { return '</span>\n' }

  function isSpace(code) { return code === 0x09 || code === 0x20 }
  function normalizeReference(str) {
    return str.trim().replace(/\s+/g, ' ').toUpperCase()
  }

  function linkFoot(state, silent) {
    let attrs, code, label, pos, res, ref, title, token
    let href = ''
    const oldPos = state.pos
    const max = state.posMax
    if (state.src.charCodeAt(state.pos) !== 0x5b) return false // [

    const labelStart = state.pos + 1
    const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true)
    if (labelEnd < 0) return false

    pos = labelEnd + 1
    let parseReference = true

    if (pos < max && state.src.charCodeAt(pos) === 0x28) {
      // Inline link
      parseReference = false
      pos++
      for (; pos < max; pos++) { code = state.src.charCodeAt(pos); if (!isSpace(code) && code !== 0x0a) break }
      if (pos >= max) return false
      let start = pos
      res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax)
      if (res.ok) {
        href = state.md.normalizeLink(res.str)
        if (state.md.validateLink(href)) pos = res.pos; else href = ''
      }
      start = pos
      for (; pos < max; pos++) { code = state.src.charCodeAt(pos); if (!isSpace(code) && code !== 0x0a) break }
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax)
      if (pos < max && start !== pos && res.ok) { title = res.str; pos = res.pos } else { title = '' }
      if (pos >= max || state.src.charCodeAt(pos) !== 0x29) parseReference = true
      pos++
    }

    if (parseReference) {
      if (typeof state.env.references === 'undefined') return false
      let start
      if (pos < max && state.src.charCodeAt(pos) === 0x5b) {
        start = pos + 1
        pos = state.md.helpers.parseLinkLabel(state, pos)
        if (pos >= 0) label = state.src.slice(start, pos++)
        else pos = labelEnd + 1
      } else {
        pos = labelEnd + 1
      }
      if (!label) label = state.src.slice(labelStart, labelEnd)
      ref = state.env.references[normalizeReference(label)]
      if (!ref) { state.pos = oldPos; return false }
      href = ref.href; title = ref.title
    }

    if (!silent) {
      if (title) {
        state.pos = labelStart
        state.posMax = labelEnd
        let tokens
        if (!state.env.footnotes) state.env.footnotes = {}
        if (!state.env.footnotes.list) state.env.footnotes.list = []
        const footnoteId = state.env.footnotes.list.length
        state.md.inline.parse(`${title}: *${res && res.str ? res.str : href}*`, state.md, state.env, (tokens = []))
        token = state.push('footnote_word', '', 0); token.content = state.src.slice(labelStart, labelEnd)
        token = state.push('footnote_ref', '', 0); token.meta = { id: footnoteId }
        state.env.footnotes.list[footnoteId] = { tokens }
      } else {
        state.pos = labelStart
        state.posMax = labelEnd
        token = state.push('link_open', 'a', 1)
        const attrsArr = [['href', href]]
        token.attrs = attrsArr
        if (title) attrsArr.push(['title', title])
        state.md.inline.tokenize(state)
        token = state.push('link_close', 'a', -1)
      }
    }

    state.pos = pos
    state.posMax = max
    return true
  }

  function footnoteTail(state) {
    if (!state.env.footnotes) return
    let insideRef = false, current = [], currentLabel, refTokens = {}
    state.tokens = state.tokens.filter((tok) => {
      if (tok.type === 'footnote_reference_open') { insideRef = true; current = []; currentLabel = tok.meta.label; return false }
      if (tok.type === 'footnote_reference_close') { insideRef = false; refTokens[':' + currentLabel] = current; return false }
      if (insideRef) { current.push(tok) }
      return !insideRef
    })
    if (!state.env.footnotes.list) return
    const list = state.env.footnotes.list
    let token
    token = new state.Token('footnote_block_open', '', 1); state.tokens.push(token)
    for (let i = 0; i < list.length; i++) {
      token = new state.Token('footnote_open', '', 1); token.meta = { id: i, label: list[i].label }; state.tokens.push(token)
      let tokens
      if (list[i].tokens) {
        tokens = []
        token = new state.Token('paragraph_open', 'p', 1); token.block = true; tokens.push(token)
        token = new state.Token('inline', '', 0); token.children = list[i].tokens; token.content = ''; tokens.push(token)
        token = new state.Token('paragraph_close', 'p', -1); token.block = true; tokens.push(token)
      } else if (list[i].label) {
        tokens = refTokens[':' + list[i].label]
      }
      state.tokens = state.tokens.concat(tokens)
      const last = state.tokens[state.tokens.length - 1]
      if (last.type === 'paragraph_close') {
        const lastParagraph = state.tokens.pop()
        state.tokens.push(lastParagraph)
      }
      token = new state.Token('footnote_close', '', -1); state.tokens.push(token)
    }
    token = new state.Token('footnote_block_close', '', -1); state.tokens.push(token)
  }

  md.renderer.rules.footnote_ref = renderFootnoteRef
  md.renderer.rules.footnote_word = renderFootnoteWord
  md.renderer.rules.footnote_block_open = renderFootnoteBlockOpen
  md.renderer.rules.footnote_block_close = renderFootnoteBlockClose
  md.renderer.rules.footnote_open = renderFootnoteOpen
  md.renderer.rules.footnote_close = renderFootnoteClose
  md.renderer.rules.footnote_caption = renderFootnoteCaption
  md.renderer.rules.footnote_anchor_name = renderFootnoteAnchorName
  md.inline.ruler.at('link', linkFoot)
  md.core.ruler.after('inline', 'footnote_tail', footnoteTail)
}

