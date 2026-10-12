import type { IncomingMessage } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'

export type WsHandler = (clientId: number, data: unknown) => void

interface Client {
  id: number
  socket: WebSocket
}

const NAME_MAX_LENGTH = 32

export class WsHub {
  private readonly wss: WebSocketServer
  private readonly clients = new Map<number, Client>()
  private readonly onlineUsers: number[] = []
  private readonly userNames = new Map<number, string>()
  private readonly subscriptions = new Map<string, WsHandler[]>()
  private nextId = 0

  constructor(server: import('node:http').Server, path = '/ws') {
    this.wss = new WebSocketServer({ server, path })
    this.wss.on('connection', (socket, req) => this.handleConnected(socket, req))
  }

  on(event: string, handler: WsHandler): void {
    const list = this.subscriptions.get(event) ?? []
    list.push(handler)
    this.subscriptions.set(event, list)
  }

  send(clientId: number, event: string, data: unknown): void {
    const client = this.clients.get(clientId)
    if (!client || client.socket.readyState !== client.socket.OPEN) return
    client.socket.send(JSON.stringify({ event, data }))
  }

  broadcast(event: string, data: unknown): void {
    const message = JSON.stringify({ event, data })
    for (const client of this.clients.values()) {
      if (client.socket.readyState === client.socket.OPEN) {
        client.socket.send(message)
      }
    }
  }

  nameOf(clientId: number): string {
    return this.userNames.get(clientId) ?? `player${clientId}`
  }

  isOnline(clientId: number): boolean {
    return this.clients.has(clientId)
  }

  /** Колбэк при отключении клиента (приглашения и т.п.). */
  onDisconnect(handler: (clientId: number) => void): void {
    this.disconnectHandlers.push(handler)
  }

  onConnect(handler: (clientId: number) => void): void {
    this.connectHandlers.push(handler)
  }

  /** Задать отображаемое имя (в т.ч. для виртуальных мест стола). */
  setName(clientId: number, name: string): void {
    this.userNames.set(clientId, name.slice(0, NAME_MAX_LENGTH))
  }

  private disconnectHandlers: Array<(clientId: number) => void> = []
  private connectHandlers: Array<(clientId: number) => void> = []

  private handleConnected(socket: WebSocket, _req: IncomingMessage): void {
    const id = this.nextId++
    this.clients.set(id, { id, socket })
    this.onlineUsers.push(id)

    console.log(`[WS] client ${id} connected (${this.onlineUsers.length} online)`)
    this.send(id, 'setId', id)
    this.send(
      id,
      'setOnlineUsers',
      this.onlineUsers.map((userId) => ({ id: userId, name: this.nameOf(userId) })),
    )
    const added = { id, name: this.nameOf(id) }
    for (const userId of this.onlineUsers) {
      if (userId !== id) this.send(userId, 'addOnlineUser', added)
    }

    socket.on('message', (raw) => this.handleText(id, raw.toString()))
    socket.on('close', () => this.handleDisconnected(id))
    socket.on('error', () => this.handleDisconnected(id))

    for (const handler of this.connectHandlers) handler(id)
  }

  private handleDisconnected(clientId: number): void {
    if (!this.clients.has(clientId)) return
    this.clients.delete(clientId)
    const index = this.onlineUsers.indexOf(clientId)
    if (index >= 0) this.onlineUsers.splice(index, 1)
    this.userNames.delete(clientId)
    console.log(`[WS] client ${clientId} disconnected (${this.onlineUsers.length} online)`)
    this.broadcast('removeOnlineUser', clientId)
    for (const handler of this.disconnectHandlers) handler(clientId)
  }

  private handleText(clientId: number, payload: string): void {
    let doc: unknown
    try {
      doc = JSON.parse(payload)
    } catch {
      console.warn(`[WS] dropping malformed message from client ${clientId}`)
      return
    }
    if (typeof doc !== 'object' || doc === null) return
    const event = (doc as { event?: unknown }).event
    const data = (doc as { data?: unknown }).data
    if (typeof event !== 'string') return

    if (event === 'setPlayerName') {
      if (typeof data === 'string') this.setUserName(clientId, data)
    }

    const handlers = this.subscriptions.get(event)
    if (!handlers) {
      console.warn(`[WS] no handlers for event "${event}" from client ${clientId}`)
      return
    }
    for (const handler of handlers) handler(clientId, data)
  }

  private nameTaken(name: string, clientId: number): boolean {
    for (const [id, existing] of this.userNames) {
      if (id !== clientId && existing === name) return true
    }
    return false
  }

  private setUserName(clientId: number, name: string): void {
    if (name.length === 0) return
    let base = name.slice(0, NAME_MAX_LENGTH)

    if (base.startsWith('player')) {
      const suffix = base.slice(6)
      if (suffix.length > 0 && /^\d+$/.test(suffix)) {
        base = `player${clientId}`
      }
    }

    let newName = base
    for (let attempt = 2; this.nameTaken(newName, clientId); attempt++) {
      const suffix = String(attempt)
      newName = base.slice(0, NAME_MAX_LENGTH - suffix.length) + suffix
    }

    if (newName === this.nameOf(clientId)) return
    this.userNames.set(clientId, newName)
    console.log(`[WS] client ${clientId} renamed to ${newName}`)
    this.broadcast('removeOnlineUser', clientId)
    this.broadcast('addOnlineUser', { id: clientId, name: newName })
  }
}
