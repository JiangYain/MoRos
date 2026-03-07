import express from 'express'
import path from 'path'
import { rpcAgentSessionManager, type RpcImageInput } from '../utils/rpcAgentManager.js'

export const agentRouter = express.Router()
type AgentProvider = 'github-copilot' | 'opencode-go'
const DEFAULT_MODEL_BY_PROVIDER: Record<AgentProvider, string> = {
  'github-copilot': 'gpt-4o',
  'opencode-go': 'glm-5',
}

const normalizeProvider = (value: any): AgentProvider => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'opencode-go' ? 'opencode-go' : 'github-copilot'
}

const getDefaultModelForProvider = (provider: AgentProvider): string => {
  return DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_MODEL_BY_PROVIDER['github-copilot']
}

const setSseHeaders = (res: any) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
}

const writeSse = (res: any, eventName: string, payload: any) => {
  if (!res || res.writableEnded || res.destroyed) return
  res.write(`event: ${eventName}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const normalizeImages = (value: any): RpcImageInput[] => {
  if (!Array.isArray(value)) return []
  const normalized: RpcImageInput[] = []
  for (const item of value) {
    const type = String(item?.type || '').trim()
    const data = String(item?.data || '').trim()
    const mimeType = String(item?.mimeType || '').trim()
    if (type !== 'image' || !data || !mimeType.startsWith('image/')) continue
    normalized.push({
      type: 'image',
      data,
      mimeType,
    })
  }
  return normalized
}

const normalizeSkillPaths = (value: any): string[] => {
  if (!Array.isArray(value)) return []
  const dataRoot = path.resolve(process.cwd(), 'markov-data')
  const normalized: string[] = []
  for (const item of value) {
    const raw = String(item || '').trim()
    if (!raw) continue
    const resolved = path.isAbsolute(raw)
      ? path.resolve(raw)
      : path.resolve(dataRoot, raw)
    if (resolved === dataRoot || resolved.startsWith(dataRoot + path.sep)) {
      normalized.push(resolved)
    }
  }
  return Array.from(new Set(normalized))
}

const resolveWorkingDirectory = (chatFilePathValue: any): string => {
  const appRoot = path.resolve(process.cwd())
  const dataRoot = path.resolve(appRoot, 'markov-data')
  const chatFilePath = String(chatFilePathValue || '').trim().replace(/\\/g, '/')
  if (!chatFilePath || !chatFilePath.toLowerCase().endsWith('.moros')) {
    return appRoot
  }

  const normalizedRelativePath = chatFilePath.replace(/^\/+/, '')
  const resolvedFilePath = path.resolve(dataRoot, normalizedRelativePath)
  if (!(resolvedFilePath === dataRoot || resolvedFilePath.startsWith(dataRoot + path.sep))) {
    return appRoot
  }

  const parentDir = path.dirname(resolvedFilePath)
  // 根目录散列文件（如 markov-data/xxx.MoRos）仍保持项目根目录
  if (parentDir === dataRoot) {
    return appRoot
  }
  return parentDir
}

agentRouter.post('/chat/stream', async (req, res) => {
  const body = req.body || {}
  const message = String(body.message || '').trim()
  const provider = normalizeProvider(body.provider)
  const model = String(body.model || '').trim() || getDefaultModelForProvider(provider)
  const runtimeSessionId = String(body.runtimeSessionId || '').trim() || undefined
  const resumeSessionFile = String(body.resumeSessionFile || '').trim() || undefined
  const copilotToken = String(body.copilotToken || '').trim()
  const opencodeApiKey = String(body.opencodeApiKey || '').trim()
  const opencodeGoBaseUrl = String(body.opencodeGoBaseUrl || '').trim()
  const images = normalizeImages(body.images)
  const skillPaths = normalizeSkillPaths(body.skillPaths)
  const workingDirectory = resolveWorkingDirectory(body.chatFilePath)

  const reqTag = `[Agent:${Date.now().toString(36)}]`
  console.log(`${reqTag} POST /chat/stream provider=${provider} model=${model} msg="${message.slice(0, 60)}" sessionId=${runtimeSessionId || '(new)'} skills=${skillPaths.length} cwd=${workingDirectory}`)

  if (!message && images.length === 0) {
    return res.status(400).json({ success: false, error: 'message or images is required' })
  }
  if (provider === 'github-copilot' && !copilotToken) {
    console.log(`${reqTag} rejected: no copilot token`)
    return res.status(401).json({ success: false, error: 'Missing GitHub Copilot token' })
  }
  if (provider === 'opencode-go' && !opencodeApiKey) {
    console.log(`${reqTag} rejected: no opencode api key`)
    return res.status(401).json({ success: false, error: 'Missing OpenCode Go API key' })
  }

  setSseHeaders(res)
  res.flushHeaders?.()

  const streamAbortController = new AbortController()
  let clientDisconnected = false
  const handleClientDisconnect = () => {
    if (clientDisconnected) return
    clientDisconnected = true
    console.log(`${reqTag} client disconnected`)
    // Stop the active prompt as soon as the SSE client is gone to prevent
    // stale background runs and avoid noisy timeout errors in logs.
    streamAbortController.abort()
  }
  req.on('aborted', handleClientDisconnect)
  res.on('close', () => {
    if (!res.writableEnded) {
      handleClientDisconnect()
    }
  })

  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) return
    res.write(': ping\n\n')
  }, 15000)

  let sseEventCount = 0

  try {
    const { runtimeSessionId: resolvedRuntimeSessionId, session, created } = await rpcAgentSessionManager.getOrCreateSession({
      runtimeSessionId,
      resumeSessionFile,
      provider,
      model,
      copilotToken,
      opencodeApiKey,
      opencodeGoBaseUrl,
      skillPaths,
      workingDirectory,
    })
    console.log(`${reqTag} session ${resolvedRuntimeSessionId.slice(0, 8)} created=${created} alive=${session.isAlive()}`)

    let resolvedModel = model
    let modelFallbackFrom: string | undefined
    const safeModelFallback = getDefaultModelForProvider(provider)
    try {
      await session.ensureModel(model, provider)
    } catch (error: any) {
      const errorMessage = String(error?.message || '')
      console.log(`${reqTag} ensureModel failed: ${errorMessage}`)
      if (resolvedModel !== safeModelFallback && /model not found/i.test(errorMessage)) {
        modelFallbackFrom = resolvedModel
        resolvedModel = safeModelFallback
        await session.ensureModel(resolvedModel, provider)
      } else {
        throw error
      }
    }

    const sessionMeta = session.getMeta()
    writeSse(res, 'session_meta', {
      created,
      runtimeSessionId: resolvedRuntimeSessionId,
      sessionId: sessionMeta.sessionId,
      sessionFile: sessionMeta.sessionFile,
      currentProvider: sessionMeta.currentProvider,
      currentModel: sessionMeta.currentModel,
      requestedProvider: provider,
      requestedModel: model,
      resolvedModel,
      modelFallbackFrom,
    })
    sseEventCount++

    if (modelFallbackFrom) {
      writeSse(res, 'agent_event', {
        type: 'session_warning',
        warningType: 'model_fallback',
        requestedModel: modelFallbackFrom,
        resolvedModel,
        message: `Model ${modelFallbackFrom} is unavailable, fallback to ${resolvedModel}`,
      })
      sseEventCount++
    }

    console.log(`${reqTag} calling prompt()...`)

    const promptResult = await session.prompt({
      message,
      images,
      signal: streamAbortController.signal,
      onEvent: (event) => {
        sseEventCount++
        writeSse(res, 'agent_event', event)
      },
    })

    console.log(`${reqTag} prompt done, text_len=${promptResult.assistantText?.length || 0}, events=${sseEventCount}`)

    if (promptResult.assistantText) {
      writeSse(res, 'assistant_final', {
        text: promptResult.assistantText,
      })
    }

    writeSse(res, 'done', { ok: true })
  } catch (error: any) {
    const errorMessage = String(error?.message || 'Local CLI stream failed')
    const isExpectedDisconnectAbort =
      clientDisconnected && /(prompt aborted by signal|request was aborted|aborted)/i.test(errorMessage)
    const recoveredAssistantText = String(error?.details?.assistantText || '').trim()
    const canRecoverAsSuccess =
      !clientDisconnected &&
      recoveredAssistantText.length > 0 &&
      /(an unknown error occurred|model request failed with stopreason=error)/i.test(errorMessage)

    if (isExpectedDisconnectAbort) {
      console.log(`${reqTag} stream cancelled after client disconnect`)
    } else if (canRecoverAsSuccess) {
      console.log(`${reqTag} recovered generic stream error using captured assistant text`)
      writeSse(res, 'assistant_final', {
        text: recoveredAssistantText,
      })
      writeSse(res, 'done', {
        ok: true,
        recoveredFromError: true,
      })
    } else {
      console.error(`${reqTag} stream error (clientDisconnected=${clientDisconnected}):`, errorMessage)
    }

    if (!clientDisconnected && !canRecoverAsSuccess && !res.writableEnded && !res.destroyed) {
      writeSse(res, 'error', {
        message: errorMessage,
        details: error?.details || undefined,
      })
    }
  } finally {
    req.off('aborted', handleClientDisconnect)
    clearInterval(heartbeat)
    if (!res.writableEnded) {
      res.end()
    }
    console.log(`${reqTag} stream ended, total SSE events=${sseEventCount}`)
  }
})

agentRouter.post('/session/abort', async (req, res) => {
  const runtimeSessionId = String(req.body?.runtimeSessionId || '').trim()
  if (!runtimeSessionId) {
    return res.status(400).json({ success: false, error: 'runtimeSessionId is required' })
  }

  try {
    await rpcAgentSessionManager.abortSession(runtimeSessionId)
    return res.json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Abort session failed' })
  }
})

agentRouter.post('/session/close', async (req, res) => {
  const runtimeSessionId = String(req.body?.runtimeSessionId || '').trim()
  if (!runtimeSessionId) {
    return res.status(400).json({ success: false, error: 'runtimeSessionId is required' })
  }

  try {
    await rpcAgentSessionManager.closeSession(runtimeSessionId)
    return res.json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Close session failed' })
  }
})
