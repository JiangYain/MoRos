import type { QueuedMessageKind } from "@shared/types";
import { parseSkillInvocation } from "@shared/skill-display";
import { ArrowUp, Mic, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isDesktop } from "../ipc";
import { useI18n } from "../i18n";
import { ignoreCommandFailure, useMoros } from "../store";
import { ActionsMenu } from "./composer/ActionsMenu";
import { ContextUsageSurface, ContextUsageTrigger } from "./composer/ContextUsage";
import { ModelMenu } from "./composer/ModelMenu";
import { PermissionMenu } from "./composer/PermissionMenu";
import {
  ComposerAttachments,
  DictationStatus,
  QueueChips,
  SlashCommandPopover,
  type SlashCommandItem,
} from "./composer/ComposerParts";
import { readComposerImage, type ComposerAttachment } from "./composer/composer-attachments";
import { findSlashToken } from "./composer/slash-token";
import { useComposerDictation } from "./composer/useComposerDictation";
import { ComposerEditor, type ComposerEditorHandle } from "./composer/ComposerEditor";
import { findInlineSkills, skillPrompt } from "./composer/inline-skills";
import { FeedbackTrigger } from "../workbench/Feedback";
import { useWorkbench } from "../workbench/useWorkbench";
import { mergePendingFeedback } from "../workbench/pending-feedback";
import { workbenchScopeKey } from "@shared/workbench";

type PopoverKind = "none" | "actions" | "permissions" | "model";

