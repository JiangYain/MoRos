import type { UiImageAttachment, UiSkill, VoiceInputUpdate } from "@shared/types";
import { parseSkillInvocation } from "@shared/skill-display";
import { ArrowUp, Box, Mic, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, isDesktop } from "../ipc";
import { useI18n } from "../i18n";
import { useCompass } from "../store";
import { ActionsMenu } from "./composer/ActionsMenu";
import { ContextUsageSurface, ContextUsageTrigger } from "./composer/ContextUsage";
import { ModelMenu } from "./composer/ModelMenu";
import { PermissionMenu } from "./composer/PermissionMenu";
import { findSlashToken } from "./composer/slash-token";

type PopoverKind = "none" | "actions" | "permissions" | "model";

interface ComposerAttachment extends UiImageAttachment {
  id: string;
}

type DictationPhase = "idle" | "starting" | "listening" | "processing" | "complete";

interface DictationState {
  phase: DictationPhase;
  preview: string;
}

function attachmentId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readImageFile(file: File, t: ReturnType<typeof useI18n>["t"]): Promise<ComposerAttachment> {
  const supported = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
  if (!supported.includes(file.type as (typeof supported)[number])) {
    return Promise.reject(new Error(t("composer.imageOnly")));
  }
  if (file.size > 10 * 1024 * 1024) {
    return Promise.reject(new Error(t("composer.imageTooLarge")));
  }
  return new Promise((resolveImage, rejectImage) => {
    const reader = new FileReader();
    reader.onerror = () => rejectImage(new Error(t("composer.imageReadFailed", { name: file.name || "clipboard image" })));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        rejectImage(new Error(t("composer.imageInvalid")));
        return;
      }
      const comma = reader.result.indexOf(",");
      if (comma < 0) {
        rejectImage(new Error(t("composer.imageInvalid")));
        return;
      }
      resolveImage({
        id: attachmentId(),
        data: reader.result.slice(comma + 1),
        mimeType: file.type as UiImageAttachment["mimeType"],
        name: file.name || "Pasted image",
      });
    };
    reader.readAsDataURL(file);
  });
}

