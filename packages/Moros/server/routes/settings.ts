import express from 'express'
import fs from 'fs/promises'
import path from 'path'

export const settingsRouter = express.Router()

const DATA_DIR = path.resolve(process.cwd(), 'markov-data')
const SETTINGS_FILE_NAME = '.moros-settings.json'
const SETTINGS_FILE_PATH = path.join(DATA_DIR, SETTINGS_FILE_NAME)
const SYSTEM_PROMPT_MAX_LENGTH = 20000

type SettingsPayload = {
  systemPrompt?: string
  updatedAt?: string
  [key: string]: any
}

const ensureDataDir = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

const readSettingsPayload = async (): Promise<SettingsPayload> => {
  await ensureDataDir()
  try {
    const raw = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as SettingsPayload
  } catch (error: any) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

const normalizeSystemPrompt = (value: any): string => {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n')
}

settingsRouter.get('/system-prompt', async (_req, res) => {
  try {
    const settings = await readSettingsPayload()
    const systemPrompt = normalizeSystemPrompt(settings.systemPrompt)
    return res.json({
      success: true,
      data: {
        systemPrompt,
        updatedAt: settings.updatedAt,
      },
    })
  } catch (error) {
    console.error('读取系统提示词失败:', error)
    return res.status(500).json({ success: false, error: '读取系统提示词失败' })
  }
})

settingsRouter.put('/system-prompt', async (req, res) => {
  try {
    const rawSystemPrompt = req.body?.systemPrompt
    if (rawSystemPrompt != null && typeof rawSystemPrompt !== 'string') {
      return res.status(400).json({ success: false, error: 'systemPrompt 必须是字符串' })
    }

    const systemPrompt = normalizeSystemPrompt(rawSystemPrompt)
    if (systemPrompt.length > SYSTEM_PROMPT_MAX_LENGTH) {
      return res
        .status(400)
        .json({ success: false, error: `systemPrompt 不能超过 ${SYSTEM_PROMPT_MAX_LENGTH} 个字符` })
    }

    const current = await readSettingsPayload()
    const nextPayload: SettingsPayload = {
      ...current,
      systemPrompt,
      updatedAt: new Date().toISOString(),
    }

    await ensureDataDir()
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(nextPayload, null, 2), 'utf-8')

    return res.json({
      success: true,
      data: {
        systemPrompt,
        updatedAt: nextPayload.updatedAt,
      },
    })
  } catch (error) {
    console.error('保存系统提示词失败:', error)
    return res.status(500).json({ success: false, error: '保存系统提示词失败' })
  }
})
