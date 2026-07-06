import { motion, useReducedMotion } from "motion/react";
import { useCompass } from "../store";
import { CompassLogo } from "./CompassLogo";

const CHARS = ["C", "o", "m", "p", "a", "s", "s"];
const CHAR_STAGGER = 0.052;

const SUGGESTIONS = [
  "打开 Phonak Target，等待主窗口就绪并完成桌面布局",
  "为顾客录入双耳听力图：右耳 250=40 500=45 1k=50 2k=60 4k=70，左耳形态相近",
  "顾客反馈「自己说话像在瓮里、环境声太吵」，请给出可解释的调参建议",
];

export function Hero(): React.JSX.Element {
  const reduced = useReducedMotion();
  const skills = useCompass((s) => s.skills);
  const stats = useCompass((s) => s.stats);
  const seedComposer = useCompass((s) => s.seedComposer);

  const enabledSkills = skills.filter((skill) => skill.enabled);
  const dotDelay = CHARS.length * CHAR_STAGGER + 0.12;

  const fadeUp = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 18, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.68, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="hero">
      <div className="hero-inner">
        <motion.div className="hero-mark-row" {...fadeUp(0.05)}>
          <CompassLogo size={30} />
          <span className="micro-label" style={{ letterSpacing: "0.2em" }}>
            AI-Assisted Hearing Aid Fitting / 智能验配辅助决策系统
          </span>
        </motion.div>

        <h1 className="hero-title" aria-label="Compass.">
          {/* echo 残影共振 */}
          {!reduced && (
            <motion.span
              className="echo"
              aria-hidden
              initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
              animate={{
                opacity: [0, 0.55, 0],
                x: [0, 3, 1],
                y: [0, -2.4, -0.8],
                scale: [1, 1.012, 1.003],
              }}
              transition={{
                delay: 2.4,
                duration: 2.6,
                times: [0, 0.45, 1],
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 5.2,
              }}
            >
              Compass.
            </motion.span>
          )}
          {CHARS.map((char, index) => (
            <motion.span
              key={index}
              className="char"
              initial={
                reduced ? false : { opacity: 0, y: "0.58em", rotateX: 68, filter: "blur(10px)" }
              }
              animate={{ opacity: 1, y: "0em", rotateX: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.88,
                delay: index * CHAR_STAGGER,
                ease: [0.19, 1, 0.22, 1],
              }}
            >
              {char}
            </motion.span>
          ))}
          <motion.span
            className="dot"
            initial={
              reduced ? false : { opacity: 0, y: "0.34em", scale: 0.22, rotate: -22, filter: "blur(6px)" }
            }
            animate={{ opacity: 1, y: "0em", scale: 1, rotate: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.68, delay: dotDelay, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {reduced ? (
              "."
            ) : (
              <motion.span
                style={{ display: "inline-block", transformOrigin: "50% 82%" }}
                animate={{ scale: [1, 1.09, 1] }}
                transition={{
                  delay: 2.9,
                  duration: 1.9,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 5.9,
                }}
              >
                .
              </motion.span>
            )}
          </motion.span>
        </h1>

        <motion.div className="hero-sub" style={{ marginTop: "1.5rem" }} {...fadeUp(0.62)}>
          把听力数据与主观主诉，转化为可解释、可确认、可执行、
          <br />
          可验证、可记录的验配决策。
        </motion.div>

        <motion.table className="hero-spec" {...fadeUp(0.78)}>
          <tbody>
            <tr>
              <td>Core Engine</td>
              <td>Pi Agent Runtime + Audiology Knowledge</td>
            </tr>
            <tr>
              <td>Loaded Skills</td>
              <td>
                {enabledSkills.length > 0 ? (
                  <>
                    {enabledSkills
                      .slice(0, 3)
                      .map((skill) => skill.name)
                      .join(" · ")}
                    {enabledSkills.length > 3 ? ` 等 ${enabledSkills.length} 项` : ""}
                  </>
                ) : (
                  "未发现技能"
                )}
              </td>
            </tr>
            <tr>
              <td>Active Model</td>
              <td>
                {stats?.model
                  ? `${stats.model.name}${stats.modelAuthConfigured ? "" : "（待配置 API Key）"}`
                  : "未配置 — 请在设置中添加 API Key"}
              </td>
            </tr>
            <tr>
              <td>Design Philosophy</td>
              <td>可解释 · 可确认 · 可执行 · 可验证 · 可记录</td>
            </tr>
          </tbody>
        </motion.table>

        <div className="hero-suggests">
          {SUGGESTIONS.map((text, index) => (
            <motion.button
              key={index}
              className="suggest-btn"
              onClick={() => seedComposer(text)}
              {...fadeUp(0.95 + index * 0.09)}
            >
              <span className="idx">{String(index + 1).padStart(2, "0")}</span>
              <span>{text}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
