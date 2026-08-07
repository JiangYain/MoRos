import type { DependencyInstallProgress, UiApprovalRequest, UiThreadItem } from "@shared/types";
import {
  ArrowDown,
  Box,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FilePenLine,
  FilePlus2,
  RotateCw,
  Search,
  Terminal,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCompass } from "../store";
import { type TranslationKey, useI18n } from "../i18n";
import { usePrefersReducedMotion } from "../use-prefers-reduced-motion";
import phonakTargetAppIcon from "../assets/phonak-target-app.png";
import {
  dependencyPromptKey,
  sessionDependencyInstall,
  sessionNeedsPhonakTarget,
} from "../dependency-recommendation";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import {
  buildSummaryText,
  groupToolActivities,
  placeAssistantIdentities,
  shouldShowToolActivityOutput,
  stripRedundantCompletionOpener,
  summarizeExecutionTurns,
  summarizeToolActivity,
  TOOL_ACTIVITY_COPY,
  type ExecutionSummaryItem,
  type ToolActivity,
  type ToolActivityGroupItem,
  type ToolExplorationGroupItem,
} from "./threadCommands";
import { shouldStickToLatest } from "./thread-scroll";
import { AgentActivityOrb } from "./AgentActivityOrb";
import {
  resolveActiveApprovalExplanationId,
  resolveThreadActivity,
  type ThreadActivity,
} from "./threadActivity";
import {
  parseSkillBlock,
  resolveActiveMarkdownTarget,
  type ActiveMarkdownTarget,
  type MarkdownPresentation,
} from "./threadMarkdown";

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

const dependencyEntrance = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
};

/* ------------------------------------------------------------- thinking */

