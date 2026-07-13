import { motion, useReducedMotion } from "motion/react";
import { useCompass } from "../store";
import { useI18n } from "../i18n";

const CHARS = ["C", "o", "m", "p", "a", "s", "s"];
const CHAR_STAGGER = 0.052;

export function Hero(): React.JSX.Element {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const seedComposer = useCompass((s) => s.seedComposer);
  const suggestions = [t("hero.prompt1"), t("hero.prompt2"), t("hero.prompt3")];

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

        <div className="hero-suggests">
          {suggestions.map((text, index) => (
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
