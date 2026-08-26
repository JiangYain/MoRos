import { FolderOpen, Plus, Puzzle, Search, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import { ignoreCommandFailure, useMoros } from "../../store";
import { Toggle } from "../ui/Toggle";

type SkillFilter = "all" | "enabled" | "disabled";

function SkillArtwork(): React.JSX.Element {
  return <Puzzle size={18} strokeWidth={1.55} aria-hidden="true" />;
}

export function SkillsSettings(): React.JSX.Element {
  const { t } = useI18n();
  const skills = useMoros((state) => state.skills);
  const settings = useMoros((state) => state.settings);
  const setSkillEnabled = useMoros((state) => state.setSkillEnabled);
  const addSkillDir = useMoros((state) => state.addSkillDir);
  const removeSkillDir = useMoros((state) => state.removeSkillDir);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SkillFilter>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const enabledCount = skills.filter((skill) => skill.enabled).length;
  const visible = skills.filter((skill) => (!normalizedQuery || `${skill.name} ${skill.description} ${skill.source}`.toLowerCase().includes(normalizedQuery)) && (filter === "all" || (filter === "enabled" ? skill.enabled : !skill.enabled)));
  const filters: Array<{ id: SkillFilter; label: string; count: number }> = [
    { id: "all", label: t("settings.allSkills"), count: skills.length },
    { id: "enabled", label: t("settings.enabledSkills"), count: enabledCount },
    { id: "disabled", label: t("settings.disabledSkills"), count: skills.length - enabledCount },
  ];
  return (
    <div className="settings-page settings-skills-page" id="settings-page-skills">
      <header className="settings-page-head settings-page-head-with-action">
        <div>
          <span className="settings-eyebrow">{t("settings.skillsEyebrow")}</span>
          <h1>{t("settings.nav.skills")}</h1>
          <p>{t("settings.skillsDescription")}</p>
        </div>
        <button type="button" className="settings-small-btn settings-skills-add-button" onClick={() => ignoreCommandFailure(addSkillDir())}>
          <Plus size={13} strokeWidth={1.7} aria-hidden="true" />
          <span>{t("settings.addDirectory")}</span>
        </button>
      </header>
      <div className="settings-skills-search">
        <Search size={15} strokeWidth={1.55} aria-hidden="true" />
        <input value={query} placeholder={t("settings.skillsSearch")} aria-label={t("settings.skillsSearch")} onChange={(event) => setQuery(event.target.value)} />
        {query && (
          <button type="button" aria-label={t("settings.clearSkillsSearch")} title={t("settings.clearSkillsSearch")} onClick={() => setQuery("")}>
            <X size={13} strokeWidth={1.7} aria-hidden="true" />
          </button>
        )}
      </div>
      <section className="settings-skills-installed" aria-labelledby="settings-skills-installed-title">
        <div className="settings-skills-section-heading">
          <h2 id="settings-skills-installed-title">{t("settings.installedSkills")}</h2>
          <span>{t("settings.enabledCount", { count: enabledCount })}</span>
        </div>
        <div className="settings-skills-icon-tray">
          {skills.map((skill) => (
            <span className={`settings-skills-icon-chip${skill.enabled ? "" : " disabled"}`} key={skill.name} role="img" aria-label={skill.name} title={skill.name}>
              <SkillArtwork />
            </span>
          ))}
        </div>
      </section>
      <div className="settings-skills-toolbar">
        <div className="settings-skills-filters" role="group" aria-label={t("settings.skillsFilter")}>
          {filters.map((item) => (
            <button type="button" className={filter === item.id ? "active" : ""} aria-pressed={filter === item.id} key={item.id} onClick={() => setFilter(item.id)}>
              <span>{item.label}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </div>
      </div>
      <section className="settings-skills-catalog" aria-labelledby="settings-skills-catalog-title">
        <div className="settings-skills-section-heading catalog-heading">
          <h2 id="settings-skills-catalog-title">{t("settings.availableSkills")}</h2>
          <span aria-live="polite">{visible.length}</span>
        </div>
        <div className="settings-skill-list" id="settings-skills-list">
          {visible.map((skill) => (
            <article className={`settings-skill-row${skill.enabled ? "" : " disabled"}`} key={skill.name}>
              <div className="settings-skill-icon"><SkillArtwork /></div>
              <div className="settings-skill-copy"><strong>{skill.name}</strong><span>{skill.description}</span><small>{skill.source}</small></div>
              <div className="settings-skill-state">
                <span>{t(skill.enabled ? "settings.skillEnabled" : "settings.skillDisabled")}</span>
                <Toggle ariaLabel={t("settings.skillToggle", { name: skill.name })} on={skill.enabled} onChange={(next) => ignoreCommandFailure(setSkillEnabled(skill.name, next))} />
              </div>
            </article>
          ))}
          {visible.length === 0 && (
            <div className="settings-empty-state settings-skills-empty"><Puzzle size={19} /><strong>{t("settings.noSkills")}</strong></div>
          )}
        </div>
      </section>
      {settings && settings.skillDirs.length > 0 && (
        <section className="settings-section-block settings-skills-directories">
          <div className="settings-skills-section-heading"><h2>{t("settings.additionalDirectories")}</h2><span>{settings.skillDirs.length}</span></div>
          <div className="settings-directory-list">
            {settings.skillDirs.map((dir) => (
              <div className="settings-directory-row" key={dir}>
                <FolderOpen size={15} strokeWidth={1.55} />
                <code>{dir}</code>
                <button type="button" className="settings-text-btn muted" onClick={() => ignoreCommandFailure(removeSkillDir(dir))}>{t("common.remove")}</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
