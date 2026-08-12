import type { QueuedMessageKind, UiSkill } from "@shared/types";
import { parseSkillInvocation } from "@shared/skill-display";
import { ArrowUp, Mic, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isDesktop } from "../ipc";
import { useI18n } from "../i18n";
import { ignoreCommandFailure, useCompass } from "../store";
import { ActionsMenu } from "./composer/ActionsMenu";
import { ContextUsageSurface, ContextUsageTrigger } from "./composer/ContextUsage";
import { ModelMenu } from "./composer/ModelMenu";
import { PermissionMenu } from "./composer/PermissionMenu";
import {
  ComposerAttachments,
  DictationStatus,
  QueueChips,
  SelectedSkill,
  SlashCommandPopover,
  type SlashCommandItem,
} from "./composer/ComposerParts";
import { readComposerImage, type ComposerAttachment } from "./composer/composer-attachments";
import { findSlashToken } from "./composer/slash-token";
import { useComposerDictation } from "./composer/useComposerDictation";

type PopoverKind = "none" | "actions" | "permissions" | "model";

export function Composer({ showQuickPrompts = false }: { showQuickPrompts?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const streaming = useCompass((state) => state.streaming);
  const stats = useCompass((state) => state.stats);
  const skills = useCompass((state) => state.skills);
  const queue = useCompass((state) => state.queue);
  const composerSeed = useCompass((state) => state.composerSeed);
  const clearComposerSeed = useCompass((state) => state.clearComposerSeed);
  const send = useCompass((state) => state.send);
  const abort = useCompass((state) => state.abort);
  const openSettings = useCompass((state) => state.openSettings);
  const removeQueuedMessage = useCompass((state) => state.removeQueuedMessage);
  const composerSendKey = useCompass((state) => state.settings?.composerSendKey ?? "enter");

  const [text, setText] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<UiSkill | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [popover, setPopover] = useState<PopoverKind>("none");
  const [contextExpanded, setContextExpanded] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (composerSeed === null) return;
    const invocation = parseSkillInvocation(composerSeed);
    const seededSkill = invocation
      ? skills.find((skill) => skill.name === invocation.name && skill.enabled) ?? null
      : null;
    setSelectedSkill(seededSkill);
    setText(seededSkill && invocation ? invocation.argumentsText : composerSeed);
    clearComposerSeed();
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
  }, [composerSeed, clearComposerSeed, skills]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [text]);

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

  const slashToken = useMemo(() => findSlashToken(text), [text]);
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
      useCompass.getState().setError(t("composer.selectImageFile"));
      return;
    }
    const available = Math.max(0, 8 - attachments.length);
    if (available === 0) {
      useCompass.getState().setError(t("composer.maxImages"));
      return;
    }
    try {
      const next = await Promise.all(imageFiles.slice(0, available).map((file) => readComposerImage(file, t)));
      setAttachments((current) => [...current, ...next].slice(0, 8));
      useCompass.getState().setError(imageFiles.length > available ? t("composer.maxImages") : null);
      setPopover("none");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      useCompass.getState().setError(error instanceof Error ? error.message : String(error));
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>): void => {
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
    const nextText = `${text.slice(0, slashToken.start)}${text.slice(slashToken.end)}`
      .replace(/[ \t]{2,}/g, " ");
    const caret = slashToken.start;
    setSelectedSkill(skills.find((skill) => skill.name === item.name) ?? null);
    setText(nextText);
    setComposerFocused(true);
    setSlashDismissed(true);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  };

  const withdrawQueuedMessage = (kind: QueuedMessageKind, index: number, message: string): void => {
    void removeQueuedMessage(kind, index, message);
  };

  const recallQueuedMessage = (kind: QueuedMessageKind, index: number, message: string): void => {
    void removeQueuedMessage(kind, index, message).then((removed) => {
      if (!removed) return;
      setText((current) => (current.trim() ? `${current.trimEnd()}\n${message}` : message));
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
    if (!trimmed && attachments.length === 0 && !selectedSkill) return;
    if (noModel) {
      useCompass.getState().setError(t("composer.configureModel"));
      return;
    }
    if (attachments.length > 0 && stats?.model && !stats.model.supportsImages) {
      useCompass.getState().setError(t("composer.imageUnsupported"));
      return;
    }

    const draftText = text;
    const draftSkill = selectedSkill;
    const draftAttachments = attachments;
    const images = attachments.map(({ data, mimeType, name }) => ({ data, mimeType, name }));
    useCompass.getState().setError(null);
    setPopover("none");
    setText("");
    setSelectedSkill(null);
    setAttachments([]);
    const promptText = selectedSkill
      ? `/skill:${selectedSkill.name}${trimmed ? ` ${trimmed}` : ""}`
      : trimmed;
    void send(promptText, images).catch(() => {
      setText((current) => current || draftText);
      setSelectedSkill((current) => current ?? draftSkill);
      setAttachments((current) => current.length > 0 ? current : draftAttachments);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
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

          <SelectedSkill skill={selectedSkill} onRemove={() => {
            setSelectedSkill(null);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }} />

          <ComposerAttachments
            attachments={attachments}
            onRemove={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
          />

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            placeholder={streaming ? t("composer.steerPlaceholder") : t("composer.placeholder")}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => {
              setComposerFocused(true);
              setPopover("none");
            }}
            onPointerDown={() => setPopover("none")}
            onBlur={() => setComposerFocused(false)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            spellCheck={false}
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
              <button type="button" className="send-btn" aria-label={t("composer.send")} title={noModel ? t("composer.configureFirst") : t("composer.send")} disabled={(!text.trim() && attachments.length === 0 && !selectedSkill) || noModel} onClick={doSend}>
                <ArrowUp size={19} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
