import type { UiThreadItem } from "@shared/types";
import { ChevronRight, ChevronUp, File, FilePenLine, FilePlus2, Search, Terminal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import { AgentActivityOrb } from "../AgentActivityOrb";
import { CopyButton } from "../CopyButton";
import { Markdown } from "../Markdown";
import {
  buildSummaryText,
  shouldShowToolActivityOutput,
  summarizeToolActivity,
  TOOL_ACTIVITY_COPY,
  type ExecutionSummaryItem,
  type ToolActivity,
  type ToolActivityGroupItem,
  type ToolExplorationGroupItem,
} from "../threadCommands";
import type { ThreadActivity } from "../threadActivity";
import { summarizeThreadArgs } from "./thread-format";
import { ThinkingBlock, THREAD_ENTRANCE } from "./ThreadMessages";
import { ToolResourceLinks } from "../../workbench/ResourceLinks";

const TOOL_LABELS: Record<string, string> = {
  bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Edit",
  grep: "Grep",
  find: "Find",
  ls: "List",
};

export function ExecutionSummaryCard({ item }: { item: ExecutionSummaryItem }): React.JSX.Element {
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
              {item.timelineEntries.map((entry) => {
                if (entry.kind === "thinking") {
                  return <ThinkingBlock key={entry.id} text={entry.text} live={false} />;
                }
                if (entry.kind === "narration") {
                  return (
                    <div className="summary-narration" key={entry.id}>
                      <Markdown text={entry.text} />
                    </div>
                  );
                }
                return <ToolExplorationGroup key={entry.id} exploration={entry.group} />;
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ToolCard({
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
  const summary = summarizeThreadArgs(item.args);
  const argsJson = item.args && typeof item.args === "object"
    ? JSON.stringify(item.args, null, 2)
    : undefined;
  const active = activity?.target === "tool" && activity.callId === item.callId ? activity : undefined;

  return (
    <motion.div
      className={`tool-card${item.isError ? " error" : ""}`}
      data-tool-call-id={item.callId}
      data-tool-name={item.name}
      {...THREAD_ENTRANCE}
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
              <ToolResourceLinks args={item.args} output={item.output} />
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
  const [expanded, setExpanded] = useState(false);
  const copy = TOOL_ACTIVITY_COPY[activity];
  const summary = summarizeToolActivity(item);
  const state = item.running ? copy.itemActive : item.isError ? "Failed" : copy.itemComplete;
  const hasOutput = shouldShowToolActivityOutput(activity, item) || (item.isError && Boolean(item.output?.trim()));

  return (
    <li
      className={`tool-activity-entry${item.running ? " running" : ""}${item.isError ? " error" : ""}`}
      data-tool-activity-item={activity}
      data-tool-call-id={item.callId}
      data-tool-name={item.name}
      title={summary}
    >
      <div
        className={`tool-activity-row${hasOutput ? " clickable" : ""}`}
        role={hasOutput ? "button" : undefined}
        tabIndex={hasOutput ? 0 : undefined}
        aria-expanded={hasOutput ? expanded : undefined}
        onClick={hasOutput ? () => setExpanded((prev) => !prev) : undefined}
        onKeyDown={
          hasOutput
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setExpanded((prev) => !prev);
                }
              }
            : undefined
        }
      >
        <ToolActivityIcon activity={activity} />
        <span className="tool-activity-state">{state}</span>
        <span className="tool-activity-summary">{summary}</span>
        {hasOutput && (
          <ChevronRight
            aria-hidden
            className={`tool-activity-entry-chevron${expanded ? " open" : ""}`}
            size={12}
            strokeWidth={1.65}
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {hasOutput && expanded && (
          <motion.div
            className="tool-activity-output-clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={`tool-activity-output-shell${item.isError ? " error" : ""}`}>
              <div className="tool-activity-output-actions">
                <CopyButton
                  className="tool-activity-action-btn"
                  label={t("thread.copyToolOutput")}
                  text={item.output}
                />
                <button
                  type="button"
                  className="tool-activity-action-btn"
                  aria-label={t("thread.collapseToolOutput")}
                  title={t("thread.collapseToolOutput")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpanded(false);
                  }}
                >
                  <ChevronUp size={13} strokeWidth={1.8} aria-hidden />
                </button>
              </div>
              <pre className="tool-activity-output">{item.output}</pre>
              <ToolResourceLinks args={item.args} output={item.output} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
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

export function ToolExplorationGroup({
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
