import { Router } from 'express'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { request as httpsRequest } from 'https'
import crypto from 'crypto'

export const openaiCodexOauthRouter = Router()

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL = 'https://auth.openai.com/oauth/token'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const SCOPE = 'openid profile email offline_access'
const JWT_CLAIM_PATH = 'https://api.openai.com/auth'
const FLOW_TIMEOUT_MS = 10 * 60 * 1000
const FLOW_RETENTION_MS = 30 * 60 * 1000
const TOKEN_REQUEST_TIMEOUT_MS = 15_000
const TOKEN_REQUEST_MAX_ATTEMPTS = 3
const TOKEN_REQUEST_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const TOKEN_REQUEST_RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

type OpenAICodexCredentials = {
  refresh: string
  access: string
  expires: number
  accountId: string
  updatedAt: number
}

type OAuthFlowStatus = 'pending' | 'success' | 'error'

type OAuthFlow = {
  id: string
  verifier: string
  state: string
  authUrl: string
  status: OAuthFlowStatus
  createdAt: number
  expiresAt: number
  credentials?: OpenAICodexCredentials
  error?: string
  timeoutTimer?: NodeJS.Timeout
}

const flowsById = new Map<string, OAuthFlow>()
const flowIdsByState = new Map<string, string>()
let activeFlowId: string | null = null
let callbackServer: Server | null = null

const SUCCESS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenAI Codex OAuth</title>
</head>
<body>
  <p>Authentication successful. You can return to MoRos now.</p>
</body>
</html>`

const ERROR_HTML = (message: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenAI Codex OAuth</title>
</head>
<body>
  <p>${message}</p>
</body>
</html>`

const base64urlEncode = (value: Buffer): string => {
  return value
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const decodeBase64Url = (value: string): string => {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf-8')
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const extractNetworkErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined
  const directCode = (error as { code?: unknown }).code
  if (typeof directCode === 'string') return directCode
  const cause = (error as { cause?: unknown }).cause
  if (!cause || typeof cause !== 'object') return undefined
  const causeCode = (cause as { code?: unknown }).code
  return typeof causeCode === 'string' ? causeCode : undefined
}

const formatNetworkError = (error: unknown): string => {
  const message =
    error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : String(error || 'Unknown network error')
  const code = extractNetworkErrorCode(error)
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

const isRetriableNetworkError = (error: unknown): boolean => {
  const code = extractNetworkErrorCode(error)
  if (code && TOKEN_REQUEST_RETRYABLE_CODES.has(code)) return true
  const normalized = formatNetworkError(error).toLowerCase()
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('timed out') ||
    normalized.includes('socket hang up') ||
    normalized.includes('connect timeout')
  )
}

const parseTokenErrorMessage = (bodyText: string): string => {
  const raw = String(bodyText || '').trim()
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        code?: unknown
        type?: unknown
        message?: unknown
      }
    }
    const error = parsed?.error
    if (error && typeof error === 'object') {
      const message = typeof error.message === 'string' ? error.message.trim() : ''
      const code = typeof error.code === 'string' ? error.code.trim() : ''
      const type = typeof error.type === 'string' ? error.type.trim() : ''
      const suffix = [code, type].filter(Boolean).join(', ')
      if (message && suffix) return `${message} (${suffix})`
      return message || suffix || ''
    }
  } catch {
    // no-op, fallback to raw text below
  }
  return raw.replace(/\s+/g, ' ').slice(0, 500)
}

type TokenEndpointJson = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