function ThinkingBlock({
  text,
  live,
  orbState,
}: {
  text: string;
  live: boolean;
  orbState?: "solving";
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
        {orbState && <AgentActivityOrb state={orbState} decorative className="thinking-activity-orb" />}
        <span className="thinking-title-cn">{t("thread.thinking")}</span>
        <ChevronRight
          className={`thinking-chevron${open ? " open" : ""}`}
          size={14}
          strokeWidth={1.65}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="thinking-content-wrapper"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="thinking-content-text">
              <Markdown text={text} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------- skill block */

function SkillBlock({
  animate = false,
  text,
  presentation = "static",
}: {
  animate?: boolean;
  text: string;
  presentation?: MarkdownPresentation;
}): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const skill = parseSkillBlock(text);

  if (!skill) {
    return (
      <div className="assistant-body">
        <Markdown
          animate={animate}
          presentation={presentation}
          text={text}
        />
      </div>
    );
  }

  return (
    <div className="skill-block">
      <button type="button" className="skill-head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="skill-dot" />
        <span className="skill-kind">Skill</span>
        <span className="skill-name">{skill.name}</span>
        <span className="skill-preview">{skill.preview}</span>
        <span className="skill-meta">{t("thread.lines", { count: skill.lineCount })}</span>
        <ChevronRight className={`skill-chev${open ? " open" : ""}`} size={13} strokeWidth={2} aria-hidden />
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
  animateMarkdown,
  item,
  activity,
  markdownTarget,
}: {
  animateMarkdown: boolean;
  item: Extract<UiThreadItem, { kind: "assistant" }>;
  activity?: ThreadActivity;
  markdownTarget?: ActiveMarkdownTarget;
}): React.JSX.Element {
  const { t } = useI18n();
  // Fast Refresh can briefly retain a pre-migration assistant item while the
  // store module is being replaced. Keep the thread renderable during that
  // hand-off instead of crashing the entire workspace on a missing `blocks`.
  const blocks = Array.isArray(item.blocks) ? item.blocks : [];
  const displayBlocks = blocks
    .map((block, sourceIndex) => ({
      block: block.type === "text" && !item.streaming
        ? { ...block, text: stripRedundantCompletionOpener(block.text) }
        : block,
      sourceIndex,
    }))
    .filter(({ block }) => block.type !== "text" || block.text.trim());
  let lastValidBlockIndex = -1;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index].text.trim()) {
      lastValidBlockIndex = index;
      break;
    }
  }
  const aborted = item.stopReason === "aborted";
  const copyText = displayBlocks
    .filter(({ block }) => block.type === "text")
    .map(({ block }) => block.text)
    .join("\n\n")
    .trim();
  const streamActivity = activity?.itemId === item.id && activity.target === "assistant-stream"
    ? activity
    : undefined;
  return (
    <motion.div className="msg-assistant" data-assistant-message-id={item.id} {...entrance}>
      {displayBlocks.map(({ block, sourceIndex }) =>
        block.type === "thinking" ? (
          <ThinkingBlock
            key={sourceIndex}
            text={block.text}
            live={item.streaming && sourceIndex === lastValidBlockIndex}
            orbState={activity?.itemId === item.id
              && activity.target === "assistant-thinking"
              && activity.blockIndex === sourceIndex
              ? activity.state
              : undefined}
          />
        ) : (
          <SkillBlock
            animate={animateMarkdown
              && markdownTarget?.itemId === item.id
              && markdownTarget.blockIndex === sourceIndex}
            key={sourceIndex}
            presentation={markdownTarget?.itemId === item.id
              && markdownTarget.blockIndex === sourceIndex
              ? "streaming"
              : "static"}
            text={block.text}
          />
        ),
      )}
      {streamActivity && (
        <AgentActivityOrb
          state={streamActivity.state}
          className={`assistant-stream-activity${displayBlocks.length ? " has-content" : ""}`}
        />
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

/* ---------------- execution summary card */

function ExecutionSummaryCard({
  item,
}: {
  item: ExecutionSummaryItem;
}): React.JSX.Element {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const summaryText = buildSummaryText(t, language, item);

  return (
    <div className="execution-summary-container">
      <button
        type="button"
        className="execution-summary-bar"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="summary-text">{summaryText}</span>
        <ChevronRight
          className={`summary-chevron${open ? " open" : ""}`}
          size={14}
          strokeWidth={1.65}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="execution-summary-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="execution-summary-body-inner">
              {item.timelineEntries.map((entry) => (
                entry.kind === "thinking"
                  ? <ThinkingBlock key={entry.id} text={entry.text} live={false} />
                  : <ToolExplorationGroup key={entry.id} exploration={entry.group} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolCard({
  item,
  activity,
}: {
  item: Extract<UiThreadItem, { kind: "tool" }>;
  activity?: ThreadActivity;
}): React.JSX.Element {
  return <StandardToolCard item={item} activity={activity} />;
}

function StandardToolCard({
  item,
  activity,
}: {
  item: Extract<UiThreadItem, { kind: "tool" }>;
  activity?: ThreadActivity;
}): React.JSX.Element {
  const { t } = useI18n();
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? item.running;
  const label = TOOL_LABELS[item.name] ?? item.name;
  const summary = summarizeArgs(item.args);
  const argsJson =
    item.args && typeof item.args === "object" ? JSON.stringify(item.args, null, 2) : undefined;
  const active = activity?.target === "tool" && activity.callId === item.callId ? activity : undefined;

  return (
    <motion.div
      className={`tool-card${item.isError ? " error" : ""}`}
      data-tool-call-id={item.callId}
      data-tool-name={item.name}
      {...entrance}
    >
      <button type="button" className="tool-head" aria-expanded={open} onClick={() => setManual(!open)}>
        {active
          ? <AgentActivityOrb state={active.state} decorative className="tool-card-activity-orb" />
          : (
              <span
                className={`tool-dot${item.running ? " running" : ""}${item.isError ? " failed" : ""}`}
              />
            )}
        <span className="tool-name">{label}</span>
        <span className="tool-summary">{summary}</span>
        <span className={`tool-status${item.isError ? " error" : ""}`}>
          {item.running ? t("thread.running") : item.isError ? t("thread.failed") : t("thread.complete")}
        </span>
        <ChevronRight className={`tool-chev${open ? " open" : ""}`} size={13} strokeWidth={2} aria-hidden />
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

function ToolExplorationGroup({
  exploration,
  activity,
}: {
  exploration: ToolExplorationGroupItem;
  activity?: ThreadActivity;
}): React.JSX.Element {
  const running = exploration.groups.some((group) => group.items.some((item) => item.running));
  const [open, setOpen] = useState(true);
  const active = activity?.target === "tool"
    && exploration.groups.some((group) => group.items.some((item) => item.callId === activity.callId))
    ? activity
    : undefined;

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
        {active && <AgentActivityOrb state={active.state} decorative className="tool-exploration-activity-orb" />}
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

function ApprovalRequest({
  request,
  shortcutActive,
  showExplanationOrb,
}: {
  request: UiApprovalRequest;
  shortcutActive: boolean;
  showExplanationOrb: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const resolveApproval = useCompass((state) => state.resolveApproval);
  const [responding, setResponding] = useState<"allow" | "deny" | null>(null);
  const commandText = summarizeArgs(request.args) || request.detail.split(/\r?\n/).slice(1).join(" ");
  const explanation = request.explanation?.trim();
  const explanationState = explanation
    ? "ready"
    : request.explanationPending === false
      ? "unavailable"
      : "pending";
  const explanationText = explanation ?? t("thread.commandExplanationUnavailable");

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const metaKeyLabel = isMac ? "⌘↵" : "Ctrl+↵";

  const respond = useCallback((allowed: boolean): void => {
    if (responding !== null) return;
    setResponding(allowed ? "allow" : "deny");
    void resolveApproval(request.id, allowed).finally(() => setResponding(null));
  }, [responding, request.id, resolveApproval]);

  useEffect(() => {
    if (!shortcutActive) return undefined;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (responding !== null) return;
      const target = e.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || target.matches("input, textarea, select"))
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        respond(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        respond(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [responding, respond, shortcutActive]);

  return (
    <motion.section className="approval-request" aria-label={t("thread.actionApproval")} {...entrance}>
      <div className="approval-request-header">
        <div className="approval-request-badge">
          <Terminal size={11} strokeWidth={2.2} aria-hidden />
          <span>{t("thread.actionApproval")}</span>
        </div>
        <strong>{request.message}</strong>
      </div>
      <pre className="approval-request-command">{commandText || request.toolName}</pre>
      <div
        className={`approval-request-explanation ${explanationState}`}
        aria-live="polite"
        aria-busy={explanationState === "pending"}
      >
        {explanationState === "pending"
          ? showExplanationOrb
            ? <AgentActivityOrb state="solving" className="approval-request-explanation-orb" />
            : <span>{t("common.loading")}</span>
          : explanationText}
      </div>
      <div className="approval-request-actions">
        <button
          type="button"
          className="approval-deny"
          disabled={responding !== null}
          onClick={() => respond(false)}
        >
          <span>{responding === "deny" ? t("thread.denying") : t("thread.deny")}</span>
          {shortcutActive && <kbd className="approval-kbd">Esc</kbd>}
        </button>
        <button
          type="button"
          className="approval-allow"
          disabled={responding !== null}
          onClick={() => respond(true)}
        >
          <span>{responding === "allow" ? t("thread.allowing") : t("thread.allowOnce")}</span>
          {shortcutActive && <kbd className="approval-kbd">{metaKeyLabel}</kbd>}
        </button>
      </div>
    </motion.section>
  );
}

const ACTIVE_DEPENDENCY_PHASES = new Set<DependencyInstallProgress["phase"]>([
  "queued",
  "downloading",
  "extracting",
  "installing",
  "launching",
]);

function threadDependencyPhaseKey(phase: DependencyInstallProgress["phase"]): TranslationKey {
  const keys: Record<DependencyInstallProgress["phase"], TranslationKey> = {
    queued: "settings.dependency.phase.queued",
    downloading: "settings.dependency.phase.downloading",
    extracting: "settings.dependency.phase.extracting",
    installing: "settings.dependency.phase.installing",
    launching: "settings.dependency.phase.launching",
    "awaiting-user": "settings.dependency.phase.awaitingUser",
    completed: "settings.dependency.phase.completed",
    failed: "settings.dependency.phase.failed",
    cancelled: "settings.dependency.phase.cancelled",
  };
  return keys[phase];
}

function threadDependencyBytes(bytes: number): string {
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function SessionDependencyCard({
  sessionId,
  progress,
}: {
  sessionId: string;
  progress?: DependencyInstallProgress;
}): React.JSX.Element {
  const { t } = useI18n();
  const installDependency = useCompass((state) => state.installDependency);
  const cancelDependencyInstall = useCompass((state) => state.cancelDependencyInstall);
  const refreshDependencies = useCompass((state) => state.refreshDependencies);
  const dismissDependencyPrompt = useCompass((state) => state.dismissDependencyPrompt);
  const openSettings = useCompass((state) => state.openSettings);
  const active = progress ? ACTIVE_DEPENDENCY_PHASES.has(progress.phase) : false;
  const percent = typeof progress?.progress === "number" ? Math.round(progress.progress * 100) : undefined;
  const terminalFailure = progress?.phase === "failed" || progress?.phase === "cancelled";
  const showProgress = Boolean(progress);

  return (
    <motion.section className={`thread-dependency-card${showProgress ? " has-progress" : ""}`} {...dependencyEntrance}>
      <div className="thread-dependency-card-accent" aria-hidden="true" />
      <div className="thread-dependency-card-icon">
        <img src={phonakTargetAppIcon} alt="" />
      </div>
      <div className="thread-dependency-card-content">
        <div className="thread-dependency-card-heading">
          <div>
            <span>PHONAK · TARGET</span>
            <strong>{t(showProgress ? "thread.dependency.progressTitle" : "thread.dependency.phonakTitle")}</strong>
          </div>
          {progress?.phase === "completed" && <CheckCircle2 size={17} strokeWidth={1.7} aria-hidden="true" />}
        </div>
        {!showProgress && <p>{t("thread.dependency.phonakDescription")}</p>}
        {progress && (
          <div className={`thread-dependency-progress phase-${progress.phase}`} aria-live="polite">
            <div>
              <span>{t(threadDependencyPhaseKey(progress.phase))}</span>
              {progress.phase === "downloading" && percent !== undefined && <strong>{percent}%</strong>}
            </div>
            {active && (
              <div
                className={`thread-dependency-progress-track${percent === undefined ? " indeterminate" : ""}`}
                role="progressbar"
                aria-label={t(threadDependencyPhaseKey(progress.phase))}
                aria-valuemin={percent === undefined ? undefined : 0}
                aria-valuemax={percent === undefined ? undefined : 100}
                aria-valuenow={percent}
              >
                <span style={percent === undefined ? undefined : { width: `${percent}%` }} />
              </div>
            )}
            {progress.downloadedBytes !== undefined && progress.phase === "downloading" && (
              <small>
                {t("thread.dependency.downloaded", {
                  downloaded: threadDependencyBytes(progress.downloadedBytes),
                  total: progress.totalBytes ? ` / ${threadDependencyBytes(progress.totalBytes)}` : "",
                })}
              </small>
            )}
            {progress.error && <small className="error">{progress.error}</small>}
          </div>
        )}
        <div className="thread-dependency-card-actions">
          {!progress || terminalFailure ? (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() => dismissDependencyPrompt(sessionId, "phonak-target")}
              >
                {t("thread.dependency.later")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void installDependency("phonak-target", sessionId)}
              >
                <Download size={13} strokeWidth={1.7} aria-hidden="true" />
                {t(terminalFailure ? "settings.dependency.retry" : "thread.dependency.install")}
              </button>
            </>
          ) : active ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void cancelDependencyInstall("phonak-target")}
            >
              {t("settings.dependency.cancelDownload")}
            </button>
          ) : (
            <>
              {progress.phase === "awaiting-user" && (
                <button type="button" className="secondary" onClick={() => void refreshDependencies()}>
                  <RotateCw size={12} strokeWidth={1.7} aria-hidden="true" />
                  {t("settings.dependenciesRefresh")}
                </button>
              )}
              <button type="button" className="secondary" onClick={() => openSettings("dependencies")}>
                <ExternalLink size={12} strokeWidth={1.7} aria-hidden="true" />
                {t("thread.dependency.openDependencies")}
              </button>
            </>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------- thread */

export function Thread(): React.JSX.Element {
  const { t } = useI18n();
  const thread = useCompass((s) => s.thread) ?? [];
  const agentStreaming = useCompass((s) => s.streaming);
  const approvals = useCompass((s) => s.approvals) ?? [];
  const sessionId = useCompass((s) => s.stats?.sessionId);
  const clientRegistry = useCompass((s) => s.clientRegistry);
  const dependencies = useCompass((s) => s.dependencies);
  const dismissedDependencyPrompts = useCompass((s) => s.dismissedDependencyPrompts);
  const reduced = usePrefersReducedMotion();
  const targetResource = dependencies.items.find((item) => item.id === "phonak-target");
  const targetInstall = sessionDependencyInstall(sessionId, dependencies, "phonak-target");
  const targetPromptDismissed = sessionId
    ? Boolean(dismissedDependencyPrompts[dependencyPromptKey(sessionId, "phonak-target")])
    : false;
  const needsTarget = sessionNeedsPhonakTarget(
    sessionId,
    clientRegistry,
    dependencies,
    dismissedDependencyPrompts,
  );
  const visibleTargetInstall = targetInstall
    && !(targetInstall.phase === "completed" && targetResource?.availability === "installed")
    && !(targetPromptDismissed && ["failed", "cancelled"].includes(targetInstall.phase))
    ? targetInstall
    : undefined;
  const activity = useMemo(() => resolveThreadActivity(thread), [thread]);
  const activeApprovalExplanationId = useMemo(
    () => resolveActiveApprovalExplanationId(approvals, activity),
    [activity, approvals],
  );
  const activeApprovalShortcutId = approvals.at(-1)?.id;
  const markdownTarget = useMemo(
    () => resolveActiveMarkdownTarget(thread),
    [thread],
  );
  const renderItems = useMemo(
    () => placeAssistantIdentities(
      summarizeExecutionTurns(groupToolActivities(thread), agentStreaming),
    ),
    [agentStreaming, thread],
  );
  const promptEntries = useMemo(() => buildPromptRailEntries(thread), [thread]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useLayoutEffect(() => {
    stickRef.current = true;
    setShowJumpToLatest(false);
  }, [sessionId]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && stickRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [approvals, needsTarget, thread, visibleTargetInstall]);

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
                return (
                  <AssistantMessage
                    animateMarkdown={!reduced}
                    key={item.id}
                    item={item}
                    activity={activity}
                    markdownTarget={markdownTarget}
                  />
                );
              case "assistant-identity":
                return <AssistantIdentity key={item.id} />;
              case "execution-summary":
                return <ExecutionSummaryCard key={item.id} item={item} />;
              case "tool":
                return <ToolCard key={item.id} item={item} activity={activity} />;
              case "tool-exploration-group":
                return <ToolExplorationGroup key={item.id} exploration={item} activity={activity} />;
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
          {sessionId && (needsTarget || visibleTargetInstall) && (
            <SessionDependencyCard sessionId={sessionId} progress={visibleTargetInstall} />
          )}
          {approvals.map((request) => (
            <ApprovalRequest
              key={request.id}
              request={request}
              shortcutActive={request.id === activeApprovalShortcutId}
              showExplanationOrb={request.id === activeApprovalExplanationId}
            />
          ))}
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
