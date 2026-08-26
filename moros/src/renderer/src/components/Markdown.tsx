import { isValidElement, memo, type ReactNode, useMemo } from "react";
import {
  defaultRehypePlugins,
  Streamdown,
  type Components,
} from "streamdown";
import { useI18n } from "../i18n";
import { CopyButton } from "./CopyButton";
import {
  resolveMarkdownRenderState,
  type MarkdownPresentation,
} from "./threadMarkdown";

interface Props {
  animate?: boolean;
  presentation?: MarkdownPresentation;
  text: string;
}

const MARKDOWN_ANIMATION = {
  animation: "fadeIn",
  duration: 150,
  easing: "ease-out",
  sep: "word",
  // Streamdown 2.5.0 otherwise staggers each new word by 40ms. A zero
  // stagger keeps the effect cosmetic instead of creating a reading queue.
  stagger: 0,
} as const;

const MARKDOWN_LINK_SAFETY = { enabled: false } as const;

// Omit rehype-raw so raw HTML keeps Moros's previous safe behavior: it is
// displayed as text, then the resulting tree is still sanitized and hardened.
const MARKDOWN_REHYPE_PLUGINS = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return "";
}

export const Markdown = memo(function Markdown({
  animate = false,
  presentation = "static",
  text,
}: Props): React.JSX.Element {
  const { language, t } = useI18n();
  const renderState = resolveMarkdownRenderState(presentation, animate);
  const copyCodeLabel = t("thread.copyCode");
  const components = useMemo<Components>(() => ({
    a: ({ node: _node, href, children, ...props }) => (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ),
    // Preserve the semantic DOM that Moros's existing .md rules target.
    p: "p",
    strong: "strong",
    table: "table",
    img: "img",
    code: ({ node: _node, children, ...props }) => <code {...props}>{children}</code>,
    pre: ({ node: _node, children, ...props }) => {
      let language = "";
      if (isValidElement<{ className?: string }>(children)) {
        const match = /(?:^|\s)language-([^\s]+)/.exec(children.props.className ?? "");
        if (match) language = match[1];
      }
      const code = plainText(children).replace(/\n$/, "");
      return (
        <div className="md-code-block">
          <div className="md-code-header">
            <span className="md-code-lang">{language || "code"}</span>
            <CopyButton
              className="md-copy-button-icon"
              label={copyCodeLabel}
              text={code}
            />
          </div>
          <pre {...props}>{children}</pre>
        </div>
      );
    },
  }), [copyCodeLabel]);

  return (
    <Streamdown
      animated={MARKDOWN_ANIMATION}
      className="md"
      components={components}
      controls={false}
      isAnimating={renderState.isAnimating}
      key={language}
      lineNumbers={false}
      linkSafety={MARKDOWN_LINK_SAFETY}
      mode={renderState.mode}
      parseIncompleteMarkdown={renderState.mode === "streaming"}
      rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
    >
      {text}
    </Streamdown>
  );
});
