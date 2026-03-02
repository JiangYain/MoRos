// Minimal port of markdown-nice's heading span plugin
export default function markdownItSpan(md, opts) {
  const defaults = {
    addHeadingSpan: true,
  }
  const options = Object.assign({}, defaults, opts)

  function addHeadingSpans(state) {
    for (let i = 0; i < state.tokens.length - 1; i++) {
      const open = state.tokens[i]
      const inline = state.tokens[i + 1]
      if (open.type !== 'heading_open' || inline.type !== 'inline') continue
      if (!inline.content) continue
      if (options.addHeadingSpan) {
        const pre = new state.Token('html_inline', '', 0)
        pre.content = '<span class="prefix"></span><span class="content">'
        inline.children.unshift(pre)
        const post = new state.Token('html_inline', '', 0)
        post.content = '</span><span class="suffix"></span>'
        inline.children.push(post)
      }
      i += 2
    }
  }

  md.core.ruler.push('heading_span', addHeadingSpans)
}

