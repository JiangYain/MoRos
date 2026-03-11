import { Router } from 'express'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import crypto from 'crypto'
import net from 'net'

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

const PROXY_AUTH_HEADER = 'x-moros-proxy-token'
const PROXY_TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const LOOPBACK_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?$/i
const ALLOWED_PROXY_EXACT_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'api.individual.githubcopilot.com',
  'api.business.githubcopilot.com',
  'opencode.ai',
  'api.opencode.ai',
])
const ALLOWED_PROXY_HOST_SUFFIXES = [
  'github.com',
  'githubcopilot.com',
  'opencode.ai',
]

const FIXED_PROXY_TOKEN = String(process.env.MOROS_PROXY_AUTH_TOKEN || '').trim()
let rollingProxyToken = crypto.randomBytes(32).toString('hex')
let rollingProxyTokenExpiresAt = Date.now() + PROXY_TOKEN_TTL_MS

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const isGitHubTarget = (url: URL): boolean => {
  const host = url.hostname.toLowerCase()
  return host === 'github.com' || host.endsWith('.github.com') || host === 'githubcopilot.com' || host.endsWith('.githubcopilot.com')
}

const isOpenCodeTarget = (url: URL): boolean => {
  const host = url.hostname.toLowerCase()
  return host === 'opencode.ai' || host.endsWith('.opencode.ai')
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

const setCorsHeaders = (req: any, res: any): boolean => {
  const origin = String(req.headers?.origin || '').trim()
  if (origin && !LOOPBACK_ORIGIN_PATTERN.test(origin)) {
    return false
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    `Authorization,Content-Type,Accept,Editor-Version,Editor-Plugin-Version,Copilot-Integration-Id,Openai-Intent,X-Initiator,X-Interaction-Type,${PROXY_AUTH_HEADER}`,
  )
  return true
}

const getExpectedProxyToken = (): { token: string; expiresAt: number } => {
  if (FIXED_PROXY_TOKEN) {
    return {
      token: FIXED_PROXY_TOKEN,
      expiresAt: Date.now() + PROXY_TOKEN_TTL_MS,
    }
  }
  if (Date.now() >= rollingProxyTokenExpiresAt - 10_000) {
    rollingProxyToken = crypto.randomBytes(32).toString('hex')
    rollingProxyTokenExpiresAt = Date.now() + PROXY_TOKEN_TTL_MS
  }
  return {
    token: rollingProxyToken,
    expiresAt: rollingProxyTokenExpiresAt,
  }
}

const readProxyAuthHeader = (req: any): string => {
  const value = req.headers?.[PROXY_AUTH_HEADER]
  if (Array.isArray(value)) return String(value[0] || '').trim()
  return String(value || '').trim()
}

const isAllowedProxyHost = (host: string): boolean => {
  const normalized = String(host || '').trim().toLowerCase()
  if (!normalized) return false
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return false
  if (net.isIP(normalized)) return false
  if (ALLOWED_PROXY_EXACT_HOSTS.has(normalized)) return true
  return ALLOWED_PROXY_HOST_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`))
}

const validateTargetUrl = (targetUrl: URL): string | null => {
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return 'Only http/https are allowed'
  }
  if (targetUrl.username || targetUrl.password) {
    return 'URL credentials are not allowed'
  }
  if (targetUrl.port && targetUrl.port !== '80' && targetUrl.port !== '443') {
    return 'Only port 80/443 are allowed'
  }
  if (!isAllowedProxyHost(targetUrl.hostname)) {
    return 'Target host is not allowed'
  }
  return null
}

const isRedirectStatus = (status: number): boolean => {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

const fetchWithSafeRedirects = async (
  initialUrl: URL,
  init: {
    method: string
    headers: Record<string, string>
    body?: BodyInit
  },
): Promise<Response> => {
  const MAX_REDIRECTS = 5
  let currentUrl = new URL(initialUrl.toString())
  let currentMethod = String(init.method || 'GET').toUpperCase()
  let currentBody = init.body

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl.toString(), {
      method: currentMethod,
      headers: init.headers,
      body: currentBody,
      redirect: 'manual',
    })

    if (!isRedirectStatus(response.status)) {
      return response
    }
    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error('Too many redirects')
    }
    const location = String(response.headers.get('location') || '').trim()
    if (!location) {
      return response
    }
    const nextUrl = new URL(location, currentUrl)
    const validationError = validateTargetUrl(nextUrl)
    if (validationError) {
      throw new Error(`Redirect target blocked: ${validationError}`)
    }
    currentUrl = nextUrl

    if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
      currentMethod = 'GET'
      currentBody = undefined
    }
  }

  throw new Error('Proxy request failed')
}

proxyRouter.options('/', (_req, res) => {
  // CORS preflight is handled only for loopback origins.
  if (!setCorsHeaders(_req, res)) {
    return res.status(403).json({ success: false, error: 'Forbidden origin' })
  }
  res.status(204).end()
})

proxyRouter.get('/auth-token', (req, res) => {
  if (!setCorsHeaders(req, res)) {
    return res.status(403).json({ success: false, error: 'Forbidden origin' })
  }
  const { token, expiresAt } = getExpectedProxyToken()
  res.setHeader('Cache-Control', 'no-store')
  return res.json({
    success: true,
    data: {
      token,
      expiresAt,
    },
  })
})

proxyRouter.all('/', async (req, res) => {
  if (!setCorsHeaders(req, res)) {
    return res.status(403).json({ success: false, error: 'Forbidden origin' })
  }

  const expected = getExpectedProxyToken()
  const providedToken = readProxyAuthHeader(req)
  if (!providedToken || providedToken !== expected.token) {
    return res.status(401).json({ success: false, error: 'Unauthorized proxy request' })
  }

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
  const validationError = validateTargetUrl(targetUrl)
  if (validationError) {
    return res.status(400).json({ success: false, error: validationError })
  }

  const requestHeaders: Record<string, string> = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (!value) continue
    const lower = name.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (lower.startsWith('sec-')) continue
    if (lower === 'origin' || lower === 'referer') continue
    if (lower === PROXY_AUTH_HEADER) continue
    if (lower === 'cookie') continue
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
    if (typeof req.body === 'string') {
      requestBody = req.body
    } else if (Buffer.isBuffer(req.body)) {
      requestBody = new Uint8Array(req.body)
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      requestBody = JSON.stringify(req.body)
    }
  }

  try {
    const maxAttempts = isGitHubTarget(targetUrl) || isOpenCodeTarget(targetUrl) ? 3 : 1
    let upstream: Response | null = null
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        upstream = await fetchWithSafeRedirects(targetUrl, {
          method: req.method,
          headers: requestHeaders,
          body: requestBody,
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
