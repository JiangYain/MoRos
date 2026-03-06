import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import readline from 'readline'

const require = createRequire(import.meta.url)

const parsePositiveIntEnv = (name: string, fallback: number): number => {
  const rawValue = Number.parseInt(String(process.env[name] || '').trim(), 10)
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return fallback
  }
  return rawValue
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000
const SESSION_SWEEP_INTERVAL_MS = 60 * 1000
const RPC_REQUEST_TIMEOUT_MS = 30 * 1000
const PROMPT_TIMEOUT_MS = 15 * 60 * 1000
const PROMPT_INACTIVITY_TIMEOUT_MS = parsePositiveIntEnv(
  'MOROS_PROMPT_INACTIVITY_TIMEOUT_MS',
  3 * 60 * 1000,
)
const DEFAULT_MODEL = 'gpt-4o'

type JsonRecord = Record<string, any>

type RpcResponse = {
  id?: string
  type: 'response'
  command: string
  success: boolean
  data?: any
  error?: string
}

type RpcAgentEvent = JsonRecord & {
  type: string
}

export type RpcImageInput = {
  type: 'image'
  data: string
  mimeType: string
}

type RpcPromptOptions = {
  message: string
  images?: RpcImageInput[]
  signal?: AbortSignal
  onEvent?: (event: RpcAgentEvent) => void
}

type RpcPromptResult = {
  assistantText: string
  finalEvent?: RpcAgentEvent
}

class RpcPromptError extends Error {
  details?: JsonRecord

  constructor(message: string, details?: JsonRecord) {
    super(message)
    this.name = 'RpcPromptError'
    this.details = details
  }
}

type RpcAgentSessionMeta = {
  runtimeSessionId: string
  sessionId?: string
  sessionFile?: string
  currentModel: string
  lastUsedAt: number
}

type CliLauncher = {
  command: string
  args: string[]
  source: string
}

type PendingRequest = {
  resolve: (response: RpcResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const safeExists = (targetPath: string): boolean => {
  try {
    return fs.existsSync(targetPath)
  } catch {
    return false
  }
}

const normalizeSessionFile = (value?: string): string | undefined => {
  const filePath = String(value || '').trim()
  if (!filePath) return undefined
  return path.resolve(filePath)
}

const normalizeSkillPaths = (value?: string[]): string[] => {
  if (!Array.isArray(value)) return []
  const cleaned = value
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0)
  const deduped = Array.from(new Set(cleaned))
  deduped.sort((a, b) => a.localeCompare(b))
  return deduped
}

const normalizeWorkingDirectory = (value?: string): string => {
  const raw = String(value || '').trim()
  if (!raw) return path.resolve(process.cwd())
  return path.resolve(raw)
}

const buildTokenFingerprint = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24)
}

const resolveCopilotBaseUrlFromToken = (token: string): string | undefined => {
  const match = String(token || '').match(/proxy-ep=([^;]+)/i)
  if (!match) return undefined
  const proxyHost = String(match[1] || '').trim().toLowerCase()
  if (!proxyHost) return undefined
  const apiHost = proxyHost.replace(/^proxy\./, 'api.')
  if (!/^[a-z0-9.-]+$/.test(apiHost)) return undefined
  return `https://${apiHost}`
}

const ensureRuntimeAgentConfig = (
  agentDir: string,
  copilotBaseUrl?: string,
  skillPaths: string[] = [],
): void => {
  fs.mkdirSync(agentDir, { recursive: true })

  if (copilotBaseUrl) {
    const modelsPath = path.join(agentDir, 'models.json')
    const modelsPayload = {
      providers: {
        'github-copilot': {
          baseUrl: copilotBaseUrl,
        },
      },
    }
    fs.writeFileSync(modelsPath, JSON.stringify(modelsPayload, null, 2), 'utf-8')
  }

  const settingsPath = path.join(agentDir, 'settings.json')
  let settingsPayload: JsonRecord = {}
  if (safeExists(settingsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settingsPayload = parsed
      }
    } catch {
      // ignore invalid runtime settings and overwrite below
    }
  }
  settingsPayload.skills = skillPaths
  fs.writeFileSync(settingsPath, JSON.stringify(settingsPayload, null, 2), 'utf-8')
}

