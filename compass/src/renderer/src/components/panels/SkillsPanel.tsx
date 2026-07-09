import { api } from "../../ipc";
import { useCompass } from "../../store";
import { PanelShell } from "./PanelShell";
import { Toggle } from "./Toggle";

export function SkillsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const skills = useCompass((s) => s.skills);
  const settings = useCompass((s) => s.settings);
  const setSkillEnabled = useCompass((s) => s.setSkillEnabled);
  const addSkillDir = useCompass((s) => s.addSkillDir);
  const removeSkillDir = useCompass((s) => s.removeSkillDir);
  const seedComposer = useCompass((s) => s.seedComposer);

  return (
    <PanelShell title="技能库" tagline="Skills / Agent Capabilities" onClose={onClose}>
      <div className="panel-section">
        <div className="panel-section-head">
          <span className="micro-label">已发现 {skills.length} 项技能</span>
          <button className="hair-btn" onClick={() => void addSkillDir()}>
            + 添加目录
          </button>
        </div>
        {skills.map((skill) => (
          <div key={skill.name} className={`skill-card${skill.enabled ? "" : " off"}`}>
            <div className="row-1">
              <span className="name">{skill.name}</span>
              <Toggle on={skill.enabled} onChange={(next) => void setSkillEnabled(skill.name, next)} />
            </div>
            <div className="desc">{skill.description}</div>
            <div className="foot">
              <span className="src">{skill.source}</span>
              {skill.filePath && (
                <button className="link-btn" onClick={() => void api.openPath(skill.baseDir)}>
                  打开目录
                </button>
              )}
              {skill.enabled && (
                <button
                  className="link-btn"
                  onClick={() => seedComposer(`/skill:${skill.name} `)}
                >
                  插入命令
                </button>
              )}
            </div>
          </div>
        ))}
        {skills.length === 0 && (
          <div className="session-empty" style={{ border: "0.5px solid var(--color-border)" }}>
            未发现技能。将包含 SKILL.md 的目录放入工作目录，或点击「添加目录」。
          </div>
        )}
      </div>

      {settings && settings.skillDirs.length > 0 && (
        <div className="panel-section">
          <span className="micro-label">额外技能目录</span>
          {settings.skillDirs.map((dir) => (
            <div key={dir} className="dir-row">
              <span className="path">{dir}</span>
              <button className="link-btn" onClick={() => void removeSkillDir(dir)}>
                移除
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
