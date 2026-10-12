import { getSocketUrl } from '../constants/app'

export type SocketStatus = 'connecting' | 'open' | 'closed'

type StatusListener = (status: SocketStatus) => void
type MessageListener = (data: unknown) => void

const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 15000

let ws: WebSocket | null = null
let status: SocketStatus = 'closed'
let shouldConnect = false
let reconnectAttempts = 0
let reconnectTimer: number | null = null

const statusListeners = new Set<StatusListener>()
const messageListeners = new Set<MessageListener>()

function setStatus(next: SocketStatus): void {
  if (status === next) return
  status = next
  statusListeners.forEach((listener) => listener(status))
}

function clearReconnectTimer(): void {
  if (reconnectTimer === null) return
  window.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return
  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts,
    RECONNECT_MAX_DELAY_MS,
  )
  reconnectAttempts += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    openSocket()
  }, delay)
}

function emitMessage(raw: unknown): void {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      data = raw
    }
  }
  messageListeners.forEach((listener) => listener(data))
}

function openSocket(): void {
  setStatus('connecting')

  const socket = new WebSocket(getSocketUrl())
  ws = socket

  socket.onopen = () => {
    reconnectAttempts = 0
    setStatus('open')
  }

  socket.onmessage = (event: MessageEvent) => {
    console.log('[ws ←]', event.data)
    emitMessage(event.data)
  }

  socket.onclose = () => {
    if (ws !== socket) return
    ws = null
    setStatus('closed')
    if (shouldConnect) scheduleReconnect()
  }

  socket.onerror = () => {
    // Ошибка соединения всегда завершается onclose — реконнект происходит там.
  }
}

/**
 * Подключается к серверу и поддерживает соединение:
 * при обрыве переподключается с нарастающей задержкой,
 * пока не вызван disconnectSocket.
 */
export function connectSocket(): void {
  shouldConnect = true

  if (ws !== null) return
  clearReconnectTimer()
  openSocket()
}

/** Разрывает соединение и останавливает автопереподключение. */
export function disconnectSocket(): void {
  shouldConnect = false
  clearReconnectTimer()

  const socket = ws
  ws = null
  if (socket === null) return

  socket.onopen = null
  socket.onclose = null
  socket.onmessage = null
  socket.onerror = null
  if (socket.readyState !== WebSocket.CLOSED) socket.close()

  setStatus('closed')
}

export function getSocketStatus(): SocketStatus {
  return status
}

export function onSocketStatus(listener: StatusListener): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export function onSocketMessage(listener: MessageListener): () => void {
  messageListeners.add(listener)
  return () => messageListeners.delete(listener)
}

/** Отправляет данные как JSON. Возвращает false, если соединения нет. */
export function sendSocketMessage(data: unknown): boolean {
  if (ws === null || ws.readyState !== WebSocket.OPEN) return false
  const json = JSON.stringify(data)
  console.log('[ws →]', json)
  ws.send(json)
  return true
}
