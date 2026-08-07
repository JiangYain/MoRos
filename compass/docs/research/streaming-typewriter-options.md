# Compass 流式打字机动效方案调研

> 调研日期：2026-08-06
>
> 范围：只比较 GitHub 第一方仓库、README、源码、测试、许可证与 npm 包元数据；本轮不改产品代码。

## 结论先行

如果下一轮仍要保留“文字被逐步揭示”的打字机语义，首选 **`onshinpei/react-markdown-typer`**：它直接接收持续追加的文本，积压越多打得越快，并提供完成时立即冲刷、停止、恢复、重置和清空 API。Compass 应把动画只当作 canonical thread text 的派生视图，并在 `assistant-end`、取消、切换会话和 reduced-motion 时立即显示完整 canonical text，绝不能让动画队列决定 Agent 是否完成。

如果设计上可以接受“文字立刻出现、仅给新词做 150–250ms 入场淡化”，则 **Streamdown 的动画模型**从机制上不会形成 backlog，也就不会出现“后端已完成但桌面仍打字数秒”的问题；但为了这一项动效整体替换 Compass 已定制的 Markdown renderer，迁移面偏大。

## Compass 的硬约束

- [`store.ts`](../../src/renderer/src/store.ts) 保存 Agent 事件形成的 canonical streaming blocks；[`Thread.tsx`](../../src/renderer/src/components/Thread.tsx) 和 [`Markdown.tsx`](../../src/renderer/src/components/Markdown.tsx) 负责展示。下一轮不能把延迟后的展示文本写回 canonical store。
- 新增 delta 时可以平滑追赶，但收到 `assistant-end` 后，显示层必须立即冲刷，或至多在一个明确且很短的上限内追平；不能按固定字符速率继续排空几秒。
- 切换会话、取消生成、文本发生非前缀变化时必须重置动画；历史消息不得重新播放。
- `prefers-reduced-motion: reduce` 下必须跳过逐字揭示，直接显示完整文本。
- 需要继续兼容 Compass 的 GFM、代码块语言/复制按钮、自定义链接、滚动锁定、复制回复和 React 19。

## 按 Compass 适配度排序

