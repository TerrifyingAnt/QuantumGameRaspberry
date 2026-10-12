import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import readline from 'node:readline'
import { NFC_BRIDGE_SCRIPT, NFC_MODE, PYTHON_BIN } from './config.js'

export interface TagEvent {
  uidHex: string
  textData?: string
  /** В mock-режиме при активном writeCard считаем запись успешной. */
  mockWriteOk?: boolean
}

export type TagHandler = (event: TagEvent) => void

export type NfcStatus = {
  mode: 'mock' | 'hardware' | 'starting' | 'error'
  firmware?: string
  lastError?: string
  lastUid?: string
  lastText?: string
}

export interface NfcBridge {
  onTag(handler: TagHandler): void
  requestWrite(text: string): void
  cancelWrite(): void
  injectMockTag(uidHex: string, textData?: string): void
  start(): void
  stop(): void
  getStatus(): NfcStatus
}

abstract class BaseBridge implements NfcBridge {
  protected handlers: TagHandler[] = []
  protected pendingWrite: string | null = null
  protected status: NfcStatus = { mode: 'starting' }

  onTag(handler: TagHandler): void {
    this.handlers.push(handler)
  }

  getStatus(): NfcStatus {
    return { ...this.status }
  }

  protected emit(event: TagEvent): void {
    this.status = {
      ...this.status,
      lastUid: event.uidHex,
      lastText: event.textData,
    }
    for (const handler of this.handlers) handler(event)
  }

  requestWrite(text: string): void {
    this.pendingWrite = text
  }

  cancelWrite(): void {
    this.pendingWrite = null
  }

  injectMockTag(_uidHex: string, _textData?: string): void {
    /* override in mock */
  }

  abstract start(): void
  abstract stop(): void
}

/** Mock для разработки без PN532: HTTP POST /api/nfc/scan. */
export class MockNfcBridge extends BaseBridge {
  start(): void {
    this.status = { mode: 'mock' }
    console.log('[NFC] Mock mode — POST /api/nfc/scan {"uid":"...","text":"..."}')
  }

  stop(): void {}

  injectMockTag(uidHex: string, textData?: string): void {
    const text = textData ?? this.pendingWrite ?? undefined
    const mockWriteOk =
      this.pendingWrite !== null && (text === this.pendingWrite || textData === undefined)
    if (mockWriteOk && this.pendingWrite) {
      this.emit({
        uidHex: uidHex.toLowerCase(),
        textData: this.pendingWrite,
        mockWriteOk: true,
      })
      this.pendingWrite = null
      return
    }
    this.emit({ uidHex: uidHex.toLowerCase(), textData: text })
  }
}

/** Python-мост к PN532 по I²C с авто-перезапуском. */
export class PythonNfcBridge extends BaseBridge {
  private child: ChildProcessWithoutNullStreams | null = null
  private stopping = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private restartAttempt = 0

  start(): void {
    this.stopping = false
    this.spawnBridge()
  }

  stop(): void {
    this.stopping = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.child?.kill()
    this.child = null
  }

  override requestWrite(text: string): void {
    super.requestWrite(text)
    this.sendCmd({ cmd: 'write', text })
  }

  override cancelWrite(): void {
    super.cancelWrite()
    this.sendCmd({ cmd: 'cancel' })
  }

