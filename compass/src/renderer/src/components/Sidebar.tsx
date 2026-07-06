import { motion, useReducedMotion } from "motion/react";
import { useCompass } from "../store";

function formatWhen(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function Sidebar(): React.JSX.Element {
  const sessions = useCompass((s) => s.sessions);
  const stats = useCompass((s) => s.stats);
  const skills = useCompass((s) => s.skills);
  const newSession = useCompass((s) => s.newSession);
  const openSession = useCompass((s) => s.openSession);
  const setPanel = useCompass((s) => s.setPanel);
  const reduced = useReducedMotion();

  const enabledSkills = skills.filter((skill) => skill.enabled).length;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="micro-label">Sessions / 会话</span>
        <span className="micro-label serif" style={{ fontStyle: "italic", letterSpacing: 0 }}>
          {sessions.length}
        </span>
      </div>

      <button className="new-session-btn" onClick={() => void newSession()}>
        <span className="plus">+</span> 新建会话
      </button>

      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="session-empty">
            尚无历史会话。
            <br />
            开始第一次验配对话后，会话将自动保存在此处。
          </div>
        ) : (
          sessions.map((session, index) => {
            const active = stats?.sessionId === session.id;
            const title = session.name?.trim() || session.firstMessage.trim() || "未命名会话";
            return (
              <motion.button
                key={session.path}
                className={`session-item${active ? " active" : ""}`}
                onClick={() => void openSession(session.path)}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay: Math.min(index * 0.03, 0.3),
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="title">{title}</div>
                <div className="meta">
                  {formatWhen(session.modifiedAt)} · {session.messageCount} 条消息
                </div>
              </motion.button>
            );
          })
        )}
      </div>

      <div className="sidebar-foot">
        <button className="sidebar-foot-btn" onClick={() => setPanel("skills")}>
          Skills <span className="count">{enabledSkills}</span>
        </button>
        <button className="sidebar-foot-btn" onClick={() => setPanel("settings")}>
          Settings
        </button>
      </div>
    </aside>
  );
}
