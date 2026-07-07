import type { ThinkingLevel } from "@shared/types";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCompass } from "../store";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const NO_MODEL_ERROR = "请先在设置中配置 API Key，或切换到已配置的模型。";

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: "关闭",
  minimal: "极简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
};

type PopoverKind = "none" | "model" | "thinking";

export function Composer(): React.JSX.Element {
  const streaming = useCompass((s) => s.streaming);
  const stats = useCompass((s) => s.stats);
  const models = useCompass((s) => s.models);
  const skills = useCompass((s) => s.skills);
  const queue = useCompass((s) => s.queue);
  const composerSeed = useCompass((s) => s.composerSeed);
  const clearComposerSeed = useCompass((s) => s.clearComposerSeed);
  const lastError = useCompass((s) => s.lastError);
  const setError = useCompass((s) => s.setError);
  const send = useCompass((s) => s.send);
  const abort = useCompass((s) => s.abort);
  const setModel = useCompass((s) => s.setModel);
  const setThinkingLevel = useCompass((s) => s.setThinkingLevel);
  const setPanel = useCompass((s) => s.setPanel);

  const [text, setText] = useState("");
  const [popover, setPopover] = useState<PopoverKind>("none");
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // one-shot seed from hero suggestions / skills panel
  useEffect(() => {
    if (composerSeed !== null) {
      setText(composerSeed);
      clearComposerSeed();
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (node) {
          node.focus();
          node.setSelectionRange(node.value.length, node.value.length);
        }
      });
    }
  }, [composerSeed, clearComposerSeed]);

  // autogrow
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 220)}px`;
  }, [text]);

  // click outside closes popovers
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setPopover("none");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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

  const contextPercent = stats?.contextPercent ?? null;
  const noModel = !stats?.model || !stats.modelAuthConfigured;
  const supportsThinking = Boolean(stats?.model?.reasoning);

  const applySlash = (command: string): void => {
    setText(`${command} `);
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
    setText("");
    void send(trimmed);
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ paddingTop: "0.9rem" }}
          >
            <div className="model-banner-inner">
              <span>
                {stats?.model
                  ? `模型 ${stats.model.name} 所属 Provider 尚未配置密钥 — 请在设置中添加 API Key，或切换到已配置的模型。`
                  : "尚未配置推理模型 — 添加任一 Provider 的 API Key 后即可开始对话。"}
              </span>
              <button className="go" onClick={() => setPanel("settings")}>
                打开设置
              </button>
            </div>
          </motion.div>
        )}
        {lastError && (
          <motion.div
            className="model-banner"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ paddingTop: noModel ? 0 : "0.9rem" }}
          >
            <div className="model-banner-inner">
              <span style={{ color: "var(--color-accent)" }}>{lastError}</span>
              <button className="go" onClick={() => setError(null)}>
                知道了
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

        <div className="composer">
          <AnimatePresence>
            {slashItems.length > 0 && (
              <motion.div
                className="popover"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="popover-head micro-label">Skills / 技能命令</div>
                {slashItems.map((item, index) => (
                  <button
                    key={item.command}
                    className={`popover-item${index === slashIndex ? " hl" : ""}`}
                    onMouseEnter={() => setSlashIndex(index)}
                    onClick={() => applySlash(item.command)}
                  >
                    <div className="row-1">
                      <span className="name" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {item.command}
                      </span>
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
            placeholder={
              streaming ? "输入转向指令，Enter 发送（将插入当前任务）…" : "描述主诉、粘贴听力图数据，或输入 / 调用技能…"
            }
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
          />

          <div className="composer-toolbar">
            {/* model picker */}
            <div style={{ position: "relative" }}>
              <button
                className="picker-btn"
                onClick={() => setPopover(popover === "model" ? "none" : "model")}
              >
                Model
                <span className="val">{stats?.model ? stats.model.name : "未配置"}</span>
                <span className="caret-down">▼</span>
              </button>
              <AnimatePresence>
                {popover === "model" && (
                  <motion.div
                    className="popover"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="popover-head micro-label">Models / 可用模型</div>
                    {models.length === 0 && (
                      <div
                        className="popover-item"
                        style={{ color: "var(--color-text-tertiary)", fontSize: 11.5 }}
                      >
                        暂无可用模型，请先在设置中配置 API Key。
                      </div>
                    )}
                    {models.map((model) => {
                      const current =
                        stats?.model?.provider === model.provider && stats.model.id === model.id;
                      return (
                        <button
                          key={`${model.provider}/${model.id}`}
                          className="popover-item"
                          onClick={() => {
                            setPopover("none");
                            void setModel(model.provider, model.id);
                          }}
                        >
                          <div className="row-1">
                            <span className="name">{model.name}</span>
                            {current ? (
                              <span className="check">●</span>
                            ) : (
                              <span className="tag">{model.providerName}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* thinking picker */}
            {supportsThinking && (
              <div style={{ position: "relative" }}>
                <button
                  className="picker-btn"
                  onClick={() => setPopover(popover === "thinking" ? "none" : "thinking")}
                >
                  Thinking
                  <span className="val">{THINKING_LABELS[stats?.thinkingLevel ?? "off"]}</span>
                  <span className="caret-down">▼</span>
                </button>
                <AnimatePresence>
                  {popover === "thinking" && (
                    <motion.div
                      className="popover"
                      style={{ minWidth: 180 }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <div className="popover-head micro-label">思考深度</div>
                      {THINKING_LEVELS.map((level) => (
                        <button
                          key={level}
                          className="popover-item"
                          onClick={() => {
                            setPopover("none");
                            void setThinkingLevel(level);
                          }}
                        >
                          <div className="row-1">
                            <span className="name">{THINKING_LABELS[level]}</span>
                            {stats?.thinkingLevel === level ? (
                              <span className="check">●</span>
                            ) : (
                              <span className="tag">{level}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="composer-spacer" />

            {streaming && !text.trim() ? (
              <button className="send-btn stop" aria-label="停止" onClick={() => void abort()}>
                <svg width="9" height="9" viewBox="0 0 9 9">
                  <rect width="9" height="9" fill="currentColor" />
                </svg>
              </button>
            ) : (
              <button
                className="send-btn"
                aria-label="发送"
                disabled={!text.trim() || noModel}
                onClick={doSend}
              >
                <svg width="11" height="12" viewBox="0 0 11 12">
                  <path
                    d="M5.5 11 V1.5 M1.5 5 L5.5 1 L9.5 5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="composer-hint">
          <span>
            <b>Enter</b> 发送 · <b>Shift+Enter</b> 换行 · <b>/</b> 技能 · <b>Esc</b> 中止
          </span>
          <span>
            5可原则 · 建议经确认后执行
          </span>
        </div>
      </div>

      <StatusLine contextPercent={contextPercent} />
    </div>
  );
}

function StatusLine({ contextPercent }: { contextPercent: number | null }): React.JSX.Element {
  const stats = useCompass((s) => s.stats);
  const streaming = useCompass((s) => s.streaming);
  const percent = contextPercent ?? 0;

  return (
    <div className="statusline">
      <span className="titlebar-state">
        <span className={`state-dot${streaming ? " running" : ""}`} />
        {streaming ? "Agent Running" : "Ready"}
      </span>
      {stats?.model && <b>{stats.model.name}</b>}
      <span className="grow" />
      {stats && stats.contextWindow > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem" }}>
          Context
          <span className="context-bar">
            <span
              className={`fill${percent > 75 ? " high" : ""}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </span>
          {contextPercent !== null ? `${Math.round(percent)}%` : "—"}
        </span>
      )}
      {stats && (stats.tokensIn > 0 || stats.tokensOut > 0) && (
        <span>
          Tokens {formatCount(stats.tokensIn)} ↦ {formatCount(stats.tokensOut)}
        </span>
      )}
      {stats && stats.cost > 0 && <span>${stats.cost.toFixed(4)}</span>}
    </div>
  );
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
