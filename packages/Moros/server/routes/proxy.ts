import { Router } from 'express'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

export const proxyRouter = Router()

const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'keep-alive',
  'accept-encoding',
  'expect',
  'proxy-connection',
])

const COPILOT_FORWARD_HEADERS = {
  'User-Agent': 'GitHubCopilotChat/0.35.0',
  'Editor-Version': 'vscode/1.107.0',
  'Editor-Plugin-Version': 'copilot-chat/0.35.0',
  'Copilot-Integration-Id': 'vscode-chat',
}

const TRANSIENT_PROXY_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const isGitHubTarget = (url: URL): boolean => {
  const host = url.hostname.toLowerCase()
  return host.includes('github.com') || host.includes('githubcopilot.com')
}

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const maybeCode = (error as { code?: unknown }).code
  if (typeof maybeCode === 'string') return maybeCode
  const cause = (error as { cause?: unknown }).cause
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as { code?: unknown }).code
    if (typeof causeCode === 'string') return causeCode
  }
  return undefined
}

const formatProxyError = (error: unknown): string => {
  const message =
    error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : String(error || 'Proxy request failed')
  const code = getErrorCode(error)
  if (code && !message.includes(code)) {
    return `${message} (${code})`
  }
  const cause = error && typeof error === 'object' ? (error as { cause?: unknown }).cause : undefined
  if (cause && typeof cause === 'object') {
    const causeMessage = (cause as { message?: unknown }).message
    if (typeof causeMessage === 'string' && causeMessage && !message.includes(causeMessage)) {
      return `${message}: ${causeMessage}`
    }
  }
  return message
}

const isRetriableProxyError = (error: unknown): boolean => {
  const code = getErrorCode(error)
  if (code && TRANSIENT_PROXY_ERROR_CODES.has(code)) return true
  const message = formatProxyError(error).toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    message.includes('timed out')
  )
}

const setCorsHeaders = (res: any) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept,Editor-Version,Editor-Plugin-Version,Copilot-Integration-Id,Openai-Intent,X-Initiator,X-Interaction-Type')
}

proxyRouter.options('/', (_req, res) => {
  setCorsHeaders(res)
  res.status(204).end()
})

proxyRouter.all('/', async (req, res) => {
  setCorsHeaders(res)

  const rawTarget = String(req.query.url || '').trim()
  if (!rawTarget) {
    return res.status(400).json({ success: false, error: 'Missing query parameter: url' })
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(rawTarget)
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid target url' })
  }
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return res.status(400).json({ success: false, error: 'Only http/https are allowed' })
  }

  const requestHeaders: Record<string, string> = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (!value) continue
    const lower = name.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (lower.startsWith('sec-')) continue
    if (lower === 'origin' || lower === 'referer') continue
    requestHeaders[lower] = Array.isArray(value) ? value.join(', ') : String(value)
  }

  if (isGitHubTarget(targetUrl)) {
    for (const [name, value] of Object.entries(COPILOT_FORWARD_HEADERS)) {
      const lower = name.toLowerCase()
      if (!requestHeaders[lower]) {
        requestHeaders[lower] = value
      }
    }
  }

  let requestBody: BodyInit | undefined
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      requestBody = req.body
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      requestBody = JSON.stringify(req.body)
    }
  }

  try {
    const maxAttempts = isGitHubTarget(targetUrl) ? 3 : 1
    let upstream: Response | null = null
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        upstream = await fetch(targetUrl.toString(), {
          method: req.method,
          headers: requestHeaders,
          body: requestBody,
          redirect: 'follow',
        })
        break
      } catch (error) {
        lastError = error
        if (attempt >= maxAttempts || !isRetriableProxyError(error)) {
          throw error
        }
        await sleep(attempt * 400)
      }
    }

    if (!upstream) {
      throw lastError || new Error('Proxy request failed')
    }

    res.status(upstream.status)
    upstream.headers.forEach((value, name) => {
      const lower = name.toLowerCase()
      if (HOP_BY_HOP_HEADERS.has(lower)) return
      if (lower === 'access-control-allow-origin') return
      res.setHeader(name, value)
    })

    if (!upstream.body) {
      res.end()
      return
    }

    await pipeline(Readable.fromWeb(upstream.body as any), res)
  } catch (error: any) {
    const formattedError = formatProxyError(error)
    console.error(`[proxy] ${req.method} ${targetUrl.toString()} failed: ${formattedError}`)
    if (res.headersSent) {
      try { res.end() } catch {}
      return
    }
    res.status(502).json({
      success: false,
      error: formattedError || 'Proxy request failed',
    })
  }
})
