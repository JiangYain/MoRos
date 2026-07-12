import type { UiImageAttachment, VoiceInputUpdate } from "@shared/types";
import { NO_MODEL_ERROR } from "@shared/messages";
import { ArrowUp, Mic, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, isDesktop } from "../ipc";
import { useCompass } from "../store";
import { ActionsMenu } from "./composer/ActionsMenu";
import { ContextUsageSurface, ContextUsageTrigger } from "./composer/ContextUsage";
import { ModelMenu } from "./composer/ModelMenu";
import { PermissionMenu } from "./composer/PermissionMenu";
import { findSlashToken, replaceSlashToken } from "./composer/slash-token";

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

function readImageFile(file: File): Promise<ComposerAttachment> {
  const supported = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
  if (!supported.includes(file.type as (typeof supported)[number])) {
    return Promise.reject(new Error("仅支持 PNG、JPEG、WebP 与 GIF 图片。"));
  }
  if (file.size > 10 * 1024 * 1024) {
    return Promise.reject(new Error("单张图片不能超过 10 MB。"));
  }
  return new Promise((resolveImage, rejectImage) => {
    const reader = new FileReader();
    reader.onerror = () => rejectImage(new Error(`无法读取图片：${file.name || "clipboard image"}`));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        rejectImage(new Error("图片数据无效。"));
        return;
      }
      const comma = reader.result.indexOf(",");
      if (comma < 0) {
        rejectImage(new Error("图片数据无效。"));
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

export function Composer(): React.JSX.Element {
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
    setText(composerSeed);
    clearComposerSeed();
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
  }, [composerSeed, clearComposerSeed]);

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
      setError("请选择图片文件。");
      return;
    }
    const available = Math.max(0, 8 - attachments.length);
    if (available === 0) {
      setError("一次最多附加 8 张图片。");
      return;
    }
    try {
      const next = await Promise.all(imageFiles.slice(0, available).map(readImageFile));
      setAttachments((current) => [...current, ...next].slice(0, 8));
      setError(imageFiles.length > available ? "一次最多附加 8 张图片。" : null);
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

  const applySlash = (command: string): void => {
    if (!slashToken) return;
    const nextText = replaceSlashToken(text, slashToken, command);
    const caret = slashToken.start + command.length + 1;
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
    if (!trimmed && attachments.length === 0) return;
    if (noModel) {
      setError(NO_MODEL_ERROR);
      return;
    }
    if (attachments.length > 0 && stats?.model && !stats.model.supportsImages) {
      setError("当前模型不支持图像输入，请先切换到支持视觉的模型。");
      return;
    }

    const draftText = text;
    const draftAttachments = attachments;
    const images = attachments.map(({ data, mimeType, name }) => ({ data, mimeType, name }));
    setError(null);
    setPopover("none");
    setText("");
    setAttachments([]);
    void send(trimmed, images).catch(() => {
      setText((current) => current || draftText);
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
    setDictation({ phase: "starting", preview: isDesktop ? "正在打开 Windows 语音输入…" : "正在连接麦克风…" });
    window.setTimeout(() => {
      const onUpdate = isDesktop
        ? undefined
        : (update: VoiceInputUpdate): void => {
            setDictation({
              phase: update.phase,
              preview: update.interimText || (update.phase === "listening" ? "正在倾听…" : "正在处理语音…"),
            });
          };
      void api.startDictation(onUpdate)
        .then((result) => {
          if (!result.ok) {
            setError(result.error ?? "无法启动语音输入");
            setDictation({ phase: "idle", preview: "" });
            return;
          }
          if (result.text) {
            setText((current) => `${current.trimEnd()}${current.trim() ? " " : ""}${result.text}`);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }
          setDictation({
            phase: "complete",
            preview: isDesktop ? "Windows 语音输入已打开" : result.text || "语音已识别",
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
      if (event.key === "Tab") {
        event.preventDefault();
        applySlash(slashItems[slashIndex].command);
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
    ? "准备语音输入"
    : dictation.phase === "listening"
      ? "正在倾听"
      : dictation.phase === "processing"
        ? "正在识别"
        : "语音输入已就绪";

  return (
    <div className="composer-zone">
      <AnimatePresence>
        {noModel && (
          <motion.div className="model-banner" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="model-banner-inner">
              <span>{stats?.model ? "当前模型尚未配置凭据。" : "配置模型后即可开始对话。"}</span>
              <button type="button" className="go" onClick={() => openSettings()}>打开设置</button>
            </div>
          </motion.div>
        )}
        {lastError && (
          <motion.div className="model-banner" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="model-banner-inner error">
              <span>{lastError}</span>
              <button type="button" className="go" onClick={() => setError(null)}>关闭</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="composer-wrap" ref={rootRef}>
        {(queue.steering.length > 0 || queue.followUp.length > 0) && (
          <div className="queue-chips">
            {queue.steering.map((message, index) => (
              <span className="queue-chip" key={`s-${index}`}><span className="tag">转向</span><span className="txt">{message}</span></span>
            ))}
            {queue.followUp.map((message, index) => (
              <span className="queue-chip" key={`f-${index}`}><span className="tag">追问</span><span className="txt">{message}</span></span>
            ))}
          </div>
        )}

        <ContextUsageSurface expanded={contextExpanded} onClose={() => setContextExpanded(false)} />

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
                <span>释放以附加图片</span>
                <small>PNG、JPEG、WebP 或 GIF · 单张不超过 10 MB</small>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {popover === "none" && slashMenuOpen && (
              <motion.div className="popover slash-popover" initial={{ opacity: 0, y: 5, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }}>
                <div className="slash-popover-list" role="listbox" aria-label="技能命令">
                  {slashItems.map((item, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === slashIndex}
                      key={item.command}
                      className={`popover-item${index === slashIndex ? " hl" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setSlashIndex(index)}
                      onClick={() => applySlash(item.command)}
                    >
                      <span className="name">{item.command}</span>
                      <span className="desc">{item.description}</span>
                    </button>
                  ))}
                </div>
                <div className="slash-popover-hint">Tab 选择&nbsp;&nbsp;·&nbsp;&nbsp;Shift ↵ 换行</div>
              </motion.div>
            )}
          </AnimatePresence>

          <input ref={imageInputRef} className="composer-image-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void addImageFiles(files);
          }} />

          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map((image, index) => (
                <div className="composer-attachment" key={image.id}>
                  <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name ?? `Attachment ${index + 1}`} />
                  <button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => setAttachments((current) => current.filter((item) => item.id !== image.id))}>
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
            placeholder={streaming ? "输入一条转向指令…" : "描述主诉、粘贴听力图，或让 Compass 执行任务"}
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
            <ModelMenu open={popover === "model"} onClose={() => setPopover("none")} onOpenSettings={() => openSettings("models")} onToggle={() => togglePopover("model")} />
            <ContextUsageTrigger expanded={contextExpanded} onToggle={() => {
              setPopover("none");
              setContextExpanded((current) => !current);
            }} />
            <button type="button" className={`composer-icon-btn composer-round-btn voice-btn${dictationBusy ? " active launching" : ""}`} aria-label={dictationBusy ? dictationLabel : isDesktop ? "启动 Windows 语音输入" : "启动浏览器语音输入"} aria-pressed={dictationBusy} title={isDesktop ? "语音输入（Windows Win+H）" : "语音输入（浏览器麦克风）"} onClick={startDictation}>
              <Mic size={18} strokeWidth={1.75} />
            </button>
            {streaming && !text.trim() && attachments.length === 0 ? (
              <button type="button" className="send-btn stop" aria-label="停止" onClick={() => void abort()}><Square size={13} fill="currentColor" strokeWidth={0} /></button>
            ) : (
              <button type="button" className="send-btn" aria-label="发送" title={noModel ? "请先配置模型" : "发送"} disabled={(!text.trim() && attachments.length === 0) || noModel} onClick={doSend}>
                <ArrowUp size={19} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
