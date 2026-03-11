import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { ensureDataDir } from './fileSystem.js'

type SkillPresetDefinition = {
  id: string
  name: string
  description: string
  folderName: string
  templateDirName: string
}

type SkillPresetListItem = {
  id: string
  name: string
  description: string
  folderName: string
  installed: boolean
  path: string
}

type SkillPresetInstallResult = {
  id: string
  name: string
  folderName: string
  path: string
  alreadyInstalled: boolean
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = path.join(process.cwd(), 'markov-data')
const SKILLS_ROOT = path.join(DATA_DIR, 'skills')

const BUILTIN_SKILLS_DIR_CANDIDATES = [
  path.resolve(__dirname, '../builtin-skills'),
  path.resolve(__dirname, '../../../server/builtin-skills'),
  path.resolve(process.cwd(), 'server/builtin-skills'),
  path.resolve(process.cwd(), 'dist/server/builtin-skills'),
]

const SKILL_PRESET_DEFINITIONS: SkillPresetDefinition[] = [
  {
    id: 'skill-creator',
    name: 'skill-creator',
    description: 'Create or refine reusable Skill definitions and workflows.',
    folderName: 'skill-creator',
    templateDirName: 'skill-creator',
  },
  {
    id: 'Excalidraw',
    name: 'Excalidraw',
    description: 'Turn requirements into editable Excalidraw diagrams quickly.',
    folderName: 'Excalidraw',
    templateDirName: 'Excalidraw',
  },
  {
    id: 'pdf',
    name: 'pdf',
    description: 'Read, generate, and review PDF documents with layout checks.',
    folderName: 'pdf',
    templateDirName: 'pdf',
  },
  {
    id: 'pptx',
    name: 'pptx',
    description: 'Generate maintainable slide decks in PPTX format.',
    folderName: 'pptx',
    templateDirName: 'pptx',
  },
  {
    id: 'xlsx',
    name: 'xlsx',
    description: 'Create and process structured spreadsheet data in XLSX.',
    folderName: 'xlsx',
    templateDirName: 'xlsx',
  },
]

function toDataRelativePath(absolutePath: string): string {
  return path.relative(DATA_DIR, absolutePath).replace(/\\/g, '/')
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function resolveBuiltinSkillsRootPath(): Promise<string> {
  for (const candidate of BUILTIN_SKILLS_DIR_CANDIDATES) {
    if (await exists(candidate)) {
      return candidate
    }
  }
  throw new Error('未找到内置 Skills 目录')
}

export async function listSkillPresets(): Promise<SkillPresetListItem[]> {
  await ensureDataDir()
  await fs.mkdir(SKILLS_ROOT, { recursive: true })

  const builtInRoot = await resolveBuiltinSkillsRootPath()
  const items: SkillPresetListItem[] = []

  for (const preset of SKILL_PRESET_DEFINITIONS) {
    const templatePath = path.join(builtInRoot, preset.templateDirName)
    if (!(await exists(templatePath))) {
      continue
    }
    const targetPath = path.join(SKILLS_ROOT, preset.folderName)
    items.push({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      folderName: preset.folderName,
      installed: await exists(targetPath),
      path: toDataRelativePath(targetPath),
    })
  }

  return items
}

export async function installSkillPreset(skillId: string): Promise<SkillPresetInstallResult> {
  await ensureDataDir()
  await fs.mkdir(SKILLS_ROOT, { recursive: true })

  const normalizedId = String(skillId || '').trim()
  const preset = SKILL_PRESET_DEFINITIONS.find((item) => item.id === normalizedId)
  if (!preset) {
    throw new Error('未找到对应的 Skill 预设')
  }

  const builtInRoot = await resolveBuiltinSkillsRootPath()
  const templatePath = path.join(builtInRoot, preset.templateDirName)
  if (!(await exists(templatePath))) {
    throw new Error('Skill 预设模板不存在')
  }

  const targetPath = path.join(SKILLS_ROOT, preset.folderName)
  if (await exists(targetPath)) {
    return {
      id: preset.id,
      name: preset.name,
      folderName: preset.folderName,
      path: toDataRelativePath(targetPath),
      alreadyInstalled: true,
    }
  }

  await fs.cp(templatePath, targetPath, {
    recursive: true,
    force: false,
  })

  return {
    id: preset.id,
    name: preset.name,
    folderName: preset.folderName,
    path: toDataRelativePath(targetPath),
    alreadyInstalled: false,
  }
}
