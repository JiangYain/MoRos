import type { UiThreadItem } from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useCompass } from "../store";
import { Markdown } from "./Markdown";

/* ------------------------------------------------------------- helpers */

function summarizeArgs(args: unknown): string {
  if (args == null) return "";
  if (typeof args === "string") return args;
  if (typeof args === "object") {
    const record = args as Record<string, unknown>;
    for (const key of ["cmd", "command", "path", "file_path", "filePath", "pattern", "query"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    try {
      return JSON.stringify(record);
    } catch {
      return "";
    }
  }
  return String(args);
}

const entrance = {
  initial: { opacity: 0, y: 14, filter: "blur(5px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

interface ParsedSkillBlock {
  name: string;
  body: string;
  preview: string;
  lineCount: number;
}

function parseSkillBlock(text: string): ParsedSkillBlock | undefined {
  const match = text.match(/^\s*<skill\b([^>]*)>([\s\S]*?)(?:<\/skill>\s*)?$/i);
  if (!match) return undefined;

  const attrs = match[1] ?? "";
  const nameMatch = attrs.match(/\bname=(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  const name = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3] ?? "skill";
  const body = (match[2] ?? "").trim();
  const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const preview = lines.find((line) => !line.trim().startsWith("```"))?.trim() ?? "";

  return {
    name,
    body,
    preview,
    lineCount: lines.length,
  };
}

/* ------------------------------------------------------------- thinking */

function ThinkingBlock({
  text,
  live,
}: {
  text: string;
  live: boolean;
}): React.JSX.Element {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setManual(!open)}>
        <span className={`chev${open ? " open" : ""}`}>▶</span>
        思考过程 <span style={{ fontStyle: "normal", letterSpacing: "0.1em" }}>Reasoning</span>
        {live && <span className="stream-caret" style={{ height: "0.8em" }} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="thinking-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="thinking-content-inner">{text}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------- skill block */

function SkillBlock({ text }: { text: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const skill = parseSkillBlock(text);

  if (!skill) {
    return (
      <div className="assistant-body">
        <Markdown text={text} />
      </div>
    );
  }

  return (
    <div className="skill-block">
      <button className="skill-head" onClick={() => setOpen((value) => !value)}>
        <span className="skill-dot" />
        <span className="skill-kind">Skill</span>
        <span className="skill-name">{skill.name}</span>
        <span className="skill-preview">{skill.preview}</span>
        <span className="skill-meta">{skill.lineCount} lines</span>
        <span className={`skill-chev${open ? " open" : ""}`}>{">"}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="skill-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="skill-body-inner">
              {skill.body ? <Markdown text={skill.body} /> : <span className="skill-empty">Loading...</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------- messages */

function UserMessage({ item }: { item: Extract<UiThreadItem, { kind: "user" }> }): React.JSX.Element {
  return (
    <motion.div className="msg-user" {...entrance}>
      <div className="who micro-label">Operator / 验配师</div>
      <div className="text">{item.text}</div>
    </motion.div>
  );
}

function AssistantMessage({
  item,
}: {
  item: Extract<UiThreadItem, { kind: "assistant" }>;
}): React.JSX.Element {
  const lastBlock = item.blocks[item.blocks.length - 1];
  const aborted = item.stopReason === "aborted";
  return (
    <motion.div className="msg-assistant" {...entrance}>
      <div className="who">
        <span className="dot" />
        <span className="micro-label" style={{ color: "var(--color-text-secondary)" }}>
          Compass
        </span>
      </div>
      {item.blocks.map((block, index) =>
        block.type === "thinking" ? (
          <ThinkingBlock
            key={index}
            text={block.text}
            live={item.streaming && index === item.blocks.length - 1}
          />
        ) : (
          <SkillBlock key={index} text={block.text} />
        ),
      )}
      {item.streaming && (!lastBlock || lastBlock.type === "text") && (
        <div aria-hidden style={{ marginTop: item.blocks.length ? -14 : 0 }}>
          <span className="stream-caret" />
        </div>
      )}
      {item.errorMessage && !aborted && <div className="msg-error">{item.errorMessage}</div>}
      {aborted && <div className="notice-row warn">已中止 · Aborted</div>}
    </motion.div>
  );
}

/* ------------------------------------------------------------- tool card */

const TOOL_LABELS: Record<string, string> = {
  bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  grep: "Grep",
  find: "Find",
  ls: "List",
};

function ToolCard({ item }: { item: Extract<UiThreadItem, { kind: "tool" }> }): React.JSX.Element {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? item.running;
  const label = TOOL_LABELS[item.name] ?? item.name;
  const summary = summarizeArgs(item.args);
  const argsJson =
    item.args && typeof item.args === "object" ? JSON.stringify(item.args, null, 2) : undefined;

  return (
    <motion.div className={`tool-card${item.isError ? " error" : ""}`} {...entrance}>
      <button className="tool-head" onClick={() => setManual(!open)}>
        <span
          className={`tool-dot${item.running ? " running" : ""}${item.isError ? " failed" : ""}`}
        />
        <span className="tool-name">{label}</span>
        <span className="tool-summary">{summary}</span>
        <span className={`tool-status${item.isError ? " error" : ""}`}>
          {item.running ? "执行中" : item.isError ? "失败" : "完成"}
        </span>
        <span className={`tool-chev${open ? " open" : ""}`}>▶</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="tool-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tool-body-inner">
              {argsJson && summary !== argsJson && <div className="tool-args">{argsJson}</div>}
              {(item.output || item.running) && (
                <div className={`tool-output${item.isError ? " error" : ""}`}>
                  {item.output || "等待输出…"}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------- thread */

export function Thread(): React.JSX.Element {
  const thread = useCompass((s) => s.thread);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = scrollRef.current;
    if (node && stickRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [thread]);

  const onScroll = (): void => {
    const node = scrollRef.current;
    if (!node) return;
    stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
  };

  return (
    <div className="thread-scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="thread-inner" style={reduced ? { scrollBehavior: "auto" } : undefined}>
        {thread.map((item) => {
          switch (item.kind) {
            case "user":
              return <UserMessage key={item.id} item={item} />;
            case "assistant":
              return <AssistantMessage key={item.id} item={item} />;
            case "tool":
              return <ToolCard key={item.id} item={item} />;
            case "notice":
              return (
                <div key={item.id} className={`notice-row${item.tone === "warn" ? " warn" : ""}`}>
                  {item.text}
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
