import { AnimatePresence } from "motion/react";
import { useCompass } from "../store";
import { SettingsPanel } from "./panels/SettingsPanel";
import { SkillsPanel } from "./panels/SkillsPanel";

export function Panels(): React.JSX.Element {
  const panel = useCompass((s) => s.panel);
  const setPanel = useCompass((s) => s.setPanel);
  const close = (): void => setPanel("none");

  return (
    <AnimatePresence>
      {panel === "skills" && <SkillsPanel key="skills" onClose={close} />}
      {panel === "settings" && <SettingsPanel key="settings" onClose={close} />}
    </AnimatePresence>
  );
}
