import type { LoadSkillsResult, Skill } from "@earendil-works/pi-coding-agent";
import type { UiSkill } from "../shared/types.ts";
import {
  discoverSkillSources,
  skillDirectoryKey,
  type DiscoveredSkillSource,
  type SkillDiscoveryOptions,
} from "./skills.ts";

interface SkillCatalogOptions extends SkillDiscoveryOptions {
  disabledNames: readonly string[];
}

export class SkillCatalog {
  readonly paths: string[];
  private readonly origins: Map<string, DiscoveredSkillSource>;
  private readonly disabled: Set<string>;
  private allSkills: Skill[] = [];

  constructor(options: SkillCatalogOptions) {
    const sources = discoverSkillSources(options);
    this.paths = sources.map(({ directory }) => directory);
    this.origins = new Map(sources.map((source) => [skillDirectoryKey(source.directory), source]));
    this.disabled = new Set(options.disabledNames);
  }

  apply(result: LoadSkillsResult): LoadSkillsResult {
    this.allSkills = result.skills;
    return {
      skills: result.skills.filter((skill) => !this.disabled.has(skill.name)),
      diagnostics: result.diagnostics,
    };
  }

  list(): UiSkill[] {
    const visible: UiSkill[] = this.allSkills.map((skill) => {
      const origin = this.origins.get(skillDirectoryKey(skill.baseDir));
      const nativeScope = skill.sourceInfo.scope;
      return {
        name: skill.name,
        description: skill.description,
        filePath: skill.filePath,
        baseDir: skill.baseDir,
        source: origin?.source ?? (skill.sourceInfo.source === "local" ? "Pi" : skill.sourceInfo.source),
        scope: origin?.scope ?? (nativeScope === "temporary" ? "custom" : nativeScope),
        enabled: !this.disabled.has(skill.name),
        manualOnly: skill.disableModelInvocation,
      };
    });
    const known = new Set(visible.map((skill) => skill.name));
    for (const name of this.disabled) {
      if (!known.has(name)) {
        visible.push({ name, description: "", filePath: "", baseDir: "", source: "disabled", enabled: false });
      }
    }
    return visible.sort((a, b) => a.name.localeCompare(b.name));
  }
}
