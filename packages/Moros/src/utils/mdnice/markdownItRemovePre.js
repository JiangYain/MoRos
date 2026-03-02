// Remove pre/code wrapper for WeChat-style code blocks (markdown-nice behavior)
export default function markdownItRemovePre(md) {
  const oldFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const rendered = oldFence(tokens, idx, options, env, slf)
    const preReg = /<pre><code[\w\s-="]*>/
    const match = preReg.exec(rendered)
    if (match) {
      const pre = match[0]
      const post = '</code></pre>'
      return rendered.replace(pre, '').replace(post, '')
    }
    return rendered
  }
}

