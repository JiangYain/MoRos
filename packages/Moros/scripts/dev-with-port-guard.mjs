import { execSync, spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import process from 'node:process'

const DEV_PORTS = [53210, 53211]
const YES_ANSWERS = new Set(['y', 'yes'])

const parsePortFromAddress = (address) => {
  const match = String(address || '').match(/:(\d+)$/)
  if (!match?.[1]) return null
  const port = Number.parseInt(match[1], 10)
  return Number.isFinite(port) ? port : null
}

const isListeningState = (stateToken) => {
  const token = String(stateToken || '').trim()
  if (!token) return false
  const upper = token.toUpperCase()
  return upper.includes('LISTEN') || token.includes('侦听')
}

const getListeningOwnersByPortWindows = () => {
  const owners = new Map()
  const raw = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
  const lines = String(raw || '').split(/\r?\n/)

  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5) continue
    if (String(parts[0] || '').toUpperCase() !== 'TCP') continue
    const localAddress = parts[1]
    const stateToken = parts[parts.length - 2]
    const pidToken = parts[parts.length - 1]
    if (!isListeningState(stateToken)) continue
    const port = parsePortFromAddress(localAddress)
    const pid = Number.parseInt(String(pidToken || ''), 10)
    if (!Number.isFinite(port) || !Number.isFinite(pid)) continue

    if (!owners.has(port)) owners.set(port, new Set())
    owners.get(port).add(pid)
  }

  return owners
}

const getListeningOwnersByPortUnix = () => {
  const owners = new Map()
  const raw = execSync('lsof -nP -iTCP -sTCP:LISTEN', { encoding: 'utf8' })
  const lines = String(raw || '').split(/\r?\n/).slice(1)

  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    const pid = Number.parseInt(String(parts[1] || ''), 10)
    const nameToken = parts[8]
    const port = parsePortFromAddress(nameToken)
    if (!Number.isFinite(port) || !Number.isFinite(pid)) continue

    if (!owners.has(port)) owners.set(port, new Set())
    owners.get(port).add(pid)
  }

  return owners
}

const getListeningOwnersByPort = () => {
  try {
    if (process.platform === 'win32') return getListeningOwnersByPortWindows()
    return getListeningOwnersByPortUnix()
  } catch {
    return new Map()
  }
}

const listOccupiedPorts = (ports) => {
  const ownersByPort = getListeningOwnersByPort()
  return ports
    .map((port) => {
      const pids = [...(ownersByPort.get(port) || new Set())]
        .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid)
      return { port, pids }
    })
    .filter((item) => item.pids.length > 0)
}

const formatOccupiedPorts = (occupied) => {
  return occupied
    .map((item) => `:${item.port} (PID ${item.pids.join(', ')})`)
    .join(', ')
}

const askForCleanup = async (occupied) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(`[dev] 端口已占用且当前非交互终端：${formatOccupiedPorts(occupied)}`)
    return false
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(
      `[dev] 检测到端口占用 ${formatOccupiedPorts(occupied)}，是否结束旧进程并继续启动？(y/N): `,
    )
    return YES_ANSWERS.has(String(answer || '').trim().toLowerCase())
  } finally {
    rl.close()
  }
}

const killPid = (pid) => {
  if (!Number.isFinite(pid) || pid <= 0) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
  } catch {}
}

const launchDevStack = () => {
  const child = spawn('npm run dev:stack', {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  })

  const forwardSignal = (signal) => {
    try {
      child.kill(signal)
    } catch {}
  }

  process.on('SIGINT', forwardSignal)
  process.on('SIGTERM', forwardSignal)

  child.on('exit', (code, signal) => {
    process.off('SIGINT', forwardSignal)
    process.off('SIGTERM', forwardSignal)

    if (signal) {
      process.exit(1)
      return
    }
    process.exit(code ?? 0)
  })
}

const main = async () => {
  const occupied = listOccupiedPorts(DEV_PORTS)
  if (occupied.length > 0) {
    const shouldCleanup = await askForCleanup(occupied)
    if (!shouldCleanup) {
      console.log('[dev] 已取消启动。')
      process.exit(1)
      return
    }

    const allPids = [...new Set(occupied.flatMap((item) => item.pids))]
    for (const pid of allPids) {
      killPid(pid)
    }

    await new Promise((resolve) => setTimeout(resolve, 600))
    const remaining = listOccupiedPorts(DEV_PORTS)
    if (remaining.length > 0) {
      console.error(`[dev] 端口仍被占用：${formatOccupiedPorts(remaining)}，请手动清理后重试。`)
      process.exit(1)
      return
    }
  }

  launchDevStack()
}

await main()