| 排名 | 方案 | 真流式追加 | backlog 追赶 | 完成/取消/重置 | reduced-motion | 依赖与许可 | 维护快照 | Compass 判断 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [`react-markdown-typer`](https://github.com/onshinpei/react-markdown-typer) | 是；既支持 growing `children`，也支持 `MarkdownTyperCMD.push(delta)` | **是**；`interval: { min, max, curve }` 会按剩余字符数动态缩短间隔 | `triggerWholeEnd`、`setContent`、`stop`、`resume`、`restart`、`clear` | 不自动检测；`disableTyping` 可立即全量显示，需由 Compass media query 驱动 | MIT；npm 解包约 101 KB；仅 1 个直接依赖 `react-markdown`，Compass 已使用同版本主线 | 2026-05-08 有提交/发布 | **首选。** 接口和现有 React Markdown 定制最接近，完成态可显式 flush |
| 2 | [`assistant-ui` `useSmooth`](https://github.com/assistant-ui/assistant-ui/blob/bd470ffec15b2b9743df401ddf862fdcd69dcf07/packages/react/src/utils/smooth/useSmooth.ts) | 是；目标文本持续增长，展示文本保持其前缀 | **是**；默认以 `drainMs=250` 排空积压，并有最慢字符间隔、每帧上限和 commit 节流 | 卸载会 cancel rAF；part 变化或非前缀文本会重置 | **自动禁用**并立即显示全文 | MIT；但完整 `@assistant-ui/react` npm 解包约 2.4 MB、19 个直接依赖，hook 又绑定 assistant-ui store/context | 2026-08-06 仍有提交 | **最佳算法参考，不建议只为一个 hook 引入整套框架。** 下一轮可评估按 MIT 要求保留归属后实现 Compass-native 薄 hook |
| 3 | [`vercel/streamdown`](https://github.com/vercel/streamdown) `animated` | 是；直接消费累计 Markdown | **不需要/不支持隐藏文本队列**；新挂载的词/字只做 CSS 入场，真实文本没有延迟 | `isAnimating=false` 停止给后续内容加动画；没有打字队列需要 flush | 未内置自动检测，需由调用方关闭动画或 CSS 覆盖 | Apache-2.0；主包自身 npm 解包约 96 KB，但有 16 个直接依赖并替换整个 Markdown renderer | 2026-07-13 有提交 | **低延迟视觉方案。** 不会拖尾，但迁移 Compass 现有 Markdown/代码块 UI 的成本高 |
| 4 | [`Ephibbs/flowtoken`](https://github.com/Ephibbs/flowtoken) | 是；默认 `sep="diff"` 只把新增后缀做成新 span | 无真正排队/自适应；每个到达 chunk 仅播放固定 CSS animation | 无完善的 stop/flush/reset 控制面；文本缩短时内部重置 | 未实现 | npm 解包约 95 KB、5 个直接依赖；**README 称 MIT，但 package.json/npm 标 ISC，且仓库无 LICENSE 文件** | 最后提交/发布为 2025-05-07 | **不建议。** 许可元数据冲突、维护较弱、控制面不足 |
| 5 | [`ibelick/prompt-kit` Response Stream](https://github.com/ibelick/prompt-kit/blob/de80375967400aa0c6ebab9d3ba4f9258ab79fcc/components/prompt-kit/response-stream.tsx) | API 接收 string/AsyncIterable，但 AsyncIterable 分支会原样立即追加 chunk | string 模式是固定速率；真实 AsyncIterable 没有平滑追赶 | 有 reset/start/pause/resume，卸载 abort | 未实现 | MIT；采用复制组件模式 | 2026-03-12 有提交 | **明确排除。** 官方文档自己标为 experimental，并写明不推荐用于 LLM output |

以上大小来自 2026-08-06 的 npm registry `dist.unpackedSize`，只表示包自身解包体积，不等同于 Vite 最终 bundle；最终选择前仍需在 Compass 做真实前后 bundle 对比。

## 1. `react-markdown-typer`：首选直接集成候选

仓库的 [`IntervalType`](https://github.com/onshinpei/react-markdown-typer/blob/d57096ddce4c165e58c4089f43088181342bb354/src/defined.ts) 支持固定数字或 `{ min, max, curve/curveFn }`。其 [`useTypingTask`](https://github.com/onshinpei/react-markdown-typer/blob/d57096ddce4c165e58c4089f43088181342bb354/src/hooks/useTypingTask.ts) 会在流中新字符增加时更新参考 backlog；剩余字符越多，当前 interval 越接近 `min`，并可在一次 rAF 中消费多个字符。这正面解决固定速率队列越积越长的问题。

它还暴露 `push`、`setContent`、`triggerWholeEnd`、`stop`、`resume`、`restart` 和 `clear`。其中 `triggerWholeEnd` 是 Compass 最关键的完成态保险丝：收到真实 `assistant-end` 后应立即展示剩余全文，而不是等待动画自然排空。`disableTyping` 会一次性消费剩余字符，可用于 reduced-motion。

优点：

- React 18/19 peer range，MIT；[`package.json`](https://github.com/onshinpei/react-markdown-typer/blob/d57096ddce4c165e58c4089f43088181342bb354/package.json) 只有 `react-markdown` 一个 runtime dependency。
- `MarkdownTyperCMD` 接受 `reactMarkdownProps`，有机会复用 Compass 当前 GFM 和自定义 component map。
- 使用 grapheme 分割而不是简单 UTF-16 code unit，更适合中文和 emoji。
- 有 imperative 生命周期 API，可以明确绑定 Pi 的 start/delta/end/cancel，而不是猜测字符串是否“看起来完成”。

风险：

- 默认逐字符更新仍会频繁触发 Markdown 解析；仓库提供 `experimentalIncrementalRender`，但名称已经说明需要单独压测，不能未经验证直接打开。
- 必须由 Compass 负责 session/part identity；历史消息 mount 时应 `setContent` 或禁用 typing，避免重播。
- `disableTyping` 不是自动 media-query 行为，需要 Compass 自己接 `matchMedia`。

建议下一轮先做一个隔离 prototype：只替换当前活动 assistant 的正文渲染，使用 delta `push`，在 `assistant-end` 调 `triggerWholeEnd`，历史文本直接渲染；测 5k/20k 字 Markdown、代码块、CJK、会话切换和滚动锁定。

## 2. assistant-ui `useSmooth`：最佳自适应算法参考

[`TextStreamAnimator`](https://github.com/assistant-ui/assistant-ui/blob/bd470ffec15b2b9743df401ddf862fdcd69dcf07/packages/react/src/utils/smooth/useSmooth.ts) 每帧根据 `remainingChars` 计算 `min(maxCharIntervalMs, drainMs / remainingChars)`，因此积压越大，每帧消费越多，目标是约 `drainMs` 内追平；`minCommitMs` 还能降低 Markdown 重解析/React commit 次数。其[单元测试](https://github.com/assistant-ui/assistant-ui/blob/bd470ffec15b2b9743df401ddf862fdcd69dcf07/packages/react/src/utils/smooth/useSmooth.test.tsx)覆盖 reduced-motion、非连续文本重置、commit 限流和最终不丢字符。

这是五项里完成度最高的 backlog 算法，但公开 hook 读取 assistant-ui 的 part/store context；[`@assistant-ui/react` package.json](https://github.com/assistant-ui/assistant-ui/blob/bd470ffec15b2b9743df401ddf862fdcd69dcf07/packages/react/package.json) 显示引入完整包会连带一整套聊天框架。Compass 已有 Pi/store/Thread 领域模型，因此更合理的候选是参考其算法和测试矩阵，做一个只接收 `{targetText, active, flushKey}` 的薄模块，并按 MIT 保存许可证声明。

## 3. Streamdown：无 backlog 的“新词入场”路线

Streamdown 的 [`createAnimatePlugin`](https://github.com/vercel/streamdown/blob/e5deed330aa4231751a106445d93d62e4716a22f/packages/streamdown/lib/animate.ts) 把当前 HAST 文本按 word/char 包成 span，并记录上次字符数，旧内容用 `duration: 0ms`，仅新内容播放 fade/blur/slide。官方[动画文档](https://github.com/vercel/streamdown/blob/e5deed330aa4231751a106445d93d62e4716a22f/apps/website/content/docs/animation.mdx)明确说明完成后移除动画插件和额外 span。

它的核心优势是不会隐藏已收到的字符：即使一次到达很大的 chunk，文本也已经在 DOM 中，只是短暂淡入。因此 Agent 完成和视觉完成不会相差数秒。但它不是真正的逐字排队，而且 [`streamdown` package.json](https://github.com/vercel/streamdown/blob/e5deed330aa4231751a106445d93d62e4716a22f/packages/streamdown/package.json) 带来新的 marked/unified/rehype/mermaid 等依赖，并会替换 Compass 已细调的 `Markdown.tsx`。此外其 CSS 没有内置 `prefers-reduced-motion` 分支，调用方必须补齐。

## 4–5. 不建议进入 prototype 的方案

FlowToken 的 [`SplitText`](https://github.com/Ephibbs/flowtoken/blob/a966002ca6fbbe1c78f4605a3849d14edd90260b/src/components/SplitText.tsx) 能识别累计字符串的新后缀，思路比传统“每次重播全文”正确；但它只对新增片段施加固定 CSS animation，没有 backlog drain、完成 flush、取消和 reduced-motion 控制。更关键的是其 [`README`](https://github.com/Ephibbs/flowtoken/blob/a966002ca6fbbe1c78f4605a3849d14edd90260b/README.md) 与 [`package.json`](https://github.com/Ephibbs/flowtoken/blob/a966002ca6fbbe1c78f4605a3849d14edd90260b/package.json) 对许可证表述不一致，仓库也没有独立 LICENSE，不能在未澄清前采用。

Prompt Kit 的[官方 Response Stream 文档](https://github.com/ibelick/prompt-kit/blob/de80375967400aa0c6ebab9d3ba4f9258ab79fcc/app/docs/response-stream/page.mdx)直接写明该组件用于模拟/受控 progressive text，且“不推荐用于 LLM output”。源码的 AsyncIterable 路径也不应用 `speed`，所以不能解决 Compass 当前所关心的固定速率拖尾。

## 下一轮建议的验收指标

无论选方案 1 还是方案 2 的算法，都应先锁定以下行为测试，再做视觉调整：

1. 以不均匀 burst 追加文本，backlog 增大时可观测到消费速率提高，而不是固定 chars/s。
2. 收到 `assistant-end` 后一个 animation frame 内显示完整 canonical text；允许采用 assistant-ui 路线时，也应把最大视觉尾差明确限制在不超过 250ms。
3. stop/cancel、会话切换、非前缀修正、组件卸载都会取消旧 rAF，且不会把旧会话字符写进新会话。
4. reduced-motion、历史消息、刷新后恢复的完成消息直接完整渲染，不播放动画。
5. 复制回复始终复制 canonical 完整文本，不复制动画中的截断前缀。
6. 长回复的 Markdown 解析/React commit 有节流；记录 5k 和 20k 字下的帧时间、commit 数和 renderer bundle 增量。
7. 保留现有代码块、Thinking/Exploring、工具状态、滚动锁定和“当前只显示一个活动 Orb”的生命周期行为。

## 直接仓库链接

1. https://github.com/onshinpei/react-markdown-typer
2. https://github.com/assistant-ui/assistant-ui
3. https://github.com/vercel/streamdown
4. https://github.com/Ephibbs/flowtoken
5. https://github.com/ibelick/prompt-kit