  private spawnBridge(): void {
    if (this.stopping) return
    this.status = { mode: 'starting', lastError: this.status.lastError }
    this.child = spawn(PYTHON_BIN, ['-u', NFC_BRIDGE_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })
    const rl = readline.createInterface({ input: this.child.stdout })
    rl.on('line', (line) => this.onLine(line))
    this.child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[NFC] ${chunk.toString()}`)
    })
    this.child.on('exit', (code) => {
      console.warn(`[NFC] bridge exited with code ${code}`)
      this.child = null
      if (this.stopping) return
      this.status = {
        mode: 'error',
        lastError: `bridge exited with code ${code}`,
        firmware: this.status.firmware,
      }
      const delay = Math.min(1000 * 2 ** this.restartAttempt, 15000)
      this.restartAttempt += 1
      console.warn(`[NFC] restarting bridge in ${delay}ms…`)
      this.restartTimer = setTimeout(() => this.spawnBridge(), delay)
    })
    console.log(`[NFC] Started Python bridge: ${NFC_BRIDGE_SCRIPT}`)
  }

  private sendCmd(cmd: Record<string, unknown>): void {
    if (!this.child?.stdin.writable) return
    this.child.stdin.write(`${JSON.stringify(cmd)}\n`)
  }

  private onLine(line: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (typeof msg !== 'object' || msg === null) return
    const event = (msg as { event?: unknown }).event

    if (event === 'ready') {
      this.restartAttempt = 0
      const firmware =
        typeof (msg as { firmware?: unknown }).firmware === 'string'
          ? (msg as { firmware: string }).firmware
          : undefined
      this.status = { mode: 'hardware', firmware }
      console.log(`[NFC] PN532 ready${firmware ? ` (fw ${firmware})` : ''}`)
      return
    }

    if (event === 'error') {
      const message =
        typeof (msg as { message?: unknown }).message === 'string'
          ? (msg as { message: string }).message
          : 'unknown error'
      this.status = { mode: 'error', lastError: message }
      console.error(`[NFC] bridge error: ${message}`)
      return
    }

    if (event !== 'tag') return
    const uid = (msg as { uid?: unknown }).uid
    const text = (msg as { text?: unknown }).text
    if (typeof uid !== 'string') return
    this.emit({
      uidHex: uid.toLowerCase(),
      textData: typeof text === 'string' ? text : undefined,
    })
  }
}

/**
 * Пробует PN532; если за несколько секунд нет ready — mock
 * (удобно на ПК без железа при NFC_MODE=auto).
 */
export class AutoNfcBridge extends BaseBridge {
  private active: NfcBridge
  private readonly hardware: PythonNfcBridge
  private readonly mock: MockNfcBridge
  private settled = false
  private pollTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    super()
    this.hardware = new PythonNfcBridge()
    this.mock = new MockNfcBridge()
    this.active = this.hardware
  }

  start(): void {
    this.hardware.onTag((e) => {
      if (this.active === this.hardware) this.emit(e)
    })
    this.mock.onTag((e) => {
      if (this.active === this.mock) this.emit(e)
    })
    this.hardware.start()

    const startedAt = Date.now()
    this.pollTimer = setInterval(() => {
      if (this.settled) {
        if (this.pollTimer) clearInterval(this.pollTimer)
        return
      }
      const st = this.hardware.getStatus()
      if (st.mode === 'hardware') {
        this.settleHardware()
        return
      }
      if (Date.now() - startedAt >= 5000) {
        this.settleMock(st.lastError ?? 'timeout waiting for PN532')
      }
    }, 200)
  }

  private settleHardware(): void {
    if (this.settled) return
    this.settled = true
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.active = this.hardware
    this.status = this.hardware.getStatus()
    console.log('[NFC] using hardware PN532')
  }

  private settleMock(reason: string): void {
    if (this.settled) return
    this.settled = true
    if (this.pollTimer) clearInterval(this.pollTimer)
    console.warn(`[NFC] hardware not ready (${reason}) — falling back to mock`)
    this.hardware.stop()
    this.active = this.mock
    this.mock.start()
    this.status = this.mock.getStatus()
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.hardware.stop()
    this.mock.stop()
  }

  override getStatus(): NfcStatus {
    return this.active.getStatus()
  }

  override requestWrite(text: string): void {
    this.active.requestWrite(text)
  }

  override cancelWrite(): void {
    this.active.cancelWrite()
  }

  override injectMockTag(uidHex: string, textData?: string): void {
    this.active.injectMockTag(uidHex, textData)
  }
}

export function createNfcBridge(): NfcBridge {
  if (NFC_MODE === 'mock') return new MockNfcBridge()
  if (NFC_MODE === 'hardware') return new PythonNfcBridge()
  return new AutoNfcBridge()
}
