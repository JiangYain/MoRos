import type { UiThreadItem } from "@shared/types";
import { Box, ChevronRight, Pencil, RotateCcw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { ignoreCommandFailure, useCompass } from "../../store";
import { AgentActivityOrb } from "../AgentActivityOrb";
import { CopyButton } from "../CopyButton";
import { ImageLightbox } from "../ImageLightbox";
import { Markdown } from "../Markdown";
import { stripRedundantCompletionOpener } from "../threadCommands";
import type { ThreadActivity } from "../threadActivity";
import {
  parseSkillBlock,
  type ActiveMarkdownTarget,
  type MarkdownPresentation,
} from "../threadMarkdown";

export const THREAD_ENTRANCE = {
  initial: { opacity: 0, y: 14, filter: "blur(5px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

export function ThinkingBlock({
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
        <Markdown animate={animate} presentation={presentation} text={text} />
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

/** Rebuilds the prompt text a user item was sent with, including its skill invocation. */
function userPromptText(item: Extract<UiThreadItem, { kind: "user" }>): string {
  return item.skillName
    ? `/skill:${item.skillName}${item.text.trim() ? ` ${item.text.trim()}` : ""}`
    : item.text;
}

export function UserMessage({ item }: { item: Extract<UiThreadItem, { kind: "user" }> }): React.JSX.Element {
  const { t } = useI18n();
  const seedComposer = useCompass((state) => state.seedComposer);
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  return (
    <motion.div className="msg-user" data-thread-prompt-id={item.id} {...THREAD_ENTRANCE}>
      {item.images && item.images.length > 0 && (
        <div className="msg-user-images">
          {item.images.map((image, index) => {
            const src = `data:${image.mimeType};base64,${image.data}`;
            const alt = image.name ?? `Attachment ${index + 1}`;
            return (
              <button
                key={`${image.mimeType}-${index}`}
                type="button"
                className="msg-user-image-button"
                aria-label={t("common.viewImage")}
                title={t("common.viewImage")}
                onClick={() => setPreview({ src, alt })}
              >
                <img src={src} alt={alt} />
              </button>
            );
          })}
        </div>
      )}
      {preview && <ImageLightbox src={preview.src} alt={preview.alt} onClose={() => setPreview(null)} />}
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
      <button
        type="button"
        className="msg-user-edit-button"
        aria-label={t("thread.editPrompt")}
        title={t("thread.editPrompt")}
        onClick={() => seedComposer(userPromptText(item), item.images)}
      >
        <Pencil size={13} strokeWidth={1.75} aria-hidden />
      </button>
    </motion.div>
  );
}

export function AssistantMessage({
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
  const streaming = useCompass((state) => state.streaming);
  const send = useCompass((state) => state.send);
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
  const showRetry = !streaming && Boolean(item.errorMessage || aborted);
  const retry = (): void => {
    // Resend the closest user prompt that precedes this assistant message.
    const thread = useCompass.getState().thread;
    const selfIndex = thread.findIndex((entry) => entry.id === item.id);
    for (let index = selfIndex - 1; index >= 0; index -= 1) {
      const entry = thread[index];
      if (entry.kind === "user") {
        ignoreCommandFailure(send(userPromptText(entry), entry.images));
        return;
      }
    }
  };
  const retryButton = showRetry ? (
    <button
      type="button"
      className="msg-retry-button"
      aria-label={t("thread.retry")}
      title={t("thread.retry")}
      onClick={retry}
    >
      <RotateCcw size={12} strokeWidth={1.75} aria-hidden />
      <span>{t("thread.retry")}</span>
    </button>
  ) : null;

  return (
    <motion.div className="msg-assistant" data-assistant-message-id={item.id} {...THREAD_ENTRANCE}>
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
      {item.errorMessage && !aborted && (
        <div className="msg-error">
          {item.errorMessage}
          {retryButton}
        </div>
      )}
      {aborted && (
        <div className="notice-row warn">
          {t("thread.aborted")}
          {retryButton}
        </div>
      )}
      {!item.streaming && copyText && (
        <CopyButton className="assistant-copy-button" label={t("thread.copyReply")} text={copyText} />
      )}
    </motion.div>
  );
}

export function AssistantIdentity(): React.JSX.Element {
  return (
    <motion.div className="assistant-identity" {...THREAD_ENTRANCE}>
      <span className="dot" />
      <span className="micro-label" style={{ color: "var(--color-text-secondary)" }}>
        Compass
      </span>
    </motion.div>
  );
}
