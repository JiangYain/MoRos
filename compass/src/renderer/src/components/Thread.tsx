import type { UiApprovalRequest, UiThreadItem } from "@shared/types";
import { ArrowDown, Box, ChevronRight, File, FilePenLine, FilePlus2, Search, SquareTerminal, Terminal } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCompass } from "../store";
import { useI18n } from "../i18n";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import {
  groupToolActivities,
  placeAssistantIdentities,
  shouldShowToolActivityOutput,
  stripRedundantCompletionOpener,
  summarizeToolActivity,
  TOOL_ACTIVITY_COPY,
  type ToolActivity,
  type ToolActivityGroupItem,
  type ToolExplorationGroupItem,
} from "./threadCommands";
import { shouldStickToLatest } from "./thread-scroll";

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
  const { t } = useI18n();
  const [manual, setManual] = useState<boolean | null>(null);
  const [autoOpen, setAutoOpen] = useState(live);
  useEffect(() => {
    if (live) setAutoOpen(true);
  }, [live]);
  const open = manual ?? autoOpen;
  return (
    <div className={`thinking-block-capsule${open ? " open" : ""}${live ? " live" : ""}`}>
      <button
        type="button"
        className="thinking-toggle-button"
        aria-expanded={open}
        onClick={() => setManual(!open)}
      >
        <ChevronRight
          className={`thinking-chevron${open ? " open" : ""}`}
          size={13}
          strokeWidth={2}
          aria-hidden
        />
        <span className="thinking-title-cn">{t("thread.thinking")}</span>
        {live && <span className="thinking-live-dot" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="thinking-content-wrapper"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="thinking-content-text">{text}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------- skill block */

function SkillBlock({ text }: { text: string }): React.JSX.Element {
  const { t } = useI18n();
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
        <span className="skill-meta">{t("thread.lines", { count: skill.lineCount })}</span>
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
              {skill.body ? <Markdown text={skill.body} /> : <span className="skill-empty">{t("common.loading")}</span>}
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
    <motion.div className="msg-user" data-thread-prompt-id={item.id} {...entrance}>
      {item.images && item.images.length > 0 && (
        <div className="msg-user-images">
          {item.images.map((image, index) => (
            <img
              key={`${image.mimeType}-${index}`}
              src={`data:${image.mimeType};base64,${image.data}`}
              alt={image.name ?? `Attachment ${index + 1}`}
            />
          ))}
        </div>
      )}
      {item.skillName ? (
        <div className="text msg-user-bubble has-skill">
          <div className="msg-user-skill-chip">
            <Box size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{item.skillName}</span>
          </div>
          {item.text.trim() && <div className="msg-user-skill-arguments">{item.text}</div>}
        </div>
      ) : item.text.trim() ? (
        <div className="text msg-user-bubble">{item.text}</div>
      ) : null}
    </motion.div>
  );
}

function AssistantMessage({
  item,
}: {
  item: Extract<UiThreadItem, { kind: "assistant" }>;
}): React.JSX.Element {
  const { t } = useI18n();
  // Fast Refresh can briefly retain a pre-migration assistant item while the
  // store module is being replaced. Keep the thread renderable during that
  // hand-off instead of crashing the entire workspace on a missing `blocks`.
  const blocks = Array.isArray(item.blocks) ? item.blocks : [];
  const displayBlocks = blocks
    .map((block) => block.type === "text" && !item.streaming
      ? { ...block, text: stripRedundantCompletionOpener(block.text) }
      : block)
    .filter((block) => block.type !== "text" || block.text.trim());
  const lastBlock = displayBlocks[displayBlocks.length - 1];
  const aborted = item.stopReason === "aborted";
  const copyText = displayBlocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
  return (
    <motion.div className="msg-assistant" {...entrance}>
      {displayBlocks.map((block, index) =>
        block.type === "thinking" ? (
          <ThinkingBlock
            key={index}
            text={block.text}
            live={item.streaming && index === blocks.length - 1}
          />
        ) : (
          <SkillBlock key={index} text={block.text} />
        ),
      )}
      {item.streaming && (!lastBlock || lastBlock.type === "text") && (
        <div aria-hidden style={{ marginTop: displayBlocks.length ? -14 : 0 }}>
          <span className="stream-caret" />
        </div>
      )}
      {item.errorMessage && !aborted && <div className="msg-error">{item.errorMessage}</div>}
      {aborted && <div className="notice-row warn">{t("thread.aborted")}</div>}
      {!item.streaming && copyText && (
        <CopyButton className="assistant-copy-button" label={t("thread.copyReply")} text={copyText} />
      )}
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
  return <StandardToolCard item={item} />;
}

function StandardToolCard({ item }: { item: Extract<UiThreadItem, { kind: "tool" }> }): React.JSX.Element {
  const { t } = useI18n();
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? item.running;
  const label = TOOL_LABELS[item.name] ?? item.name;
  const summary = summarizeArgs(item.args);
  const argsJson =
    item.args && typeof item.args === "object" ? JSON.stringify(item.args, null, 2) : undefined;

  return (
    <motion.div
      className={`tool-card${item.isError ? " error" : ""}`}
      data-tool-call-id={item.callId}
      data-tool-name={item.name}
      {...entrance}
    >
      <button type="button" className="tool-head" aria-expanded={open} onClick={() => setManual(!open)}>
        <span
          className={`tool-dot${item.running ? " running" : ""}${item.isError ? " failed" : ""}`}
        />
        <span className="tool-name">{label}</span>
        <span className="tool-summary">{summary}</span>
        <span className={`tool-status${item.isError ? " error" : ""}`}>
          {item.running ? t("thread.running") : item.isError ? t("thread.failed") : t("thread.complete")}
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
                <div className="tool-output-shell">
                  {item.output && <CopyButton className="tool-copy-button" label={t("thread.copyToolOutput")} text={item.output} />}
                  <div className={`tool-output${item.isError ? " error" : ""}`}>
                    {item.output || t("thread.waitingOutput")}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ToolActivityIcon({ activity, size = 13 }: { activity: ToolActivity; size?: number }): React.JSX.Element {
  const props = { "aria-hidden": true, size, strokeWidth: 1.55 } as const;
  switch (activity) {
    case "command":
      return <Terminal {...props} />;
    case "read":
      return <File {...props} />;
    case "write":
      return <FilePlus2 {...props} />;
    case "edit":
      return <FilePenLine {...props} />;
    case "search":
      return <Search {...props} />;
  }
}

function ToolActivityEntry({
  activity,
  item,
}: {
  activity: ToolActivity;
  item: ToolActivityGroupItem["items"][number];
}): React.JSX.Element {
  const { t } = useI18n();
  const copy = TOOL_ACTIVITY_COPY[activity];
  const summary = summarizeToolActivity(item);
  const state = item.running ? copy.itemActive : item.isError ? "Failed" : copy.itemComplete;
  const showOutput = shouldShowToolActivityOutput(activity, item);

  return (
    <li
      className={`tool-activity-entry${item.running ? " running" : ""}${item.isError ? " error" : ""}`}
      data-tool-activity-item={activity}
      data-tool-call-id={item.callId}
      data-tool-name={item.name}
      title={summary}
    >
      <div className="tool-activity-row">
        <ToolActivityIcon activity={activity} />
        <span className="tool-activity-state">{state}</span>
        <span className="tool-activity-summary">{summary}</span>
        {item.running && <span className="tool-activity-running-dot" aria-hidden />}
      </div>
      {showOutput && (
        <div className="tool-activity-output-shell">
          <CopyButton className="tool-copy-button" label={t("thread.copyToolOutput")} text={item.output} />
          <pre className={`tool-activity-output${item.isError ? " error" : ""}`}>{item.output}</pre>
        </div>
      )}
    </li>
  );
}

type UserThreadItem = Extract<UiThreadItem, { kind: "user" }>;

interface PromptRailEntry {
  prompt: UserThreadItem;
  response: string;
}

function buildPromptRailEntries(items: UiThreadItem[]): PromptRailEntry[] {
  const entries: PromptRailEntry[] = [];
  let current: PromptRailEntry | undefined;

  for (const item of items) {
    if (item.kind === "user") {
      current = { prompt: item, response: "" };
      entries.push(current);
      continue;
    }

    if (item.kind !== "assistant" || !current) continue;
    const reply = item.blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n\n");
    if (!reply) continue;
    current.response = [current.response, reply].filter(Boolean).join("\n\n");
  }

  return entries;
}

function ThreadPromptRail({
  entries,
  scrollRoot,
}: {
  entries: PromptRailEntry[];
  scrollRoot: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element | null {
  const [activePromptId, setActivePromptId] = useState(entries.at(-1)?.prompt.id);

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root || entries.length === 0) return;

    let frame = 0;
    const updateActivePrompt = (): void => {
      frame = 0;
      const focusY = root.getBoundingClientRect().top + root.clientHeight * 0.28;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-thread-prompt-id]"));
      let closestId = nodes[0]?.dataset.threadPromptId;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const node of nodes) {
        const distance = Math.abs(node.getBoundingClientRect().top - focusY);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = node.dataset.threadPromptId;
        }
      }

      if (closestId) setActivePromptId((current) => current === closestId ? current : closestId);
    };
    const scheduleUpdate = (): void => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActivePrompt);
    };

    updateActivePrompt();
    root.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      root.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [entries, scrollRoot]);

  if (entries.length === 0) return null;

  const jumpToPrompt = (promptId: string): void => {
    const root = scrollRoot.current;
    const target = Array.from(root?.querySelectorAll<HTMLElement>("[data-thread-prompt-id]") ?? [])
      .find((node) => node.dataset.threadPromptId === promptId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <nav className="thread-prompt-rail" aria-label="Conversation prompts">
      {entries.map(({ prompt, response }, index) => {
        const summary = prompt.text.trim() || prompt.skillName || "Image prompt";
        const edgeClass = index === 0
          ? " first"
          : index === entries.length - 1
            ? " last"
            : "";

        return (
          <button
            key={prompt.id}
            type="button"
            className={`thread-prompt-marker${activePromptId === prompt.id ? " active" : ""}${edgeClass}`}
            aria-label={`Prompt ${index + 1}: ${summary}`}
            onClick={() => jumpToPrompt(prompt.id)}
          >
            <span className="thread-prompt-marker-dash" aria-hidden />
            <span className="thread-prompt-preview" role="tooltip">
              <span className="thread-prompt-preview-prompt">{summary}</span>
              <span className="thread-prompt-preview-response">{response || "…"}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function AssistantIdentity(): React.JSX.Element {
  return (
    <motion.div className="assistant-identity" {...entrance}>
      <span className="dot" />
      <span className="micro-label" style={{ color: "var(--color-text-secondary)" }}>
        Compass
      </span>
    </motion.div>
  );
}

function ToolActivityGroup({ group }: { group: ToolActivityGroupItem }): React.JSX.Element {
  const running = group.items.some((item) => item.running);
  const [open, setOpen] = useState(true);
  const copy = TOOL_ACTIVITY_COPY[group.activity];

  return (
    <section
      className={`tool-activity-group${running ? " running" : ""}`}
      data-tool-activity={group.activity}
      data-tool-call-ids={group.items.map((item) => item.callId).join(" ")}
    >
      <button
        type="button"
        className="tool-activity-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ToolActivityIcon activity={group.activity} />
        <span>{running ? copy.active : copy.complete}</span>
        <ChevronRight
          aria-hidden
          className={`tool-activity-chevron${open ? " open" : ""}`}
          size={14}
          strokeWidth={1.65}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="tool-activity-list-clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <ul className="tool-activity-list">
              {group.items.map((item) => (
                <ToolActivityEntry key={item.id} activity={group.activity} item={item} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ToolExplorationGroup({ exploration }: { exploration: ToolExplorationGroupItem }): React.JSX.Element {
  const running = exploration.groups.some((group) => group.items.some((item) => item.running));
  const [open, setOpen] = useState(true);

  return (
    <section
      className={`tool-exploration${running ? " running" : ""}`}
      data-tool-exploration="true"
      data-tool-call-ids={exploration.groups.flatMap((group) => group.items.map((item) => item.callId)).join(" ")}
    >
      <button
        type="button"
        className="tool-exploration-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="tool-exploration-label">Exploring</span>
        <ChevronRight
          aria-hidden
          className={`tool-exploration-chevron${open ? " open" : ""}`}
          size={14}
          strokeWidth={1.65}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="tool-exploration-body-clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="tool-exploration-body">
              {exploration.groups.map((group) => (
                <ToolActivityGroup key={group.id} group={group} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ApprovalRequest({ request }: { request: UiApprovalRequest }): React.JSX.Element {
  const { t } = useI18n();
  const resolveApproval = useCompass((state) => state.resolveApproval);
  const [responding, setResponding] = useState<"allow" | "deny" | null>(null);
  const summary = summarizeArgs(request.args) || request.detail.split(/\r?\n/).slice(1).join(" ");

  const respond = (allowed: boolean): void => {
    if (responding) return;
    setResponding(allowed ? "allow" : "deny");
    void resolveApproval(request.id, allowed).finally(() => setResponding(null));
  };

  return (
    <motion.section className="approval-request" aria-label={t("thread.commandApproval")} {...entrance}>
      <div className="approval-request-main">
        <SquareTerminal size={15} strokeWidth={1.65} aria-hidden />
        <div className="approval-request-copy">
          <strong>{request.message}</strong>
          <code title={summary}>{summary || request.toolName}</code>
        </div>
      </div>
      <div className="approval-request-actions">
        <button
          type="button"
          className="approval-deny"
          disabled={responding !== null}
          onClick={() => respond(false)}
        >
          {responding === "deny" ? t("thread.denying") : t("thread.deny")}
        </button>
        <button
          type="button"
          className="approval-allow"
          disabled={responding !== null}
          onClick={() => respond(true)}
        >
          {responding === "allow" ? t("thread.allowing") : t("thread.allowOnce")}
        </button>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------- thread */

export function Thread(): React.JSX.Element {
  const { t } = useI18n();
  const thread = useCompass((s) => s.thread) ?? [];
  const approvals = useCompass((s) => s.approvals) ?? [];
  const sessionId = useCompass((s) => s.stats?.sessionId);
  const renderItems = useMemo(() => placeAssistantIdentities(groupToolActivities(thread)), [thread]);
  const promptEntries = useMemo(() => buildPromptRailEntries(thread), [thread]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    stickRef.current = true;
    setShowJumpToLatest(false);
  }, [sessionId]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && stickRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [approvals, thread]);

  const onScroll = (): void => {
    const node = scrollRef.current;
    if (!node) return;
    const stickToLatest = shouldStickToLatest(node);
    stickRef.current = stickToLatest;
    setShowJumpToLatest(!stickToLatest);
  };

  const jumpToLatest = (): void => {
    const node = scrollRef.current;
    if (!node) return;
    stickRef.current = true;
    setShowJumpToLatest(false);
    node.scrollTop = node.scrollHeight;
  };

  return (
    <div className={`thread-shell${showJumpToLatest ? " reading-history" : ""}`}>
      <ThreadPromptRail entries={promptEntries} scrollRoot={scrollRef} />
      <div className="thread-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="thread-inner" style={reduced ? { scrollBehavior: "auto" } : undefined}>
          {renderItems.map((item) => {
            switch (item.kind) {
              case "user":
                return <UserMessage key={item.id} item={item} />;
              case "assistant":
                return <AssistantMessage key={item.id} item={item} />;
              case "assistant-identity":
                return <AssistantIdentity key={item.id} />;
              case "tool":
                return <ToolCard key={item.id} item={item} />;
              case "tool-exploration-group":
                return <ToolExplorationGroup key={item.id} exploration={item} />;
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
          {approvals.map((request) => <ApprovalRequest key={request.id} request={request} />)}
        </div>
      </div>
      <AnimatePresence>
        {showJumpToLatest && (
          <motion.button
            type="button"
            className="thread-jump-latest"
            aria-label={t("thread.jumpLatest")}
            title={t("thread.jumpLatest")}
            initial={reduced ? false : { opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.94 }}
            transition={{ duration: reduced ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={jumpToLatest}
          >
            <ArrowDown size={14} strokeWidth={1.7} aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
