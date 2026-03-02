import MarkdownIt from 'markdown-it'
import deflist from 'markdown-it-deflist'
import implicitFigures from 'markdown-it-implicit-figures'
import toc from 'markdown-it-table-of-contents'
import ruby from 'markdown-it-ruby'

import markdownItSpan from './markdownItSpan'
import markdownItRemovePre from './markdownItRemovePre'
import markdownItLinkFoot from './markdownItLinkFoot'
import markdownItImageFlow from './markdownItImageFlow'
import markdownItLi from './markdownItLi'
import highlightjs from './langHighlight'

// WeChat-style code block renderer used in markdown-nice
function wechatHighlight(str, lang) {
  const text = str.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = text.split('\n')
  const codeLines = []
  const numbers = []
  for (let i = 0; i < lines.length - 1; i++) {
    codeLines.push('<code><span class="code-snippet_outer">' + (lines[i] || '<br>') + '</span></code>')
    numbers.push('<li></li>')
  }
  return (
    '<section class="code-snippet__fix code-snippet__js">' +
    '<ul class="code-snippet__line-index code-snippet__js">' +
    numbers.join('') +
    '</ul>' +
    '<pre class="code-snippet__js" data-lang="' + (lang || '') + '">' +
    codeLines.join('') +
    '</pre></section>'
  )
}

// Highlight.js renderer adapted from markdown-nice
function hljsHighlight(str, lang) {
  if (lang && highlightjs.getLanguage(lang)) {
    try {
      const result = highlightjs.highlight(str, { language: lang })
      return '<pre class="custom"><code class="hljs">' + result.value + '</code></pre>'
    } catch (e) {
      // ignore and fallback
    }
  }
  return '<pre class="custom"><code class="hljs">' + MarkdownIt().utils.escapeHtml(str) + '</code></pre>'
}

export function createNiceParser({ codeStyle = 'wechat' } = {}) {
  const useWechat = codeStyle === 'wechat'
  const md = new MarkdownIt({ html: true, highlight: useWechat ? wechatHighlight : hljsHighlight })
  md
    .use(markdownItSpan)
    // Only remove nested pre when using WeChat-style renderer
    .use(useWechat ? markdownItRemovePre : (instance) => instance)
    .use(markdownItLinkFoot)
    .use(toc, { transformLink: () => '', includeLevel: [2, 3], markerPattern: /^\[toc\]/im })
    .use(ruby)
    .use(implicitFigures, { figcaption: true })
    .use(deflist)
    .use(markdownItLi)
    .use(markdownItImageFlow)
  return md
}

export function renderNiceHtml(markdown, { codeStyle = 'wechat' } = {}) {
  const parser = createNiceParser({ codeStyle })
  return parser.render(markdown || '')
}