const extractAssistantText = (assistantMessage: any): string => {
  if (!assistantMessage || assistantMessage.role !== 'assistant') return ''
  if (!Array.isArray(assistantMessage.content)) return ''
  return assistantMessage.content
    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block: any) => String(block.text))
    .join('')
}

const extractAssistantError = (assistantMessage: any): string => {
  if (!assistantMessage || assistantMessage.role !== 'assistant') return ''
  const stopReason = String(assistantMessage?.stopReason || '').toLowerCase()
  const errorMessage = String(assistantMessage?.errorMessage || '').trim()
  const assistantText = extractAssistantText(assistantMessage).trim()
  const normalizedErrorMessage = errorMessage.toLowerCase()
  const isGenericProviderError =
    normalizedErrorMessage === 'an unknown error occurred' ||
    normalizedErrorMessage === 'model request failed with stopreason=error'

  if (errorMessage) {
    // Some providers return a generic error message even when full assistant text
    // is already available. Prefer delivering the usable answer in this case.
    if (assistantText && isGenericProviderError) return ''
    return errorMessage
  }

  if (stopReason === 'error') {
    if (assistantText) return ''
    return 'Model request failed with stopReason=error'
  }

  return ''
}

const resolveCliLauncher = (): CliLauncher => {
  const envPath = String(process.env.MOROS_PI_CLI_PATH || '').trim()
  if (envPath) {
    if (safeExists(envPath)) {
      if (envPath.endsWith('.js') || envPath.endsWith('.mjs') || envPath.endsWith('.cjs')) {
        return {
          command: process.execPath,
          args: [envPath],
          source: 'MOROS_PI_CLI_PATH(node-script)',
        }
      }
      return { command: envPath, args: [], source: 'MOROS_PI_CLI_PATH(executable)' }
    }
    throw new Error(`MOROS_PI_CLI_PATH does not exist: ${envPath}`)
  }

  try {
    const pkgJsonPath = require.resolve('@mariozechner/pi-coding-agent/package.json')
    const distCliPath = path.join(path.dirname(pkgJsonPath), 'dist', 'cli.js')
    if (safeExists(distCliPath)) {
      return {
        command: process.execPath,
        args: [distCliPath],
        source: '@mariozechner/pi-coding-agent',
      }
    }
  } catch {
    // ignore resolution failures
  }

  const workspaceDistCli = path.resolve(process.cwd(), '../coding-agent/dist/cli.js')
  if (safeExists(workspaceDistCli)) {
    return {
      command: process.execPath,
      args: [workspaceDistCli],
      source: 'workspace-dist',
    }
  }

  const workspaceSrcCli = path.resolve(process.cwd(), '../coding-agent/src/cli.ts')
  if (safeExists(workspaceSrcCli)) {
    try {
      const tsxPkgPath = require.resolve('tsx/package.json')
      const tsxCliPath = path.join(path.dirname(tsxPkgPath), 'dist', 'cli.mjs')
      if (!safeExists(tsxCliPath)) {
        throw new Error(`tsx cli not found at ${tsxCliPath}`)
      }
      return {
        command: process.execPath,
        args: [tsxCliPath, workspaceSrcCli],
        source: 'workspace-src-tsx',
      }
    } catch {
      return {
        command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
        args: ['tsx', workspaceSrcCli],
        source: 'workspace-src-npx-tsx',
      }
    }
  }

  return {
    command: process.platform === 'win32' ? 'pi.cmd' : 'pi',
    args: [],
    source: 'global-pi',
  }
}

class RpcAgentSession {
  readonly runtimeSessionId: string
  private readonly tokenFingerprint: string
  private readonly events = new EventEmitter()
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly sessionDir: string
  private readonly runtimeAgentDir: string
  private readonly resumeSessionFile?: string
  private readonly launcher: CliLauncher
  private readonly skillPaths: string[]
  private readonly skillPathsSignature: string
  private readonly workingDirectory: string

  private process?: ChildProcessWithoutNullStreams
  private stdoutReader?: readline.Interface
  private stderrBuffer = ''
  private requestSeq = 0
  private started = false
  private disposed = false
  private prompting = false
  private currentModel: string
  private sessionId?: string
  private sessionFile?: string
  private lastUsedAt = Date.now()

