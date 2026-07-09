import { motion } from "motion/react";

export function PanelShell({
  title,
  tagline,
  onClose,
  children,
}: {
  title: string;
  tagline: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <motion.div
        className="panel-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      />
      <motion.aside
        className="panel"
        initial={{ x: "104%" }}
        animate={{ x: 0 }}
        exit={{ x: "104%" }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="panel-head">
          <div className="panel-title">
            <span>{tagline}</span>
            {title}
          </div>
          <button className="panel-close" onClick={onClose}>
            关闭 Esc
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </motion.aside>
    </>
  );
}
