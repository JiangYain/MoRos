export default `/*
 * MoRos Unified Theme
 * 
 * 结合了以下主题的最佳效果：
 * - Markdown主题: cinnabar red
 * - 代码主题: Mac风格的Atom One Dark
 * - 基础样式: mdnice基础样式
 * 
 * 这是一个统一的主题文件，简化了复杂的主题选择机制
 */

/*默认样式，最佳实践*/

/* 主题变量（与样式面板选项对齐，可被自定义CSS覆盖） */
:root {
  --primary: #1a1a1a;
  --secondary: #F1A094;
  --accent: #1a1a1a;
  --bg-soft: #FFF4F2;
  --border: #F1A094;
  --text-primary: #111827; /* 黑 */
  --heading-color: #111827;
  --code-bg: #282c34;
  --code-radius: 5px;
  --content-padding: 10px;
  --section-spacing: 20px;
  --font-base: 16px;
  --line-height: 1.6;
  --letter-spacing: 2px;
}

[data-theme="dark"]:root {
  --text-primary: #e5e7eb; /* 近白 */
  --heading-color: #f3f4f6;
  --bg-soft: rgba(148, 163, 184, 0.08);
  --border: rgba(148, 163, 184, 0.35);
  --code-bg: #1f2937;
}

/*全局属性*/
#nice {
  font-size: 16px;
  color: black;
  padding: 0 10px;
  line-height: 1.6;
  word-spacing: 0px;
  letter-spacing: 0px;
  word-break: break-word;
  word-wrap: break-word;
  text-align: left;
  font-family: Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif;
  margin-top: -10px; /*解决开头空隙过大问题*/
  
  /* nightPurple 背景纹理 */
  background-image: linear-gradient(90deg, rgba(50, 0, 0, 0.05) 3%, rgba(0, 0, 0, 0) 3%), linear-gradient(360deg, rgba(50, 0, 0, 0.05) 3%, rgba(0, 0, 0, 0) 3%);
  background-size: 20px 20px;
  background-position: center center;
  letter-spacing: 2px;
  font-family: Optima-Regular, Optima, PingFangTC-Light, PingFangSC-light, PingFangTC-light;
}

/*段落*/
#nice p {
  margin: 10px 0px;
  letter-spacing: 2px;
  font-size: 14px;
  word-spacing: 2px;
  padding-top: 8px;
  padding-bottom: 8px;
  line-height: 26px;
  color: black;
}

/*标题*/
#nice h1,
#nice h2,
#nice h3,
#nice h4,
#nice h5,
#nice h6 {
  margin-top: 30px;
  margin-bottom: 15px;
  font-weight: bold;
  color: black;
}

/* 一级标题 - nightPurple风格 */
#nice h1 {
  font-size: 25px;
}
#nice h1 .content {
  display: inline-block;
  font-weight: bold;
  color: var(--accent);
}

/* 二级标题 - nightPurple风格 */
#nice h2 {
  text-align: left;
  margin: 20px 10px 0px 0px;
  font-size: 22px;
}
#nice h2 .content {
  font-size: 18px;
  font-weight: bold;
  display: inline-block;
  padding-left: 10px;
  border-left: 5px solid var(--primary);
}

/* 三级标题 - nightPurple风格 */
#nice h3 {
  font-size: 16px;
  font-weight: bold;
  text-align: center;
}
#nice h3 .content {
  border-bottom: 2px solid var(--secondary);
}

#nice h4 {
  font-size: 18px;
}
#nice h5 {
  font-size: 16px;
}
#nice h6 {
  font-size: 16px;
}

#nice h1 .prefix,
#nice h2 .prefix,
#nice h3 .prefix,
#nice h4 .prefix,
#nice h5 .prefix,
#nice h6 .prefix {
  display: none;
}

#nice h1 .suffix
#nice h2 .suffix,
#nice h3 .suffix,
#nice h4 .suffix,
#nice h5 .suffix,
#nice h6 .suffix {
  display: none;
}

/*列表 - nightPurple风格*/
#nice ul,
#nice ol {
  margin-top: 8px;
  margin-bottom: 8px;
  padding-left: 25px;
  color: black;
}
#nice ul {
  font-size: 15px;
  list-style-type: circle;
}
#nice ul ul {
  list-style-type: square;
}
#nice ol {
  font-size: 15px;
  list-style-type: decimal;
}
#nice li section {
  font-size: 14px;
  font-weight: normal;
  margin-top: 5px;
  margin-bottom: 5px;
  line-height: 26px;
  text-align: left;
  color: rgb(1,1,1);
}

/*引用 - nightPurple风格*/
#nice .multiquote-1 {
  border-left-color: #d89cf6;
  background: #f4eeff;
}
#nice blockquote {
  display: block;
  font-size: 0.9em;
  overflow: auto;
  overflow-scrolling: touch;
  border-left: 3px solid #d89cf6;
  background: #f4eeff;
  color: #6a737d;
  padding-top: 10px;
  padding-bottom: 10px;
  padding-left: 20px;
  padding-right: 10px;
  margin-bottom: 20px;
  margin-top: 20px;
}
#nice blockquote p {
  margin: 0px;
  color: black;
  line-height: 26px;
}

#nice .table-of-contents a {
  border: none;
  color: black;
  font-weight: normal;
}

/*链接 - nightPurple风格*/
#nice a {
  color: var(--primary);
  font-weight: bolder;
  border-bottom: 1px solid var(--primary);
  text-decoration: none;
  word-wrap: break-word;
}

/*加粗 - nightPurple风格*/
#nice strong::before {
  content: '「';
}
#nice strong {
  color: var(--primary);
  font-weight: bold;
}
#nice strong::after {
  content: '」';
}

/*斜体 - nightPurple风格*/
#nice em {
  font-style: normal;
  color: var(--primary);
}

/*加粗斜体 - nightPurple风格*/
#nice em strong {
  color: var(--primary);
}

/*删除线 - nightPurple风格*/
#nice del {
  color: var(--primary);
}

/*分隔线 - nightPurple风格*/
#nice hr {
  height: 1px;
  padding: 0;
  border: none;
  border-top: 2px solid var(--secondary);
  margin: 0;
  margin-top: 10px;
  margin-bottom: 10px;
}

/*代码块*/
#nice pre {
  margin-top: 10px;
  margin-bottom: 10px;
}
#nice pre code {
  display: -webkit-box;
  font-family: Operator Mono, Consolas, Monaco, Menlo, monospace;
  border-radius: 0px;
  font-size: 12px;
  -webkit-overflow-scrolling: touch;
}
#nice pre code span {
  line-height: 26px;
}

/*行内代码 - nightPurple风格*/
#nice p code,
#nice li code {
  color: var(--primary);
  font-weight: bolder;
  background: none;
  font-size: 14px;
  word-wrap: break-word;
  padding: 2px 4px;
  border-radius: 4px;
  margin: 0 2px;
  font-family: Operator Mono, Consolas, Monaco, Menlo, monospace;
  word-break: break-all;
}

/*图片 - nightPurple风格*/
#nice img {
  border-radius: 6px;
  display: block;
  margin: 20px auto;
  object-fit: contain;
  box-shadow: 2px 4px 7px #999;
  width: auto;
  max-width: 100%;
}

/*图片*/
#nice figure {
  margin: 0;
  margin-top: 10px;
  margin-bottom: 10px;
}

/*图片描述文字*/
#nice figcaption {
  display: block;
  font-size: 13px;
  margin-top: 5px;
  text-align: center;
  color: #888;
}

/*表格*/
#nice table {
  display: table;
  text-align: left;
}
#nice tbody {
  border: 0;
}
#nice table tr {
  border: 0;
  border-top: 1px solid #ccc;
  background-color: white;
}
#nice table tr:nth-child(2n) {
  background-color: #F8F8F8;
}
#nice table tr th,
#nice table tr td {
  font-size: 14px;
  border: 1px solid #ccc;
  padding: 5px 10px;
  text-align: left;
}
#nice table tr th {
  font-weight: bold;
  background-color: #f0f0f0;
}

/* 微信代码块 - nightPurple风格 */
#nice .code-snippet__fix {
  background: #f7f7f7;
  border-radius: 2px;
  word-wrap: break-word !important;
  font-size: 14px;
  margin: 10px 0;
  display: block;
  color: #333;
  position: relative;
  background-color: rgba(0,0,0,0.03);
  border: 1px solid #f0f0f0;
  border-radius: 2px;
  display: flex;
  line-height: 20px;
}
#nice .code-snippet__fix pre {
  margin-bottom: 10px;
  margin-top: 0px;
}
#nice .code-snippet__fix .code-snippet__line-index {
  counter-reset: line;
  flex-shrink: 0;
  height: 100%;
  padding: 1em;
  list-style-type: none;
  padding: 16px;
  margin: 0;
}
#nice .code-snippet__fix .code-snippet__line-index li {
  list-style-type: none;
  text-align: right;
  line-height: 26px;
  color: black;
  margin: 0;
}
#nice .code-snippet__fix .code-snippet__line-index li::before {
  min-width: 1.5em;
  text-align: right;
  left: -2.5em;
  counter-increment: line;
  content: counter(line);
  display: inline;
  color: rgba(0,0,0,0.3);
}
#nice .code-snippet__fix pre {
  overflow-x: auto;
  padding: 16px;
  padding-left: 0;
  white-space: normal;
  flex: 1;
  -webkit-overflow-scrolling: touch;
}
#nice .code-snippet__fix code {
  text-align: left;
  font-size: 14px;
  display: block;
  white-space: pre;
  display: flex;
  position: relative;
  font-family: Consolas,"Liberation Mono",Menlo,Courier,monospace;
  padding: 0px;
}

/* Mac风格Atom One Dark代码高亮 */
.hljs {
  display: block;
  overflow-x: auto;
  padding: 16px;
  color: #abb2bf;
  background: #282c34;
}

.hljs-comment,
.hljs-quote {
  color: #5c6370;
  font-style: italic;
}

.hljs-doctag,
.hljs-keyword,
.hljs-formula {
  color: #c678dd;
}

.hljs-section,
.hljs-name,
.hljs-selector-tag,
.hljs-deletion,
.hljs-subst {
  color: #e06c75;
}

.hljs-literal {
  color: #56b6c2;
}

.hljs-string,
.hljs-regexp,
.hljs-addition,
.hljs-attribute,
.hljs-meta-string {
  color: #98c379;
}

.hljs-built_in,
.hljs-class .hljs-title {
  color: #e6c07b;
}

.hljs-attr,
.hljs-variable,
.hljs-template-variable,
.hljs-type,
.hljs-selector-class,
.hljs-selector-attr,
.hljs-selector-pseudo,
.hljs-number {
  color: #d19a66;
}

.hljs-symbol,
.hljs-bullet,
.hljs-link,
.hljs-meta,
.hljs-selector-id,
.hljs-title {
  color: #61aeee;
}

.hljs-emphasis {
  font-style: italic;
}

.hljs-strong {
  font-weight: bold;
}

.hljs-link {
  text-decoration: underline;
}

/* Mac风格代码块装饰 */
#nice .custom code {
  padding-top: 40px;
  padding-left: 15px;
  padding-right: 15px;
  padding-bottom: 15px;
  background: #282c34;
  border-radius: 0 0 5px 5px;
  position: relative;
}

#nice .custom:before {
  content: '';
  display: block;
  height: 30px;
  width: 100%;
  background: #282c34;
  margin-bottom: -7px;
  border-radius: 5px 5px 0 0;
  position: relative;
}

#nice .custom:after {
  content: '';
  position: absolute;
  top: 9px;
  left: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff5f56;
  box-shadow: 
    20px 0 0 #ffbd2e,
    40px 0 0 #27ca3f;
}

#nice .custom {
  border-radius: 5px;
  box-shadow: rgba(0, 0, 0, 0.55) 0px 2px 10px;
  position: relative;
}

/* 脚注 - nightPurple风格 */
#nice .footnotes {
  font-size: 14px;
}

#nice .footnote-word {
  font-weight: normal;
  color: var(--primary);
  font-weight: bold;
}

#nice .footnote-ref {
  font-weight: normal;
  color: var(--primary);
}

#nice .footnote-item em {
  font-size: 14px;
  color: var(--primary);
  display: block;
}

#nice .footnotes-sep:before {
  font-size: 20px;
  content: "参考资料";
  display: block;
}

#nice .footnote-num {
  color: var(--primary);
  display: inline;
  width: 10%;
  background: none;
  font-size: 80%;
  opacity: 0.6;
  line-height: 26px;
  font-family: ptima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif;
}

#nice .footnote-item p {
  color: var(--primary);
  font-weight: bold;
  display: inline;
  font-size: 14px;
  width: 90%;
  padding: 0px;
  margin: 0;
  line-height: 26px;
  word-break:break-all;
  width: calc(100%-50)
}

#nice .footnote-item p em {
  font-weight: normal;
}

#nice sub, sup {
  line-height: 0;
}

/* 解决公式问题 */
#nice .block-equation {
  display:block;
  text-align: center;
  overflow: auto;
  display: block;
  -webkit-overflow-scrolling: touch;
}

#nice .block-equation svg {
  max-width: 300% !important;
  -webkit-overflow-scrolling: touch;
}

#nice .inline-equation {
}

#nice .inline-equation svg {
}

#nice .imageflow-layer1 {
  margin: 1em auto;
  white-space: normal;
  border: 0px none;
  padding: 0px;
  overflow: hidden;
}

#nice .imageflow-layer2 {
  white-space: nowrap;
  width: 100%;
  overflow-x: scroll;
}

#nice .imageflow-layer3 {
  display: inline-block;
  word-wrap: break-word;
  white-space: normal;
  vertical-align: middle;
  width: 100%;
}

#nice .imageflow-img {
  display: inline-block;
}

#nice .nice-suffix-juejin-container {
  margin-top: 20px !important;
}

/* —— 扩展与覆盖：让主题更通用、可变量化 —— */

/* 颜色覆盖（避免上方少量硬编码 black）*/
#nice,
#nice p,
#nice li section,
#nice h1, #nice h2, #nice h3, #nice h4, #nice h5, #nice h6 {
  color: var(--text-primary);
}
#nice h1, #nice h2, #nice h3, #nice h4, #nice h5, #nice h6 { color: var(--heading-color); }

/* 链接状态 */
#nice a { color: var(--primary); border-bottom: 1px solid var(--primary); }
#nice a:hover { color: var(--accent); border-bottom-color: var(--accent); }

/* 目录（markdown-it-table-of-contents）增强 */
#nice .table-of-contents {
  padding: 10px 12px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 6px;
}
#nice .table-of-contents a { border: none; color: var(--text-primary); font-weight: normal; }

/* 任务列表（GFM） */
#nice .task-list-item { list-style: none; }
#nice .task-list-item input[type="checkbox"] {
  appearance: none;
  width: 14px; height: 14px;
  border: 1px solid var(--border);
  border-radius: 3px;
  margin-right: 8px;
  position: relative; top: 2px;
}
#nice .task-list-item input[type="checkbox"]:checked {
  background: var(--primary);
  border-color: var(--primary);
}
#nice .task-list-item input[type="checkbox"]:checked::after {
  content: '';
  position: absolute; left: 3px; top: 0px;
  width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg);
}

/* 定义列表 */
#nice dl { margin: 16px 0; }
#nice dt { font-weight: 600; color: var(--text-primary); }
#nice dd { margin: 0 0 10px 16px; color: var(--text-primary); }

/* 行内元素补全 */
#nice mark { background: color-mix(in oklab, var(--primary) 18%, transparent); color: var(--text-primary); padding: 0 2px; border-radius: 2px; }
#nice kbd {
  background: #11182710; border: 1px solid #11182722; border-bottom-width: 2px;
  padding: 0 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
#nice u { text-underline-offset: 2px; }

/* 表格增强（条纹、表头底色，与上方基本样式兼容） */
#nice table { border-collapse: separate; border-spacing: 0; overflow: hidden; border-radius: 4px; }
#nice thead th { background: #f8f8f8; color: var(--text-primary); }
#nice tbody tr:nth-child(2n) { background-color: #F8F8F8; }

/* 微信代码块容器：变量化背景与边框 */
#nice .code-snippet__fix {
  background-color: rgba(0,0,0,0.03);
  border: 1px solid #f0f0f0;
  border-radius: 2px;
}

/* Mac 风格代码块 & highlight 颜色（与Atom One Dark一致） */
#nice .custom code { background: var(--code-bg); border-radius: var(--code-radius); }
#nice .custom { border-radius: var(--code-radius); }
#nice .custom:before { background-color: var(--code-bg); }
.hljs { display: block; overflow-x: auto; padding: 16px; color: #abb2bf; background: var(--code-bg); border-radius: var(--code-radius); }
.hljs-comment, .hljs-quote { color: #5c6370; font-style: italic; }
.hljs-doctag, .hljs-keyword, .hljs-formula { color: #c678dd; }
.hljs-section, .hljs-name, .hljs-selector-tag, .hljs-deletion, .hljs-subst { color: #e06c75; }
.hljs-literal { color: #56b6c2; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute, .hljs-meta-string { color: #98c379; }
.hljs-built_in, .hljs-class .hljs-title { color: #e6c07b; }
.hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-type, .hljs-selector-class, .hljs-selector-attr, .hljs-selector-pseudo, .hljs-number { color: #d19a66; }
.hljs-symbol, .hljs-bullet, .hljs-link, .hljs-meta, .hljs-selector-id, .hljs-title { color: #61aeee; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: bold; }
.hljs-link { text-decoration: underline; }

/* 图片对齐与说明 */
#nice figure { margin: 10px 0; }
#nice figure.align-left { text-align: left; }
#nice figure.align-center { text-align: center; }
#nice figure.align-right { text-align: right; }
#nice figcaption { color: #888; text-align: center; }

/* 提示块（自定义 HTML） */
#nice .admonition { border-left: 4px solid var(--primary); background: var(--bg-soft); padding: 10px 12px; border-radius: 6px; margin: 12px 0; }
#nice .admonition.note { border-left-color: var(--primary); }
#nice .admonition.tip { border-left-color: #10b981; }
#nice .admonition.warning { border-left-color: #f59e0b; }
#nice .admonition.danger { border-left-color: #ef4444; }
`;