  constructor(options: {
    runtimeSessionId: string
    model: string
    copilotToken: string
    resumeSessionFile?: string
    skillPaths?: string[]
    workingDirectory?: string
  }) {
    this.runtimeSessionId = options.runtimeSessionId
    this.currentModel = String(options.model || DEFAULT_MODEL)
    this.tokenFingerprint = buildTokenFingerprint(options.copilotToken)
    this.resumeSessionFile = normalizeSessionFile(options.resumeSessionFile)
    this.skillPaths = normalizeSkillPaths(options.skillPaths)
    this.skillPathsSignature = JSON.stringify(this.skillPaths)
    this.workingDirectory = normalizeWorkingDirectory(options.workingDirectory)
    this.sessionDir = path.join(process.cwd(), 'markov-data', 'agent-sessions')
    this.runtimeAgentDir = path.join(process.cwd(), 'markov-data', 'pi-agent-runtime', this.tokenFingerprint)
    this.launcher = resolveCliLauncher()
  }

  isTokenCompatible(token: string): boolean {
    return buildTokenFingerprint(token) === this.tokenFingerprint
  }

  isSkillPathsCompatible(skillPaths?: string[]): boolean {
    return JSON.stringify(normalizeSkillPaths(skillPaths)) === this.skillPathsSignature
  }

  isWorkingDirectoryCompatible(workingDirectory?: string): boolean {
    return normalizeWorkingDirectory(workingDirectory) === this.workingDirectory
  }

  matchesSessionFile(filePath?: string): boolean {
    const normalized = normalizeSessionFile(filePath)
    if (!normalized) return false
    return normalized === this.sessionFile
  }

  getMeta(): RpcAgentSessionMeta {
    return {
      runtimeSessionId: this.runtimeSessionId,
      sessionId: this.sessionId,
      sessionFile: this.sessionFile,
      currentModel: this.currentModel,
      lastUsedAt: this.lastUsedAt,
    }
  }

  isIdleExpired(now: number, idleTimeoutMs: number): boolean {
    if (!this.started || this.disposed || this.prompting) return false
    return now - this.lastUsedAt > idleTimeoutMs
  }

  private touch() {
    this.lastUsedAt = Date.now()
  }

