import type { GameController } from './game/gameController.js'
import type { WsHub } from './wsHub.js'

interface PendingInvite {
  from: number
  to: number
  cubitCount: number
}

/**
 * Приглашения в игру: A → invitePlayer → B видит inviteReceived →
 * B → inviteResponse → при accept стартует партия.
 */
export class InviteService {
  private pending = new Map<string, PendingInvite>()

  constructor(
    private readonly ws: WsHub,
    private readonly game: GameController,
  ) {
    this.ws.on('invitePlayer', (clientId, data) => this.handleInvite(clientId, data))
    this.ws.on('inviteResponse', (clientId, data) => this.handleResponse(clientId, data))
  }

  private key(from: number, to: number): string {
    return `${from}->${to}`
  }

  private handleInvite(from: number, data: unknown): void {
    if (typeof data !== 'object' || data === null) return
    const to = (data as { to?: unknown }).to
    const cubitCount = (data as { cubitCount?: unknown }).cubitCount
    if (typeof to !== 'number' || typeof cubitCount !== 'number' || cubitCount <= 0) return
    if (to === from) return
    if (this.game.isRunning()) {
      this.ws.send(from, 'inviteFailed', { reason: 'gameInProgress' })
      return
    }
    if (!this.ws.isOnline(to)) {
      this.ws.send(from, 'inviteFailed', { reason: 'offline' })
      return
    }

    const invite: PendingInvite = { from, to, cubitCount }
    this.pending.set(this.key(from, to), invite)
    console.log(`[Invite] ${from} → ${to} (${cubitCount} cubits)`)
    this.ws.send(to, 'inviteReceived', {
      from,
      fromName: this.ws.nameOf(from),
      cubitCount,
    })
    this.ws.send(from, 'inviteSent', { to, cubitCount })
  }

  private handleResponse(responder: number, data: unknown): void {
    if (typeof data !== 'object' || data === null) return
    const from = (data as { from?: unknown }).from
    const accept = (data as { accept?: unknown }).accept
    if (typeof from !== 'number' || typeof accept !== 'boolean') return

    const k = this.key(from, responder)
    const invite = this.pending.get(k)
    if (!invite) {
      console.log(`[Invite] no pending invite ${k}`)
      return
    }
    this.pending.delete(k)

    if (!accept) {
      console.log(`[Invite] ${responder} declined ${from}`)
      this.ws.send(from, 'inviteDeclined', {
        by: responder,
        byName: this.ws.nameOf(responder),
      })
      return
    }

    if (this.game.isRunning()) {
      this.ws.send(from, 'inviteFailed', { reason: 'gameInProgress' })
      this.ws.send(responder, 'inviteFailed', { reason: 'gameInProgress' })
      return
    }

    console.log(`[Invite] ${responder} accepted ${from} — starting game`)
    this.game.beginGame([from, responder], invite.cubitCount)
  }

  /** Сбрасываем исходящие/входящие приглашения отключившегося клиента. */
  clearForClient(clientId: number): void {
    for (const [k, invite] of [...this.pending.entries()]) {
      if (invite.from === clientId || invite.to === clientId) {
        this.pending.delete(k)
        if (invite.from === clientId) {
          this.ws.send(invite.to, 'inviteCancelled', { from: clientId })
        } else {
          this.ws.send(invite.from, 'inviteDeclined', {
            by: clientId,
            byName: this.ws.nameOf(clientId),
          })
        }
      }
    }
  }
}