const postTokenRequest = async (
  params: URLSearchParams,
): Promise<{ statusCode: number; statusText: string; bodyText: string }> => {
  const body = params.toString()
  const url = new URL(TOKEN_URL)

  return await new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        method: 'POST',
        path: `${url.pathname}${url.search}`,
        // Prefer IPv4 to avoid IPv6 egress leaks (common with VPN TUN on Windows).
        family: 4,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, text/plain, */*',
          'Content-Length': String(Buffer.byteLength(body)),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))))
        response.on('end', () => {
          resolve({
            statusCode: Number(response.statusCode || 0),
            statusText: String(response.statusMessage || ''),
            bodyText: Buffer.concat(chunks).toString('utf-8'),
          })
        })
      },
    )
    req.on('error', (error) => reject(error))
    req.setTimeout(TOKEN_REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('Token request timeout'))
    })
    req.write(body)
    req.end()
  })
}

const requestTokenEndpoint = async (
  params: URLSearchParams,
  operation: 'exchange' | 'refresh',
): Promise<TokenEndpointJson> => {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= TOKEN_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await postTokenRequest(params)
      const detail = parseTokenErrorMessage(response.bodyText)

      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (
          TOKEN_REQUEST_RETRYABLE_STATUS.has(response.statusCode) &&
          attempt < TOKEN_REQUEST_MAX_ATTEMPTS
        ) {
          await sleep(attempt * 500)
          continue
        }
        const action = operation === 'exchange' ? 'Token exchange' : 'Token refresh'
        throw new Error(
          `${action} failed: ${response.statusCode} ${detail || response.statusText || 'Unknown error'}`.trim(),
        )
      }

      try {
        return JSON.parse(response.bodyText) as TokenEndpointJson
      } catch {
        const action = operation === 'exchange' ? 'Token exchange' : 'Token refresh'
        throw new Error(`${action} returned invalid JSON`)
      }
    } catch (error) {
      lastError = error
      const formatted = formatNetworkError(error)
      const normalized = formatted.toLowerCase()
      const retriable = isRetriableNetworkError(error)
      const networkLike =
        retriable ||
        Boolean(extractNetworkErrorCode(error)) ||
        normalized.includes('network') ||
        normalized.includes('socket') ||
        normalized.includes('tls') ||
        normalized.includes('certificate') ||
        normalized.includes('timed out')

      if (attempt < TOKEN_REQUEST_MAX_ATTEMPTS && retriable) {
        await sleep(attempt * 500)
        continue
      }

      if (networkLike) {
        const action = operation === 'exchange' ? 'Token exchange' : 'Token refresh'
        throw new Error(`${action} network error: ${formatted}`.trim())
      }

      throw error instanceof Error ? error : new Error(String(error))
    }
  }
  throw new Error(formatNetworkError(lastError))
}

const generatePkcePair = (): { verifier: string; challenge: string } => {
  const verifier = base64urlEncode(crypto.randomBytes(32))
  const challenge = base64urlEncode(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

const createState = (): string => {
  return crypto.randomBytes(16).toString('hex')
}

const clearFlowTimer = (flow: OAuthFlow) => {
  if (!flow.timeoutTimer) return
  clearTimeout(flow.timeoutTimer)
  flow.timeoutTimer = undefined
}

const markFlowSuccess = (flow: OAuthFlow, credentials: OpenAICodexCredentials) => {
  clearFlowTimer(flow)
  flow.status = 'success'
  flow.error = undefined
  flow.credentials = credentials
}

const markFlowError = (flow: OAuthFlow, errorMessage: string) => {
  clearFlowTimer(flow)
  flow.status = 'error'
  flow.error = errorMessage
}

const cleanupFlows = () => {
  const now = Date.now()
  for (const [flowId, flow] of flowsById.entries()) {
    if (flow.status === 'pending') continue
    if (now - flow.createdAt <= FLOW_RETENTION_MS) continue
    flowsById.delete(flowId)
  }
}

const buildAuthorizeUrl = (state: string, challenge: string): string => {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)
  url.searchParams.set('id_token_add_organizations', 'true')
  url.searchParams.set('codex_cli_simplified_flow', 'true')
  url.searchParams.set('originator', 'pi')
  return url.toString()
}

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    const payloadJson = decodeBase64Url(parts[1] || '')
    return JSON.parse(payloadJson) as Record<string, unknown>
  } catch {
    return null
  }
}

const extractAccountId = (accessToken: string): string | null => {
  const payload = decodeJwtPayload(accessToken)
  const auth = payload?.[JWT_CLAIM_PATH]
  if (!auth || typeof auth !== 'object') return null
  const accountId = (auth as { chatgpt_account_id?: unknown }).chatgpt_account_id
  if (typeof accountId !== 'string' || !accountId.trim()) return null
  return accountId
}

const createCredentialsPayload = (
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
): OpenAICodexCredentials => {
  const accountId = extractAccountId(accessToken)
  if (!accountId) {
    throw new Error('Failed to extract chatgpt_account_id from access token')
  }
  return {
    access: accessToken,
    refresh: refreshToken,
    expires: Date.now() + expiresInSeconds * 1000,
    accountId,
    updatedAt: Date.now(),
  }
}

const exchangeAuthorizationCode = async (code: string, verifier: string): Promise<OpenAICodexCredentials> => {
  const json = await requestTokenEndpoint(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
    'exchange',
  )

  if (
    typeof json.access_token !== 'string' ||
    typeof json.refresh_token !== 'string' ||
    typeof json.expires_in !== 'number'
  ) {
    throw new Error('Token exchange response missing required fields')
  }

  return createCredentialsPayload(json.access_token, json.refresh_token, json.expires_in)
}

const refreshToken = async (refreshTokenValue: string): Promise<OpenAICodexCredentials> => {
  const json = await requestTokenEndpoint(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshTokenValue,
    }),
    'refresh',
  )

  if (typeof json.access_token !== 'string' || typeof json.expires_in !== 'number') {
    throw new Error('Token refresh response missing required fields')
  }

  const nextRefreshToken = typeof json.refresh_token === 'string' && json.refresh_token
    ? json.refresh_token
    : refreshTokenValue

  return createCredentialsPayload(json.access_token, nextRefreshToken, json.expires_in)
}

const closeCallbackServer = async (): Promise<void> => {
  const currentServer = callbackServer
  if (!currentServer) return
  callbackServer = null
  await new Promise<void>((resolve) => {
    try {
      currentServer.close(() => resolve())
    } catch {
      resolve()
    }
  })
}

const completeFlowWithCode = async (flow: OAuthFlow, code: string): Promise<void> => {
  if (flow.status !== 'pending') return
  try {
    const credentials = await exchangeAuthorizationCode(code, flow.verifier)
    markFlowSuccess(flow, credentials)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markFlowError(flow, message || 'OAuth token exchange failed')
  } finally {
    flowIdsByState.delete(flow.state)
    if (activeFlowId === flow.id) {
      activeFlowId = null
    }
    await closeCallbackServer()
  }
}

const writeHtml = (res: ServerResponse, statusCode: number, html: string) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

const handleCallbackRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  try {
    const requestUrl = new URL(req.url || '', REDIRECT_URI)
    if (requestUrl.pathname !== '/auth/callback') {
      writeHtml(res, 404, ERROR_HTML('Not found'))
      return
    }

    const state = String(requestUrl.searchParams.get('state') || '').trim()
    const code = String(requestUrl.searchParams.get('code') || '').trim()
    if (!state || !code) {
      writeHtml(res, 400, ERROR_HTML('Missing OAuth state or authorization code'))
      return
    }

    const flowId = flowIdsByState.get(state)
    if (!flowId) {
      writeHtml(res, 400, ERROR_HTML('OAuth state mismatch'))
      return
    }

    const flow = flowsById.get(flowId)
    if (!flow || flow.status !== 'pending' || flow.state !== state) {
      writeHtml(res, 400, ERROR_HTML('OAuth flow is no longer active'))
      return
    }

    writeHtml(res, 200, SUCCESS_HTML)
    void completeFlowWithCode(flow, code)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected callback error'
    writeHtml(res, 500, ERROR_HTML(message))
  }
}

const ensureCallbackServer = async (): Promise<void> => {
  if (callbackServer) return
  const server = createServer((req, res) => {
    void handleCallbackRequest(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(1455, 'localhost')
  })

  callbackServer = server
}

openaiCodexOauthRouter.post('/oauth/start', async (_req, res) => {
  cleanupFlows()

  try {
    if (activeFlowId) {
      const existingFlow = flowsById.get(activeFlowId)
      if (existingFlow && existingFlow.status === 'pending') {
        markFlowError(existingFlow, 'OAuth flow cancelled by a newer request')
        flowIdsByState.delete(existingFlow.state)
      }
      activeFlowId = null
      await closeCallbackServer()
    }

    const { verifier, challenge } = generatePkcePair()
    const state = createState()
    const flowId = crypto.randomUUID()
    const now = Date.now()
    const flow: OAuthFlow = {
      id: flowId,
      verifier,
      state,
      authUrl: buildAuthorizeUrl(state, challenge),
      status: 'pending',
      createdAt: now,
      expiresAt: now + FLOW_TIMEOUT_MS,
    }

    flow.timeoutTimer = setTimeout(() => {
      if (flow.status !== 'pending') return
      markFlowError(flow, 'OAuth flow timed out')
      flowIdsByState.delete(flow.state)
      if (activeFlowId === flow.id) {
        activeFlowId = null
      }
      void closeCallbackServer()
    }, FLOW_TIMEOUT_MS)
    flow.timeoutTimer.unref?.()

    flowsById.set(flowId, flow)
    flowIdsByState.set(state, flowId)
    activeFlowId = flowId

    try {
      await ensureCallbackServer()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      markFlowError(flow, `Failed to listen on ${REDIRECT_URI}: ${message}`)
      flowIdsByState.delete(state)
      activeFlowId = null
      await closeCallbackServer()
      return res.status(500).json({
        success: false,
        error: `无法监听 ${REDIRECT_URI}，请确认端口 1455 未被占用`,
      })
    }

    return res.json({
      success: true,
      data: {
        flowId,
        url: flow.authUrl,
        expiresAt: flow.expiresAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({
      success: false,
      error: message || 'Failed to start OpenAI Codex OAuth flow',
    })
  }
})

openaiCodexOauthRouter.get('/oauth/status/:flowId', (req, res) => {
  cleanupFlows()

  const flowId = String(req.params.flowId || '').trim()
  const flow = flowsById.get(flowId)
  if (!flow) {
    return res.status(404).json({ success: false, error: 'OAuth flow not found' })
  }

  const payload: {
    status: OAuthFlowStatus
    error?: string
    credentials?: OpenAICodexCredentials
  } = {
    status: flow.status,
  }

  if (flow.status === 'error') {
    payload.error = flow.error || 'OAuth flow failed'
  }
  if (flow.status === 'success' && flow.credentials) {
    payload.credentials = flow.credentials
  }

  return res.json({ success: true, data: payload })
})

openaiCodexOauthRouter.post('/oauth/cancel', async (req, res) => {
  const requestedFlowId = String(req.body?.flowId || '').trim()
  const flowId = requestedFlowId || activeFlowId || ''
  if (!flowId) {
    return res.json({ success: true, data: { cancelled: false } })
  }

  const flow = flowsById.get(flowId)
  if (!flow || flow.status !== 'pending') {
    return res.json({ success: true, data: { cancelled: false } })
  }

  markFlowError(flow, 'OAuth flow cancelled')
  flowIdsByState.delete(flow.state)
  if (activeFlowId === flowId) {
    activeFlowId = null
  }
  await closeCallbackServer()
  return res.json({ success: true, data: { cancelled: true } })
})

openaiCodexOauthRouter.post('/oauth/refresh', async (req, res) => {
  const refreshTokenValue = String(req.body?.refreshToken || '').trim()
  if (!refreshTokenValue) {
    return res.status(400).json({ success: false, error: 'refreshToken is required' })
  }

  try {
    const credentials = await refreshToken(refreshTokenValue)
    return res.json({ success: true, data: credentials })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(400).json({ success: false, error: message || 'Failed to refresh OpenAI Codex token' })
  }
})
