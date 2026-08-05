import { isValidElement, memo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../i18n";
import { CopyButton } from "./CopyButton";

interface Props {
  text: string;
}

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return "";
}

export const Markdown = memo(function Markdown({ text }: Props): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => {
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
                    label={t("thread.copyCode")}
                    text={code}
                  />
                </div>
                <pre>{children}</pre>
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