export function Composer({ showQuickPrompts = false }: { showQuickPrompts?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const streaming = useCompass((state) => state.streaming);
  const stats = useCompass((state) => state.stats);
  const skills = useCompass((state) => state.skills);
  const queue = useCompass((state) => state.queue);
  const composerSeed = useCompass((state) => state.composerSeed);
  const clearComposerSeed = useCompass((state) => state.clearComposerSeed);
  const lastError = useCompass((state) => state.lastError);
  const setError = useCompass((state) => state.setError);
  const send = useCompass((state) => state.send);
  const abort = useCompass((state) => state.abort);
  const openSettings = useCompass((state) => state.openSettings);

  const [text, setText] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<UiSkill | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [popover, setPopover] = useState<PopoverKind>("none");
  const [contextExpanded, setContextExpanded] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [dictation, setDictation] = useState<DictationState>({ phase: "idle", preview: "" });
  const [dragActive, setDragActive] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const dictationResetRef = useRef<number | null>(null);

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

  useEffect(() => () => {
    if (dictationResetRef.current !== null) window.clearTimeout(dictationResetRef.current);
  }, []);

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
      setError(t("composer.selectImageFile"));
      return;
    }
    const available = Math.max(0, 8 - attachments.length);
    if (available === 0) {
      setError(t("composer.maxImages"));
      return;
    }
    try {
      const next = await Promise.all(imageFiles.slice(0, available).map((file) => readImageFile(file, t)));
      setAttachments((current) => [...current, ...next].slice(0, 8));
      setError(imageFiles.length > available ? t("composer.maxImages") : null);
      setPopover("none");
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
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

  const applySlash = (item: (typeof slashItems)[number]): void => {
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

  const doSend = (): void => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0 && !selectedSkill) return;
    if (noModel) {
      setError(t("composer.configureModel"));
      return;
    }
    if (attachments.length > 0 && stats?.model && !stats.model.supportsImages) {
      setError(t("composer.imageUnsupported"));
      return;
    }

    const draftText = text;
    const draftSkill = selectedSkill;
    const draftAttachments = attachments;
    const images = attachments.map(({ data, mimeType, name }) => ({ data, mimeType, name }));
    setError(null);
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

  const resetDictationAfter = (delay: number): void => {
    if (dictationResetRef.current !== null) window.clearTimeout(dictationResetRef.current);
    dictationResetRef.current = window.setTimeout(() => {
      dictationResetRef.current = null;
      setDictation({ phase: "idle", preview: "" });
    }, delay);
  };

  const startDictation = (): void => {
    if (dictation.phase !== "idle") return;
    setPopover("none");
    textareaRef.current?.focus();
    setDictation({ phase: "starting", preview: isDesktop ? t("composer.voiceOpening") : t("composer.micConnecting") });
    window.setTimeout(() => {
      const onUpdate = isDesktop
        ? undefined
        : (update: VoiceInputUpdate): void => {
            setDictation({
              phase: update.phase,
              preview: update.interimText || (update.phase === "listening" ? t("composer.voiceListening") : t("composer.voiceProcessingPreview")),
            });
          };
      void api.startDictation(onUpdate)
        .then((result) => {
          if (!result.ok) {
            setError(result.error ?? t("composer.voiceStartFailed"));
            setDictation({ phase: "idle", preview: "" });
            return;
          }
          if (result.text) {
            setText((current) => `${current.trimEnd()}${current.trim() ? " " : ""}${result.text}`);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }
          setDictation({
            phase: "complete",
            preview: isDesktop ? t("composer.voiceOpened") : result.text || t("composer.voiceRecognized"),
          });
          resetDictationAfter(isDesktop ? 1600 : 900);
        })
        .catch((error: unknown) => {
          setError(error instanceof Error ? error.message : String(error));
          setDictation({ phase: "idle", preview: "" });
        });
    }, 120);
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
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      doSend();
      return;
    }
    if (event.key === "Escape" && streaming) {
      event.preventDefault();
      void abort();
    }
  };

  const dictationBusy = dictation.phase !== "idle";
  const dictationLabel = dictation.phase === "starting"
    ? t("composer.voiceStart")
    : dictation.phase === "listening"
      ? t("composer.voiceListening")
      : dictation.phase === "processing"
        ? t("composer.voiceProcessing")
        : t("composer.voiceReady");

  return (
    <div className="composer-zone">
      <AnimatePresence>
        {lastError && (
          <motion.div className="model-banner" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="model-banner-inner error">
              <span>{lastError}</span>
              <button type="button" className="go" onClick={() => setError(null)}>{t("common.close")}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="composer-wrap" ref={rootRef}>
        {(queue.steering.length > 0 || queue.followUp.length > 0) && (
          <div className="queue-chips">
            {queue.steering.map((message, index) => (
              <span className="queue-chip" key={`s-${index}`}><span className="tag">{t("composer.steer")}</span><span className="txt">{message}</span></span>
            ))}
            {queue.followUp.map((message, index) => (
              <span className="queue-chip" key={`f-${index}`}><span className="tag">{t("composer.followUp")}</span><span className="txt">{message}</span></span>
            ))}
          </div>
        )}

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
          <AnimatePresence>
            {popover === "none" && slashMenuOpen && (
              <motion.div className="popover slash-popover" initial={{ opacity: 0, y: 5, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }}>
                <div className="slash-popover-list" role="listbox" aria-label={t("composer.skillCommands")}>
                  {slashItems.map((item, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === slashIndex}
                      key={item.command}
                      className={`popover-item${index === slashIndex ? " hl" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setSlashIndex(index)}
                      onClick={() => applySlash(item)}
                    >
                      <span className="name">{item.command}</span>
                      <span className="desc">{item.description}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input ref={imageInputRef} className="composer-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void addImageFiles(files);
          }} />

          {selectedSkill && (
            <div className="composer-skill-selection" role="group" aria-label={t("composer.selectedSkill")}>
              <span className="composer-skill-chip">
                <Box size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{selectedSkill.name}</span>
              </span>
              <button
                type="button"
                aria-label={t("composer.removeSkill", { name: selectedSkill.name })}
                title={t("composer.removeSkill", { name: selectedSkill.name })}
                onClick={() => {
                  setSelectedSkill(null);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
              >
                <X size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map((image, index) => (
                <div className="composer-attachment" key={image.id}>
                  <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name ?? t("composer.attachment", { number: index + 1 })} />
                  <button type="button" aria-label={t("composer.removeImage", { number: index + 1 })} onClick={() => setAttachments((current) => current.filter((item) => item.id !== image.id))}>
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

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

          <AnimatePresence initial={false}>
            {dictationBusy && (
              <motion.div
                className={`dictation-status ${dictation.phase}`}
                role="status"
                aria-live="polite"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <span className="dictation-wave" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
                </span>
                <span className="dictation-copy">
                  <strong>{dictationLabel}</strong>
                  <small title={dictation.preview}>{dictation.preview}</small>
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="composer-toolbar">
            <ActionsMenu open={popover === "actions"} onAddImage={() => imageInputRef.current?.click()} onClose={() => setPopover("none")} onToggle={() => togglePopover("actions")} />
            <PermissionMenu open={popover === "permissions"} onClose={() => setPopover("none")} onToggle={() => togglePopover("permissions")} />
            <div className="composer-spacer" />
            <ContextUsageTrigger expanded={contextExpanded} onToggle={() => {
              setPopover("none");
              setContextExpanded((current) => !current);
            }} />
            <ModelMenu open={popover === "model"} onClose={() => setPopover("none")} onOpenSettings={() => openSettings("models")} onToggle={() => togglePopover("model")} />
            <button type="button" className={`composer-icon-btn composer-round-btn voice-btn${dictationBusy ? " active launching" : ""}`} aria-label={dictationBusy ? dictationLabel : isDesktop ? t("composer.startDesktopVoice") : t("composer.startBrowserVoice")} aria-pressed={dictationBusy} title={isDesktop ? t("composer.startDesktopVoice") : t("composer.startBrowserVoice")} onClick={startDictation}>
              <Mic size={18} strokeWidth={1.75} />
            </button>
            {streaming && !text.trim() && attachments.length === 0 && !selectedSkill ? (
              <button type="button" className="send-btn stop" aria-label={t("composer.stop")} onClick={() => void abort()}><Square size={13} fill="currentColor" strokeWidth={0} /></button>
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
