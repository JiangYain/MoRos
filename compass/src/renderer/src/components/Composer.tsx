import type { ThinkingLevel } from "@shared/types";
import { NO_MODEL_ERROR } from "@shared/messages";
import {
  ArrowUp,
  ChevronDown,
  Folder,
  Mic,
  Plus,
  Settings,
  Sparkles,
  Square,
  SquarePen,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../ipc";
import { useCompass } from "../store";

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: "关闭",
  minimal: "极简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
  max: "最高",
};

type PopoverKind = "none" | "actions" | "model" | "context";

function workspaceName(path: string | undefined): string {
  const parts = path?.split(/[\\/]/).filter(Boolean) ?? [];
  return parts.at(-1) ?? "选择工作区";
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function Composer(): React.JSX.Element {
  const streaming = useCompass((state) => state.streaming);
  const stats = useCompass((state) => state.stats);
  const settings = useCompass((state) => state.settings);
  const models = useCompass((state) => state.models);
  const skills = useCompass((state) => state.skills);
  const queue = useCompass((state) => state.queue);
  const composerSeed = useCompass((state) => state.composerSeed);
  const clearComposerSeed = useCompass((state) => state.clearComposerSeed);
  const lastError = useCompass((state) => state.lastError);
  const setError = useCompass((state) => state.setError);
  const send = useCompass((state) => state.send);
  const abort = useCompass((state) => state.abort);
  const newSession = useCompass((state) => state.newSession);
  const setModel = useCompass((state) => state.setModel);
  const setThinkingLevel = useCompass((state) => state.setThinkingLevel);
  const setWorkspaceDir = useCompass((state) => state.setWorkspaceDir);
  const setPanel = useCompass((state) => state.setPanel);

  const [text, setText] = useState("");
  const [popover, setPopover] = useState<PopoverKind>("none");
  const [slashIndex, setSlashIndex] = useState(0);
  const [dictationBusy, setDictationBusy] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setPopover("none");
        setComposerFocused(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && popover !== "none") setPopover("none");
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [popover]);

  const slashQuery = useMemo(() => {
    const match = /^\/(\S*)$/.exec(text);
    return match ? match[1].toLowerCase() : null;
  }, [text]);

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

  useEffect(() => setSlashIndex(0), [slashQuery]);

  const noModel = !stats?.model || !stats.modelAuthConfigured;
  const thinkingLevels = stats?.model?.thinkingLevels ?? [];
  const supportsThinking = thinkingLevels.some((level) => level !== "off");
  const rawContextPercent = stats?.contextPercent;
  const contextPercent = Math.min(100, Math.max(0, rawContextPercent ?? 0));
  const contextKnown = rawContextPercent !== null && rawContextPercent !== undefined;
  const contextTokens = stats?.contextTokens ?? 0;
  const contextWindow = stats?.contextWindow ?? 0;
  const contextRemaining = Math.max(0, contextWindow - contextTokens);

  const togglePopover = (next: Exclude<PopoverKind, "none">): void => {
    setPopover((current) => (current === next ? "none" : next));
  };

  const applySlash = (command: string): void => {
    setText(`${command} `);
    setComposerFocused(true);
    textareaRef.current?.focus();
  };

  const doSend = (): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (noModel) {
      setError(NO_MODEL_ERROR);
      return;
    }
    setError(null);
    setPopover("none");
    setText("");
    void send(trimmed);
  };

  const startDictation = (): void => {
    if (dictationBusy) return;
    setPopover("none");
    textareaRef.current?.focus();
    setDictationBusy(true);
    window.setTimeout(() => {
      void api
        .startDictation()
        .then((result) => {
          if (!result.ok) setError(result.error ?? "无法启动语音输入");
        })
        .catch((error: unknown) => {
          setError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          window.setTimeout(() => setDictationBusy(false), 650);
        });
    }, 120);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashItems.length > 0) {
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
        applySlash(slashItems[slashIndex].command);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setText("");
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

  return (
    <div className="composer-zone">
      <AnimatePresence>
        {noModel && (
          <motion.div
            className="model-banner"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="model-banner-inner">
              <span>{stats?.model ? "当前模型尚未配置凭据。" : "配置模型后即可开始对话。"}</span>
              <button type="button" className="go" onClick={() => setPanel("settings")}>
                打开设置
              </button>
            </div>
          </motion.div>
        )}
        {lastError && (
          <motion.div
            className="model-banner"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="model-banner-inner error">
              <span>{lastError}</span>
              <button type="button" className="go" onClick={() => setError(null)}>
                关闭
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="composer-wrap" ref={rootRef}>
        {(queue.steering.length > 0 || queue.followUp.length > 0) && (
          <div className="queue-chips">
            {queue.steering.map((message, index) => (
              <span className="queue-chip" key={`s-${index}`}>
                <span className="tag">转向</span>
                <span className="txt">{message}</span>
              </span>
            ))}
            {queue.followUp.map((message, index) => (
              <span className="queue-chip" key={`f-${index}`}>
                <span className="tag">追问</span>
                <span className="txt">{message}</span>
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          className="workspace-tab"
          title={settings?.workspaceDir}
          onClick={() => {
            if (settings?.workspaceDir) void api.openPath(settings.workspaceDir);
          }}
        >
          <Folder size={15} strokeWidth={1.6} />
          <span>{workspaceName(settings?.workspaceDir)}</span>
        </button>

        <div className="composer">
          <AnimatePresence>
            {composerFocused && popover === "none" && slashItems.length > 0 && (
              <motion.div
                className="popover slash-popover"
                initial={{ opacity: 0, y: 5, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.99 }}
              >
                <div className="popover-head">技能命令</div>
                {slashItems.map((item, index) => (
                  <button
                    type="button"
                    key={item.command}
                    className={`popover-item${index === slashIndex ? " hl" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setSlashIndex(index)}
                    onClick={() => applySlash(item.command)}
                  >
                    <div className="row-1">
                      <span className="name">{item.command}</span>
                      <span className="tag">Skill</span>
                    </div>
                    <div className="desc">{item.description}</div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            placeholder={streaming ? "输入一条转向指令…" : "描述主诉、粘贴听力图，或让 Compass 执行任务"}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />

          <div className="composer-toolbar">
            <div className="toolbar-anchor">
              <button
                type="button"
                className={`composer-icon-btn${popover === "actions" ? " active" : ""}`}
                aria-label="更多操作"
                aria-expanded={popover === "actions"}
                onClick={() => togglePopover("actions")}
              >
                <Plus size={19} strokeWidth={1.65} />
              </button>
              <AnimatePresence>
                {popover === "actions" && (
                  <motion.div
                    className="popover action-popover"
                    initial={{ opacity: 0, y: 5, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.99 }}
                  >
                    <button
                      type="button"
                      className="menu-action"
                      onClick={() => {
                        setPopover("none");
                        void newSession();
                      }}
                    >
                      <SquarePen size={16} strokeWidth={1.6} />
                      新对话
                    </button>
                    <button
                      type="button"
                      className="menu-action"
                      onClick={() => {
                        setPopover("none");
                        setPanel("skills");
                      }}
                    >
                      <Sparkles size={16} strokeWidth={1.6} />
                      技能库
                    </button>
                    <button
                      type="button"
                      className="menu-action"
                      onClick={() => {
                        setPopover("none");
                        void setWorkspaceDir();
                      }}
                    >
                      <Folder size={16} strokeWidth={1.6} />
                      更换工作区
                    </button>
                    <button
                      type="button"
                      className="menu-action"
                      onClick={() => {
                        setPopover("none");
                        setPanel("settings");
                      }}
                    >
                      <Settings size={16} strokeWidth={1.6} />
                      设置
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="composer-spacer" />

            <div className="toolbar-anchor model-anchor">
              <button
                type="button"
                className={`model-pill${popover === "model" ? " active" : ""}`}
                aria-expanded={popover === "model"}
                onClick={() => togglePopover("model")}
              >
                <span className="model-pill-name">{stats?.model?.name ?? "选择模型"}</span>
                {supportsThinking && (
                  <span className="model-pill-thinking">
                    {THINKING_LABELS[stats?.thinkingLevel ?? "off"]}
                  </span>
                )}
                <ChevronDown size={14} strokeWidth={1.6} />
              </button>
              <AnimatePresence>
                {popover === "model" && (
                  <motion.div
                    className="popover model-popover"
                    initial={{ opacity: 0, y: 5, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.99 }}
                  >
                    <div className="popover-head">可用模型</div>
                    <div className="model-list">
                      {models.length === 0 && <div className="popover-empty">请先在设置中配置模型凭据。</div>}
                      {models.map((model) => {
                        const current =
                          stats?.model?.provider === model.provider && stats.model.id === model.id;
                        return (
                          <button
                            type="button"
                            key={`${model.provider}/${model.id}`}
                            className="popover-item"
                            onClick={() => {
                              setPopover("none");
                              void setModel(model.provider, model.id);
                            }}
                          >
                            <div className="row-1">
                              <span className="name">{model.name}</span>
                              <span className={current ? "check" : "tag"}>
                                {current ? "✓" : model.providerName}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {supportsThinking && (
                      <div className="thinking-section">
                        <div className="popover-head">思考深度</div>
                        <div className="thinking-options">
                          {thinkingLevels.map((level) => (
                            <button
                              type="button"
                              key={level}
                              data-thinking-level={level}
                              className={stats?.thinkingLevel === level ? "active" : ""}
                              onClick={() => void setThinkingLevel(level)}
                            >
                              {THINKING_LABELS[level]}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="toolbar-anchor context-anchor">
              <button
                type="button"
                className={`context-trigger${popover === "context" ? " active" : ""}${contextPercent > 75 ? " high" : ""}`}
                aria-label={contextKnown ? `上下文已使用 ${Math.round(contextPercent)}%` : "上下文用量未知"}
                aria-expanded={popover === "context"}
                title={contextKnown ? `Context ${Math.round(contextPercent)}%` : "Context —"}
                onClick={() => togglePopover("context")}
              >
                <svg viewBox="0 0 28 28" aria-hidden="true">
                  <circle className="context-track" cx="14" cy="14" r="10.5" />
                  {contextKnown && (
                    <circle
                      className="context-progress"
                      cx="14"
                      cy="14"
                      r="10.5"
                      pathLength="100"
                      strokeDasharray="100"
                      strokeDashoffset={100 - contextPercent}
                    />
                  )}
                </svg>
                <span>{contextKnown ? Math.round(contextPercent) : "–"}</span>
              </button>
              <AnimatePresence>
                {popover === "context" && (
                  <motion.div
                    className="popover context-popover"
                    initial={{ opacity: 0, y: 5, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.99 }}
                  >
                    <div className="context-summary">
                      <div className={`context-large-ring${contextPercent > 75 ? " high" : ""}`}>
                        <svg viewBox="0 0 56 56" aria-hidden="true">
                          <circle className="context-track" cx="28" cy="28" r="21" />
                          {contextKnown && (
                            <circle
                              className="context-progress"
                              cx="28"
                              cy="28"
                              r="21"
                              pathLength="100"
                              strokeDasharray="100"
                              strokeDashoffset={100 - contextPercent}
                            />
                          )}
                        </svg>
                        <b>{contextKnown ? `${Math.round(contextPercent)}%` : "—"}</b>
                      </div>
                      <div>
                        <span>当前上下文</span>
                        <b>{formatCount(contextTokens)} / {formatCount(contextWindow)}</b>
                        <small>剩余 {formatCount(contextRemaining)} tokens</small>
                      </div>
                    </div>
                    <div className="context-detail-grid">
                      <div><span>Input</span><b>{formatCount(stats?.tokensIn ?? 0)}</b></div>
                      <div><span>Output</span><b>{formatCount(stats?.tokensOut ?? 0)}</b></div>
                      <div><span>Cost</span><b>${(stats?.cost ?? 0).toFixed(4)}</b></div>
                      <div><span>Window</span><b>{formatCount(contextWindow)}</b></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              className={`composer-icon-btn voice-btn${dictationBusy ? " active launching" : ""}`}
              aria-label="启动 Windows 语音输入"
              title="语音输入（Windows Win+H）"
              onClick={startDictation}
            >
              <Mic size={18} strokeWidth={1.75} />
            </button>

            {streaming && !text.trim() ? (
              <button type="button" className="send-btn stop" aria-label="停止" onClick={() => void abort()}>
                <Square size={13} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button
                type="button"
                className="send-btn"
                aria-label="发送"
                title={noModel ? "请先配置模型" : "发送"}
                disabled={!text.trim() || noModel}
                onClick={doSend}
              >
                <ArrowUp size={19} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