  async start(copilotToken: string): Promise<void> {
    if (this.started) return
    if (this.disposed) {
      throw new Error('RPC session already disposed')
    }

    fs.mkdirSync(this.sessionDir, { recursive: true })
    const dynamicCopilotBaseUrl = resolveCopilotBaseUrlFromToken(copilotToken)
    ensureRuntimeAgentConfig(this.runtimeAgentDir, dynamicCopilotBaseUrl, this.skillPaths)

    const launchArgs = [
      ...this.launcher.args,
      '--mode',
      'rpc',
      '--provider',
      'github-copilot',
      '--model',
      this.currentModel,
      '--session-dir',
      this.sessionDir,
    ]
    if (this.resumeSessionFile) {
      launchArgs.push('--session', this.resumeSessionFile)
    }

    this.process = spawn(this.launcher.command, launchArgs, {
      cwd: this.workingDirectory,
      env: {
        ...process.env,
        COPILOT_GITHUB_TOKEN: copilotToken,
        GH_TOKEN: copilotToken,
        GITHUB_TOKEN: copilotToken,
        PI_CODING_AGENT_DIR: this.runtimeAgentDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const sid = this.runtimeSessionId.slice(0, 8)
    console.log(
      `[RpcAgent:${sid}] spawn: ${this.launcher.command} ${launchArgs.join(' ')} (cwd=${this.workingDirectory}, source=${this.launcher.source}, agentDir=${this.runtimeAgentDir}, copilotBase=${dynamicCopilotBaseUrl || 'default'})`,
    )

    this.process.on('error', (error) => {
      console.error(`[RpcAgent:${sid}] process error:`, error.message)
      this.failAllPending(error instanceof Error ? error : new Error(String(error)))
    })

    this.process.on('exit', (code, signal) => {
      const reason = `RPC process exited (code=${String(code)}, signal=${String(signal)})`
      console.log(`[RpcAgent:${sid}] ${reason}. stderr(tail): ${this.stderrBuffer.slice(-500)}`)
      this.failAllPending(new Error(`${reason}. stderr: ${this.stderrBuffer.slice(-4000)}`))
      this.events.emit('event', { type: 'rpc_process_exit', code, signal, reason })
      this.started = false
    })

    this.process.stderr.on('data', (chunk: Buffer | string) => {
      this.stderrBuffer += String(chunk || '')
      if (this.stderrBuffer.length > 8000) {
        this.stderrBuffer = this.stderrBuffer.slice(-8000)
      }
    })

    this.stdoutReader = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    })

    this.stdoutReader.on('line', (line) => this.handleStdoutLine(line))

    await this.waitForReady()
    this.started = true
    this.touch()
  }

  private async waitForReady(): Promise<void> {
    const maxAttempts = 12
    let lastError: any
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const state = await this.sendCommand<{ sessionId?: string; sessionFile?: string; model?: { id?: string } }>(
          { type: 'get_state' },
          RPC_REQUEST_TIMEOUT_MS + attempt * 400,
        )
        this.sessionId = state?.sessionId
        this.sessionFile = normalizeSessionFile(state?.sessionFile)
        if (state?.model?.id) {
          this.currentModel = state.model.id
        }
        return
      } catch (error) {
        lastError = error
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
      }
    }
    throw new Error(
      `Failed to initialize local CLI RPC session after ${maxAttempts} attempts: ${
        lastError?.message || String(lastError || 'unknown error')
      }`,
    )
  }

  private handleStdoutLine(line: string) {
    if (!line) return
    let payload: any
    try {
      payload = JSON.parse(line)
    } catch {
      console.log(`[RpcAgent:${this.runtimeSessionId.slice(0, 8)}] non-JSON stdout: ${line.slice(0, 120)}`)
      return
    }
    if (!payload || typeof payload !== 'object') return

    if (payload.type === 'response' && payload.id) {
      const pending = this.pendingRequests.get(String(payload.id))
      if (!pending) {
        console.log(`[RpcAgent:${this.runtimeSessionId.slice(0, 8)}] orphan response id=${payload.id} cmd=${payload.command}`)
        return
      }
      this.pendingRequests.delete(String(payload.id))
      clearTimeout(pending.timer)
      pending.resolve(payload as RpcResponse)
      return
    }

    if (typeof payload.type === 'string') {
      this.touch()
      const evType = String(payload.type)
      if (evType === 'extension_ui_request') {
        this.respondToExtensionUiRequest(payload)
      }
      if (evType === 'message_update') {
        const ame = payload?.assistantMessageEvent
        console.log(`[RpcAgent:${this.runtimeSessionId.slice(0, 8)}] event: message_update ame.type=${ame?.type} delta_len=${typeof ame?.delta === 'string' ? ame.delta.length : '-'}`)
      } else if (evType !== 'extension_ui_request') {
        console.log(`[RpcAgent:${this.runtimeSessionId.slice(0, 8)}] event: ${evType}`)
      }
      this.events.emit('event', payload as RpcAgentEvent)
    }
  }

  private respondToExtensionUiRequest(payload: JsonRecord): void {
    const id = String(payload?.id || '').trim()
    const method = String(payload?.method || '').trim()
    if (!id || !method || !this.process?.stdin || this.disposed) return

    let response: JsonRecord | null = null
    if (method === 'confirm') {
      // RPC host has no interactive approval UI; auto-approve to avoid hanging tool calls.
      response = { type: 'extension_ui_response', id, confirmed: true }
    } else if (method === 'select') {
      const options = Array.isArray(payload?.options) ? payload.options : []
      const firstOption = options.length > 0 ? String(options[0] || '') : ''
      response = firstOption
        ? { type: 'extension_ui_response', id, value: firstOption }
        : { type: 'extension_ui_response', id, cancelled: true }
    } else if (method === 'input') {
      const value = String(payload?.placeholder || '')
      response = { type: 'extension_ui_response', id, value }
    } else if (method === 'editor') {
      const value = String(payload?.prefill || '')
      response = { type: 'extension_ui_response', id, value }
    }

    if (!response) return
    try {
      this.process.stdin.write(`${JSON.stringify(response)}\n`)
      console.log(`[RpcAgent:${this.runtimeSessionId.slice(0, 8)}] auto-respond extension_ui_request method=${method}`)
    } catch (error: any) {
      console.error(`[RpcAgent:${this.runtimeSessionId.slice(0, 8)}] failed to respond extension_ui_request:`, error?.message || error)
    }
  }

  private failAllPending(error: Error) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pendingRequests.delete(id)
    }
  }

  private async sendCommand<T = any>(command: JsonRecord, timeoutMs: number = RPC_REQUEST_TIMEOUT_MS): Promise<T> {
    const response = await this.sendCommandRaw(command, timeoutMs)
    if (!response.success) {
      throw new Error(response.error || `${String(command?.type || 'rpc')} failed`)
    }
    return response.data as T
  }

  private sendCommandRaw(command: JsonRecord, timeoutMs: number): Promise<RpcResponse> {
    if (!this.process || !this.process.stdin || this.disposed) {
      return Promise.reject(new Error('RPC process is not running'))
    }

    const id = `moros_${Date.now()}_${++this.requestSeq}`
    const payload = { ...command, id }
    const payloadText = `${JSON.stringify(payload)}\n`

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC command timeout: ${String(command?.type || 'unknown')}`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timer,
      })

      this.process!.stdin.write(payloadText, (error) => {
        if (error) {
          const pending = this.pendingRequests.get(id)
          if (!pending) return
          this.pendingRequests.delete(id)
          clearTimeout(pending.timer)
          pending.reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

  async ensureModel(model: string): Promise<void> {
    const normalized = String(model || '').trim() || DEFAULT_MODEL
    if (normalized === this.currentModel) {
      if (!this.isAlive()) {
        throw new Error('Agent session process is not alive')
      }
      return
    }

    await this.sendCommand({ type: 'set_model', provider: 'github-copilot', modelId: normalized })
    this.currentModel = normalized
    this.touch()
  }

  async abort(): Promise<void> {
    try {
      await this.sendCommand({ type: 'abort' })
    } catch {
      // ignore abort errors
    }
  }

  isAlive(): boolean {
    return this.started && !this.disposed && !!this.process && !this.process.killed
  }

  async ping(): Promise<boolean> {
    if (!this.isAlive()) return false
    try {
      await this.sendCommand({ type: 'get_state' }, 6000)
      return true
    } catch {
      return false
    }
  }

  async prompt(options: RpcPromptOptions): Promise<RpcPromptResult> {
    if (this.prompting) {
      throw new Error('Agent session is busy processing another prompt')
    }
    if (!this.started || this.disposed) {
      throw new Error('Agent session is not available (process not started)')
    }
    if (this.process && this.process.killed) {
      this.started = false
      throw new Error('Agent session process has been killed')
    }

    this.prompting = true
    this.touch()

    let assistantText = ''
    let completed = false
    let eventCount = 0
    const promptStartedAt = Date.now()
    let lastEventAt = promptStartedAt
    const signal = options.signal

    return await new Promise<RpcPromptResult>(async (resolve, reject) => {
      let retryInProgress = false
      let pendingRetryError: RpcPromptError | null = null
      let pendingRetryErrorTimer: NodeJS.Timeout | null = null
      let timeout: NodeJS.Timeout | null = null
      let inactivityTimeout: NodeJS.Timeout | null = null

      const settlePromptTimeout = (timeoutKind: 'hard' | 'inactivity') => {
        const now = Date.now()
        const elapsedMs = now - promptStartedAt
        const idleForMs = now - lastEventAt
        let message = `Timed out waiting for agent response (received ${eventCount} events, text length=${assistantText.length})`
        if (timeoutKind === 'inactivity') {
          message = `Prompt timed out due to inactivity after ${Math.round(elapsedMs / 1000)}s (idle ${Math.round(idleForMs / 1000)}s, events=${eventCount}, text length=${assistantText.length})`
        }
        void this.abort().catch(() => {})
        settleError(
          new RpcPromptError(message, {
            timeoutKind,
            elapsedMs,
            idleForMs,
            eventCount,
            assistantTextLength: assistantText.length,
            retryInProgress,
          }),
        )
      }

      const resetInactivityTimeout = () => {
        if (inactivityTimeout) {
          clearTimeout(inactivityTimeout)
        }
        inactivityTimeout = setTimeout(() => {
          if (completed) return
          settlePromptTimeout('inactivity')
        }, PROMPT_INACTIVITY_TIMEOUT_MS)
      }

      const clearPendingRetryError = () => {
        pendingRetryError = null
        if (pendingRetryErrorTimer) {
          clearTimeout(pendingRetryErrorTimer)
          pendingRetryErrorTimer = null
        }
      }

      const deferErrorUntilRetryWindow = (error: RpcPromptError) => {
        pendingRetryError = error
        if (pendingRetryErrorTimer) {
          clearTimeout(pendingRetryErrorTimer)
        }
        // The coding-agent may emit an assistant error first and then auto_retry_start.
        // Wait a short grace window before treating it as a terminal failure.
        pendingRetryErrorTimer = setTimeout(() => {
          if (completed || retryInProgress) return
          const finalError = pendingRetryError || error
          clearPendingRetryError()
          settleError(finalError)
        }, 1200)
      }

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout)
          timeout = null
        }
        if (inactivityTimeout) {
          clearTimeout(inactivityTimeout)
          inactivityTimeout = null
        }
        clearPendingRetryError()
        this.events.off('event', onEvent)
        signal?.removeEventListener('abort', onAbortSignal)
        this.prompting = false
      }

      const settleSuccess = (result: RpcPromptResult) => {
        if (completed) return
        completed = true
        cleanup()
        resolve(result)
      }

      const settleError = (error: Error) => {
        if (completed) return
        completed = true
        cleanup()
        reject(error)
      }

      const onAbortSignal = () => {
        this.abort().finally(() => {
          settleError(new Error('Prompt aborted by signal'))
        })
      }

      const onEvent = (event: RpcAgentEvent) => {
        eventCount++
        lastEventAt = Date.now()
        resetInactivityTimeout()

        try {
          options.onEvent?.(event)
        } catch (callbackErr) {
          console.error('[RpcAgent] onEvent callback error:', callbackErr)
        }

        if (event.type === 'rpc_process_exit') {
          const reason = event.reason || `Process exited (code=${event.code})`
          settleError(new Error(`CLI process terminated during prompt: ${reason}`))
          return
        }

        if (event.type === 'message_update') {
          const deltaType = event?.assistantMessageEvent?.type
          const deltaText = event?.assistantMessageEvent?.delta
          if (deltaType === 'text_delta' && typeof deltaText === 'string') {
            assistantText += deltaText
          }
        }

        if (event.type === 'auto_retry_start') {
          retryInProgress = true
          assistantText = ''
          clearPendingRetryError()
          return
        }

        if (event.type === 'auto_retry_end') {
          retryInProgress = false
          if (event?.success === false) {
            const finalErrorMessage =
              String(event?.finalError || pendingRetryError?.message || 'Auto retry failed').trim() || 'Auto retry failed'
            const details = {
              event,
              assistantText,
              previousError: pendingRetryError?.details,
            }
            clearPendingRetryError()
            settleError(new RpcPromptError(finalErrorMessage, details))
            return
          }
          clearPendingRetryError()
          return
        }

        if (event.type === 'message_end' && event?.message?.role === 'assistant') {
          const assistantError = extractAssistantError(event.message)
          if (assistantError) {
            deferErrorUntilRetryWindow(
              new RpcPromptError(assistantError, {
                event,
                assistantText,
              }),
            )
            return
          }
          const text = extractAssistantText(event.message)
          if (text) {
            assistantText = text
          }
        }

        if (event.type === 'agent_end') {
          const latestAssistant = Array.isArray(event?.messages)
            ? [...event.messages].reverse().find((message: any) => message?.role === 'assistant')
            : undefined
          const assistantError = extractAssistantError(latestAssistant)
          if (assistantError) {
            deferErrorUntilRetryWindow(
              new RpcPromptError(assistantError, {
                event,
                assistantText,
              }),
            )
            return
          }
          clearPendingRetryError()
          const finalText = extractAssistantText(latestAssistant)
          if (finalText) {
            assistantText = finalText
          }
          settleSuccess({
            assistantText,
            finalEvent: event,
          })
        }
      }

      timeout = setTimeout(() => {
        settlePromptTimeout('hard')
      }, PROMPT_TIMEOUT_MS)
      resetInactivityTimeout()

      this.events.on('event', onEvent)
      signal?.addEventListener('abort', onAbortSignal, { once: true })

      try {
        await this.sendCommand({
          type: 'prompt',
          message: options.message,
          images: Array.isArray(options.images) && options.images.length > 0 ? options.images : undefined,
        })
      } catch (error: any) {
        settleError(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async dispose() {
    if (this.disposed) return

    try {
      await this.abort()
    } catch {}

    this.disposed = true

    this.stdoutReader?.close()
    this.stdoutReader = undefined
    this.failAllPending(new Error('RPC session disposed'))

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM')
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          try {
            this.process.kill('SIGKILL')
          } catch {}
        }
      }, 800)
    }
  }
}

export class RpcAgentSessionManager {
  private readonly sessions = new Map<string, RpcAgentSession>()
  private readonly idleTimeoutMs: number

  constructor(idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs
    const timer = setInterval(() => {
      void this.sweepIdleSessions()
    }, SESSION_SWEEP_INTERVAL_MS)
    timer.unref?.()
  }

  async getOrCreateSession(options: {
    runtimeSessionId?: string
    resumeSessionFile?: string
    model?: string
    copilotToken: string
    skillPaths?: string[]
    workingDirectory?: string
  }): Promise<{ runtimeSessionId: string; session: RpcAgentSession; created: boolean }> {
    const startupModel = DEFAULT_MODEL
    const normalizedResumeFile = normalizeSessionFile(options.resumeSessionFile)
    const requestedRuntimeId = String(options.runtimeSessionId || '').trim()

    if (requestedRuntimeId) {
      const existing = this.sessions.get(requestedRuntimeId)
      if (existing) {
        if (!existing.isTokenCompatible(options.copilotToken)) {
          console.log(`[SessionMgr] Token mismatch for session ${requestedRuntimeId}, disposing`)
          await existing.dispose()
          this.sessions.delete(requestedRuntimeId)
        } else if (!existing.isSkillPathsCompatible(options.skillPaths)) {
          console.log(`[SessionMgr] Skill paths changed for session ${requestedRuntimeId}, disposing`)
          await existing.dispose().catch(() => {})
          this.sessions.delete(requestedRuntimeId)
        } else if (!existing.isWorkingDirectoryCompatible(options.workingDirectory)) {
          console.log(`[SessionMgr] Working directory changed for session ${requestedRuntimeId}, disposing`)
          await existing.dispose().catch(() => {})
          this.sessions.delete(requestedRuntimeId)
        } else if (!existing.isAlive()) {
          console.log(`[SessionMgr] Session ${requestedRuntimeId} is dead, disposing and creating new`)
          await existing.dispose().catch(() => {})
          this.sessions.delete(requestedRuntimeId)
        } else {
          return { runtimeSessionId: requestedRuntimeId, session: existing, created: false }
        }
      }
    }

    if (!requestedRuntimeId && normalizedResumeFile) {
      for (const [runtimeSessionId, session] of this.sessions.entries()) {
        if (
          session.matchesSessionFile(normalizedResumeFile) &&
          session.isTokenCompatible(options.copilotToken) &&
          session.isSkillPathsCompatible(options.skillPaths) &&
          session.isWorkingDirectoryCompatible(options.workingDirectory)
        ) {
          if (!session.isAlive()) {
            console.log(`[SessionMgr] Matched session ${runtimeSessionId} by file is dead, disposing`)
            await session.dispose().catch(() => {})
            this.sessions.delete(runtimeSessionId)
            continue
          }
          return { runtimeSessionId, session, created: false }
        }
      }
    }

    const runtimeSessionId = requestedRuntimeId || crypto.randomUUID()
    console.log(`[SessionMgr] Creating new session ${runtimeSessionId} with model=${startupModel}`)
    const session = new RpcAgentSession({
      runtimeSessionId,
      model: startupModel,
      copilotToken: options.copilotToken,
      resumeSessionFile: normalizedResumeFile,
      skillPaths: options.skillPaths,
      workingDirectory: options.workingDirectory,
    })
    await session.start(options.copilotToken)
    this.sessions.set(runtimeSessionId, session)
    return { runtimeSessionId, session, created: true }
  }

  async abortSession(runtimeSessionId: string): Promise<void> {
    const session = this.sessions.get(String(runtimeSessionId || '').trim())
    if (!session) return
    await session.abort()
  }

  async closeSession(runtimeSessionId: string): Promise<void> {
    const key = String(runtimeSessionId || '').trim()
    const session = this.sessions.get(key)
    if (!session) return
    await session.dispose()
    this.sessions.delete(key)
  }

  private async sweepIdleSessions(): Promise<void> {
    const now = Date.now()
    for (const [runtimeSessionId, session] of this.sessions.entries()) {
      if (!session.isIdleExpired(now, this.idleTimeoutMs)) continue
      await session.dispose()
      this.sessions.delete(runtimeSessionId)
    }
  }
}

export const rpcAgentSessionManager = new RpcAgentSessionManager()