export function Composer({ showQuickPrompts = false }: { showQuickPrompts?: boolean }): React.JSX.Element {
  const { feedback } = useWorkbench();
  const feedbackIds = feedback.filter((item) => item.selected).map((item) => item.id);
  const { t } = useI18n();
  const streaming = useMoros((state) => state.streaming);
  const stats = useMoros((state) => state.stats);
  const skills = useMoros((state) => state.skills);
  const queue = useMoros((state) => state.queue);
  const composerSeed = useMoros((state) => state.composerSeed);
  const clearComposerSeed = useMoros((state) => state.clearComposerSeed);
  const send = useMoros((state) => state.send);
  const abort = useMoros((state) => state.abort);
  const openSettings = useMoros((state) => state.openSettings);
  const removeQueuedMessage = useMoros((state) => state.removeQueuedMessage);
  const setComposerDraft = useMoros((state) => state.setComposerDraft);
  const clearComposerDraft = useMoros((state) => state.clearComposerDraft);
  const composerSendKey = useMoros((state) => state.settings?.composerSendKey ?? "enter");

  const sessionKey = stats?.sessionId ?? "pending";
  const [text, setText] = useState("");
  const [caret, setCaret] = useState<number | null>(0);
  const selectedSkill = useMemo(() => findInlineSkills(text, skills)[0]?.skill ?? null, [text, skills]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [popover, setPopover] = useState<PopoverKind>("none");
  const [contextExpanded, setContextExpanded] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const textareaRef = useRef<ComposerEditorHandle>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const sessionKeyRef = useRef(sessionKey);

  // Hydrate the composer from the per-session draft table on mount and on
  // session switches. Drafts are read through getState() so this effect only
  // re-runs when the session key itself changes.
  useEffect(() => {
    sessionKeyRef.current = sessionKey;
    const store = useMoros.getState();
    const draft = store.composerDrafts[sessionKey];
    const draftText = draft?.skillName && !findInlineSkills(draft.text, store.skills).length
      ? `/skill:${draft.skillName} ${draft.text}`
      : draft?.text ?? "";
    setText(draftText);
    setCaret(draftText.length);
    setAttachments(draft?.attachments ?? []);
  }, [sessionKey]);

  useEffect(() => {
    if (composerSeed === null) return;
    const invocation = parseSkillInvocation(composerSeed.text);
    const seededSkill = invocation
      ? skills.find((skill) => skill.name === invocation.name && skill.enabled) ?? null
      : null;
    const seededText = seededSkill && invocation
      ? `/skill:${seededSkill.name} ${invocation.argumentsText}`
      : composerSeed.text;
    setText(seededText);
    setCaret(seededText.length);
    setAttachments(
      (composerSeed.images ?? [])
        .slice(0, 8)
        .map((image) => ({ ...image, id: crypto.randomUUID() })),
    );
    clearComposerSeed();
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
  }, [composerSeed, clearComposerSeed, skills]);

  // Mirror every local edit back into the draft table so the draft survives
  // unmounts (for example while the settings surface is open). This effect
  // never fires on the render that swaps sessionKey (its deps are unchanged
  // there), and the ref keeps async updates writing to the session they
  // belong to instead of a freshly switched one.
  useEffect(() => {
    setComposerDraft(sessionKeyRef.current, {
      text,
      attachments,
      skillName: selectedSkill?.name ?? null,
    });
  }, [text, attachments, selectedSkill, setComposerDraft]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Menu contents and toolbar anchors own their own toggle/selection
      // behavior. Every other surface — including composer whitespace,
      // attachments and the workspace strip — dismisses the active menu.
      if (!target.closest(".popover, .toolbar-anchor")) {
        setPopover("none");
      }
      if (rootRef.current && !rootRef.current.contains(target)) {
        setComposerFocused(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setPopover("none");
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const slashToken = useMemo(() => caret === null ? null : findSlashToken(text, caret), [text, caret]);
  const slashQuery = slashToken?.query ?? null;
  const slashItems = useMemo(() => {
    if (slashQuery === null) return [];
    return skills
      .filter((skill) => skill.enabled)
      .map((skill) => ({
        command: `/skill:${skill.name}`,
        name: skill.name,
        description: skill.description,
      }))
      .filter((item) => item.command.toLowerCase().includes(slashQuery));
  }, [skills, slashQuery]);
  useEffect(() => {
    setSlashIndex(0);
    setSlashDismissed(false);
  }, [slashQuery, slashToken?.start]);
  const slashMenuOpen = composerFocused && !slashDismissed && slashItems.length > 0;

  const noModel = !stats?.model || !stats.modelAuthConfigured;
  const togglePopover = (next: Exclude<PopoverKind, "none">): void => {
    setPopover((current) => (current === next ? "none" : next));
  };

  const addImageFiles = async (files: File[]): Promise<void> => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      useMoros.getState().setError(t("composer.selectImageFile"));
      return;
    }
    const available = Math.max(0, 8 - attachments.length);
    if (available === 0) {
      useMoros.getState().setError(t("composer.maxImages"));
      return;
    }
    try {
      const next = await Promise.all(imageFiles.slice(0, available).map((file) => readComposerImage(file, t)));
      setAttachments((current) => [...current, ...next].slice(0, 8));
      useMoros.getState().setError(imageFiles.length > available ? t("composer.maxImages") : null);
      setPopover("none");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      useMoros.getState().setError(error instanceof Error ? error.message : String(error));
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>): void => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length === 0) return;
    event.preventDefault();
    void addImageFiles(files);
  };

  const onDragEnter = (event: React.DragEvent<HTMLDivElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragActive(false);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void addImageFiles(files);
  };

  const applySlash = (item: SlashCommandItem): void => {
    if (!slashToken) return;
    const skill = skills.find((skill) => skill.name === item.name);
    if (!skill) return;
    textareaRef.current?.insertSkill(slashToken.start, slashToken.end, skill);
    setComposerFocused(true);
    setSlashDismissed(true);
  };

  const withdrawQueuedMessage = (kind: QueuedMessageKind, index: number, message: string): void => {
    void removeQueuedMessage(kind, index, message);
  };

  const recallQueuedMessage = (kind: QueuedMessageKind, index: number, message: string): void => {
    void removeQueuedMessage(kind, index, message).then((removed) => {
      if (!removed) return;
      const { draft, scope } = removed;
      const store = useMoros.getState();
      const previous = store.composerDrafts[scope.sessionId];
      const mergedText = previous?.text.trim() ? `${previous.text.trimEnd()}\n${draft.text}` : draft.text;
      const mergedImages = [...(previous?.attachments ?? []), ...draft.images.map((image) => ({ ...image, id: crypto.randomUUID() }))];
      store.setComposerDraft(scope.sessionId, { text: mergedText, attachments: mergedImages, skillName: null });
      store.setWorkbenchUI(scope, { recalledFeedback: mergePendingFeedback(store.workbenchUI[workbenchScopeKey(scope)]?.recalledFeedback, draft.feedback) });
      // The IPC reply belongs to its original session even if the user switches meanwhile.
      if (sessionKeyRef.current !== scope.sessionId) return;
      setText(mergedText);
      setAttachments(mergedImages);
      // Mirrors the composer-seed effect: focus the textarea with the caret at the end.
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
      });
    });
  };

  const doSend = (): void => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0 && !selectedSkill && !feedbackIds.length) return;
    if (noModel) {
      useMoros.getState().setError(t("composer.configureModel"));
      return;
    }
    if (attachments.length > 0 && stats?.model && !stats.model.supportsImages) {
      useMoros.getState().setError(t("composer.imageUnsupported"));
      return;
    }

    const draftText = text;
    const draftAttachments = attachments;
    const images = attachments.map(({ data, mimeType, name }) => ({ data, mimeType, name }));
    useMoros.getState().setError(null);
    setPopover("none");
    setText("");
    setAttachments([]);
    clearComposerDraft(sessionKeyRef.current);
    const promptText = skillPrompt(text, skills);
    void send(promptText, images, feedbackIds).catch(() => {
      setText((current) => current || draftText);
      setAttachments((current) => current.length > 0 ? current : draftAttachments);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (slashMenuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((index) => (index + 1) % slashItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex((index) => (index - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        applySlash(slashItems[slashIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
    if (event.key === "Escape" && popover !== "none") {
      event.preventDefault();
      setPopover("none");
      return;
    }
    if (event.key === "Enter") {
      const sendCombination = composerSendKey === "shiftEnter" ? event.shiftKey : !event.shiftKey;
      if (sendCombination) {
        event.preventDefault();
        doSend();
        return;
      }
      // The complementary combination falls through to the native newline.
    }
    if (event.key === "Escape" && streaming) {
      event.preventDefault();
      ignoreCommandFailure(abort());
    }
  };

  const dictation = useComposerDictation(
    textareaRef,
    (result) => setText((current) => `${current.trimEnd()}${current.trim() ? " " : ""}${result}`),
    () => setPopover("none"),
  );

  return (
    <div className="composer-zone">
      <div className="composer-wrap" ref={rootRef}>
        <FeedbackTrigger />
        <QueueChips
          steering={queue.steering}
          followUp={queue.followUp}
          onRecall={recallQueuedMessage}
          onWithdraw={withdrawQueuedMessage}
        />

        <ContextUsageSurface expanded={contextExpanded} onClose={() => setContextExpanded(false)} showQuickPrompts={showQuickPrompts} />

        <div
          className={`composer${dragActive ? " drag-active" : ""}`}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <AnimatePresence>
            {dragActive && (
              <motion.div
                className="composer-drop-overlay"
                role="status"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <span>{t("composer.dropImages")}</span>
                <small>{t("composer.imageRules")}</small>
              </motion.div>
            )}
          </AnimatePresence>
          <SlashCommandPopover
            items={slashItems}
            open={popover === "none" && slashMenuOpen}
            selectedIndex={slashIndex}
            onApply={applySlash}
            onHighlight={setSlashIndex}
          />

          <input ref={imageInputRef} className="composer-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void addImageFiles(files);
          }} />

          <ComposerAttachments
            attachments={attachments}
            onRemove={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
          />

          <ComposerEditor
            ref={textareaRef}
            value={text}
            skills={skills}
            placeholder={streaming ? t("composer.steerPlaceholder") : t("composer.placeholder")}
            onChange={setText}
            onCaretChange={setCaret}
            onFocus={() => {
              setComposerFocused(true);
              setPopover("none");
            }}
            onBlur={() => setComposerFocused(false)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />

          <DictationStatus busy={dictation.busy} label={dictation.label} phase={dictation.state.phase} preview={dictation.state.preview} />

          <div className="composer-toolbar">
            <ActionsMenu open={popover === "actions"} onAddImage={() => imageInputRef.current?.click()} onClose={() => setPopover("none")} onToggle={() => togglePopover("actions")} />
            <PermissionMenu open={popover === "permissions"} onClose={() => setPopover("none")} onToggle={() => togglePopover("permissions")} />
            <div className="composer-spacer" />
            <ContextUsageTrigger expanded={contextExpanded} onToggle={() => {
              setPopover("none");
              setContextExpanded((current) => !current);
            }} />
            <ModelMenu open={popover === "model"} onClose={() => setPopover("none")} onOpenSettings={() => openSettings("models")} onToggle={() => togglePopover("model")} />
            <button type="button" className={`composer-icon-btn composer-round-btn voice-btn${dictation.busy ? " active launching" : ""}`} aria-label={dictation.busy ? dictation.label : isDesktop ? t("composer.startDesktopVoice") : t("composer.startBrowserVoice")} aria-pressed={dictation.busy} title={isDesktop ? t("composer.startDesktopVoice") : t("composer.startBrowserVoice")} onClick={dictation.start}>
              <Mic size={18} strokeWidth={1.75} />
            </button>
            {streaming && !text.trim() && attachments.length === 0 && !selectedSkill ? (
              <button type="button" className="send-btn stop" aria-label={t("composer.stop")} onClick={() => ignoreCommandFailure(abort())}><Square size={13} fill="currentColor" strokeWidth={0} /></button>
            ) : (
              <button type="button" className="send-btn" aria-label={t("composer.send")} title={noModel ? t("composer.configureFirst") : t("composer.send")} disabled={(!text.trim() && attachments.length === 0 && !selectedSkill && !feedbackIds.length) || noModel} onClick={doSend}>
                <ArrowUp size={19} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
