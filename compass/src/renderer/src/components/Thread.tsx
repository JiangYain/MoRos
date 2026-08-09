import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import {
  dependencyPromptKey,
  sessionDependencyInstall,
  sessionNeedsPhonakTarget,
} from "../dependency-recommendation";
import { useI18n } from "../i18n";
import { useCompass } from "../store";
import { usePrefersReducedMotion } from "../use-prefers-reduced-motion";
import {
  groupToolActivities,
  placeAssistantIdentities,
  summarizeExecutionTurns,
} from "./threadCommands";
import {
  resolveActiveApprovalExplanationId,
  resolveThreadActivity,
} from "./threadActivity";
import { resolveActiveMarkdownTarget } from "./threadMarkdown";
import { ApprovalRequest } from "./thread/ApprovalRequest";
import {
  AssistantIdentity,
  AssistantMessage,
  UserMessage,
} from "./thread/ThreadMessages";
import {
  buildPromptRailEntries,
  ThreadPromptRail,
} from "./thread/ThreadPromptRail";
import {
  ExecutionSummaryCard,
  ToolCard,
  ToolExplorationGroup,
} from "./thread/ThreadTools";
import { SessionDependencyCard } from "./thread/SessionDependencyCard";
import { useThreadScroll } from "./thread/useThreadScroll";

export function Thread(): React.JSX.Element {
  const { t } = useI18n();
  const thread = useCompass((state) => state.thread) ?? [];
  const agentStreaming = useCompass((state) => state.streaming);
  const approvals = useCompass((state) => state.approvals) ?? [];
  const sessionId = useCompass((state) => state.stats?.sessionId);
  const clientRegistry = useCompass((state) => state.clientRegistry);
  const dependencies = useCompass((state) => state.dependencies);
  const dismissedDependencyPrompts = useCompass((state) => state.dismissedDependencyPrompts);
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
  const markdownTarget = useMemo(() => resolveActiveMarkdownTarget(thread), [thread]);
  const renderItems = useMemo(
    () => placeAssistantIdentities(
      summarizeExecutionTurns(groupToolActivities(thread), agentStreaming),
    ),
    [agentStreaming, thread],
  );
  const promptEntries = useMemo(() => buildPromptRailEntries(thread), [thread]);
  const scroll = useThreadScroll({
    approvals,
    needsTarget,
    sessionId,
    thread,
    visibleTargetInstall,
  });

  return (
    <div className={`thread-shell${scroll.showJumpToLatest ? " reading-history" : ""}`}>
      <ThreadPromptRail entries={promptEntries} scrollRoot={scroll.scrollRef} />
      <div className="thread-scroll" ref={scroll.scrollRef} onScroll={scroll.onScroll}>
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
        {scroll.showJumpToLatest && (
          <motion.button
            type="button"
            className="thread-jump-latest"
            aria-label={t("thread.jumpLatest")}
            title={t("thread.jumpLatest")}
            initial={reduced ? false : { opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.94 }}
            transition={{ duration: reduced ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={scroll.jumpToLatest}
          >
            <ArrowDown size={14} strokeWidth={1.7} aria-hidden />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
