import { Router } from 'express'
import { request as httpsRequest } from 'https'
import net from 'net'

export const githubCopilotOauthRouter = Router()

const DEFAULT_GITHUB_COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const GITHUB_COPILOT_CLIENT_ID = String(process.env.MOROS_GITHUB_COPILOT_CLIENT_ID || '').trim() || DEFAULT_GITHUB_COPILOT_CLIENT_ID
const REQUEST_TIMEOUT_MS = 8_000
const REQUEST_MAX_ATTEMPTS = 2
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const RETRYABLE_CODES = new Set([
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

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  interval: number
  expires_in: number
}

const normalizeDomain = (input?: string): string | null => {
  const trimmed = String(input || '').trim()
  if (!trimmed) return null
  try {
    const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    return new URL(withProtocol).hostname
  } catch {
    return null
  }
}

const isUnsafeDomain = (domain: string): boolean => {
  const hostname = String(domain || '').trim().toLowerCase()
  if (!hostname) return true
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (net.isIP(hostname)) return true
  return false
}

const getCopilotUrls = (domain: string) => {
  return {
    deviceCodeUrl: `https://${domain}/login/device/code`,
    accessTokenUrl: `https://${domain}/login/oauth/access_token`,
  }
}

const parseResponseText = (text: string): any => {
  try {
    return JSON.parse(String(text || '{}'))
  } catch {
    return {}
  }
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
  return message
}

const isRetriableNetworkError = (error: unknown): boolean => {
  const code = extractNetworkErrorCode(error)
  if (code && RETRYABLE_CODES.has(code)) return true
  const normalized = formatNetworkError(error).toLowerCase()
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('timed out') ||
    normalized.includes('socket hang up') ||
    normalized.includes('connect timeout')
  )
}

const postJson = async (
  url: string,
  payload: Record<string, any>,
): Promise<{ statusCode: number; statusText: string; bodyText: string }> => {
  const target = new URL(url)
  const body = JSON.stringify(payload)

  return await new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(hardTimeout)
      fn()
    }

    const req = httpsRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method: 'POST',
        path: `${target.pathname}${target.search}`,
        // Prefer IPv4 to avoid unstable IPv6 egress.
        family: 4,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))))
        response.on('end', () => {
          settle(() => {
            resolve({
              statusCode: Number(response.statusCode || 0),
              statusText: String(response.statusMessage || ''),
              bodyText: Buffer.concat(chunks).toString('utf-8'),
            })
          })
        })
      },
    )

    req.on('error', (error) => settle(() => reject(error)))
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('GitHub request timeout (socket idle)'))
    })
    const hardTimeout = setTimeout(() => {
      req.destroy(new Error('GitHub request timeout'))
    }, REQUEST_TIMEOUT_MS)

    req.write(body)
    req.end()
  })
}

const requestJsonWithRetry = async (
  url: string,
  payload: Record<string, any>,
  operation: string,
): Promise<any> => {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await postJson(url, payload)
      const parsed = parseResponseText(response.bodyText)
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const reason = String(parsed?.error_description || parsed?.error || response.bodyText || response.statusText || '').trim()
        if (RETRYABLE_STATUS.has(response.statusCode) && attempt < REQUEST_MAX_ATTEMPTS) {
          await sleep(attempt * 500)
          continue
        }
        throw new Error(`${operation} failed: ${response.statusCode} ${reason}`.trim())
      }
      return parsed
    } catch (error) {
      lastError = error
      const message = String((error as any)?.message || '')
      if (message.startsWith(`${operation} failed:`)) {
        throw error
      }
      if (attempt < REQUEST_MAX_ATTEMPTS && isRetriableNetworkError(error)) {
        await sleep(attempt * 500)
        continue
      }
      throw new Error(`${operation} network error: ${formatNetworkError(error)}`)
    }
  }
  throw new Error(`${operation} network error: ${formatNetworkError(lastError)}`)
}

const normalizeDeviceCodeResponse = (raw: any): DeviceCodeResponse => {
  const deviceCode = String(raw?.device_code || '').trim()
  const userCode = String(raw?.user_code || '').trim()
  const verificationUri = String(raw?.verification_uri || '').trim()
  const verificationUriComplete = String(raw?.verification_uri_complete || '').trim()
  const interval = Number(raw?.interval)
  const expiresIn = Number(raw?.expires_in)

  if (!deviceCode || !userCode || !verificationUri || !Number.isFinite(interval) || !Number.isFinite(expiresIn)) {
    throw new Error('Invalid GitHub device code response')
  }

  return {
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: verificationUri,
    verification_uri_complete: verificationUriComplete || undefined,
    interval,
    expires_in: expiresIn,
  }
}

githubCopilotOauthRouter.post('/oauth/device-code', async (req, res) => {
  const domain = normalizeDomain(req.body?.enterpriseDomain || '') || 'github.com'
  if (isUnsafeDomain(domain)) {
    return res.status(400).json({ success: false, error: 'Invalid enterprise domain' })
  }
  const urls = getCopilotUrls(domain)

  try {
    const raw = await requestJsonWithRetry(urls.deviceCodeUrl, {
      client_id: GITHUB_COPILOT_CLIENT_ID,
      scope: 'read:user',
    }, 'GitHub device code request')
    const data = normalizeDeviceCodeResponse(raw)
    return res.json({ success: true, data })
  } catch (error: any) {
    const message = String(error?.message || 'Failed to request GitHub device code')
    const statusCode = /network error|timed out|fetch failed|econn|enotfound|eai_again/i.test(message) ? 502 : 400
    return res.status(statusCode).json({
      success: false,
      error: message,
    })
  }
})

githubCopilotOauthRouter.post('/oauth/access-token', async (req, res) => {
  const deviceCode = String(req.body?.deviceCode || '').trim()
  if (!deviceCode) {
    return res.status(400).json({ success: false, error: 'deviceCode is required' })
  }

  const domain = normalizeDomain(req.body?.enterpriseDomain || '') || 'github.com'
  if (isUnsafeDomain(domain)) {
    return res.status(400).json({ success: false, error: 'Invalid enterprise domain' })
  }
  const urls = getCopilotUrls(domain)

  try {
    const data = await requestJsonWithRetry(urls.accessTokenUrl, {
      client_id: GITHUB_COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }, 'GitHub device token poll')
    return res.json({ success: true, data })
  } catch (error: any) {
    const message = String(error?.message || 'Failed to poll GitHub device token')
    const statusCode = /network error|timed out|fetch failed|econn|enotfound|eai_again/i.test(message) ? 502 : 400
    return res.status(statusCode).json({
      success: false,
      error: message,
    })
  }
})
