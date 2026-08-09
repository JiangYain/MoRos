import { ChevronDown, FolderOpen, Gauge, Settings, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { ignoreCommandFailure, useCompass } from "../../store";
import { ProfileAvatar } from "../ProfileAvatar";

export function SidebarProfile({ closeMobileSidebar }: { closeMobileSidebar: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const settings = useCompass((state) => state.settings);
  const skills = useCompass((state) => state.skills);
  const stats = useCompass((state) => state.stats);
  const profileName = useCompass((state) => state.profileName);
  const profileHandle = useCompass((state) => state.profileHandle);
  const openPath = useCompass((state) => state.openPath);
  const openSettings = useCompass((state) => state.openSettings);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName = profileName || t("settings.profile");
  const contextPercent = stats?.contextPercent == null ? null : Math.round(stats.contextPercent);
  const enabledSkills = skills.filter((skill) => skill.enabled).length;

  useEffect(() => {
    const closeOutside = (event: MouseEvent): void => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false); };
    const closeWithEscape = (event: KeyboardEvent): void => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeWithEscape); };
  }, []);

  const navigate = (target?: "profile" | "skills"): void => {
    setOpen(false);
    closeMobileSidebar();
    openSettings(target);
  };
  return (
    <div className="profile-shell" ref={rootRef}>
      <AnimatePresence>
        {open && (
          <motion.div className="profile-menu" initial={{ opacity: 0, y: 8, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.985 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
            <button type="button" className="profile-menu-head profile-menu-head-button" aria-label={t("sidebar.openProfile")} onClick={() => navigate("profile")}><ProfileAvatar className="large" /><span><b>{displayName}</b>{profileHandle && <small>@{profileHandle}</small>}</span></button>
            <div className="profile-menu-rule" />
            <div className="profile-usage"><Gauge size={15} strokeWidth={1.6} /><span>{t("sidebar.contextUsage")}</span><b>{contextPercent === null ? "—" : `${contextPercent}%`}</b></div>
            <button type="button" onClick={() => { setOpen(false); closeMobileSidebar(); if (settings?.workspaceDir) ignoreCommandFailure(openPath(settings.workspaceDir)); }}><FolderOpen size={15} strokeWidth={1.6} /><span>{t("sidebar.openWorkspace")}</span></button>
            <button type="button" onClick={() => navigate("skills")}><Sparkles size={15} strokeWidth={1.6} /><span>{t("sidebar.skillLibrary")}</span><small>{enabledSkills}</small></button>
            <button type="button" onClick={() => navigate()}><Settings size={15} strokeWidth={1.6} /><span>{t("sidebar.settings")}</span><small>Ctrl+,</small></button>
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" className="user-profile" aria-label={displayName} aria-expanded={open} onClick={() => setOpen((current) => !current)}><ProfileAvatar /><span className="user-name">{displayName}</span><ChevronDown className={open ? "open" : ""} size={14} strokeWidth={1.6} aria-hidden="true" /></button>
    </div>
  );
}
