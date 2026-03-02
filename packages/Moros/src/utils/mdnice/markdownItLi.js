// Wrap list item content in a section for better styling, per markdown-nice
export default function markdownItLi(md) {
  function rule() {
    md.renderer.rules.list_item_open = function () { return '<li><section>' }
    md.renderer.rules.list_item_close = function () { return '</section></li>' }
  }
  md.core.ruler.push('replace-li', rule)
}

