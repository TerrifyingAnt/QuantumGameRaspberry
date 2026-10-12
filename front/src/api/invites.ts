import type { InviteReceivedData } from './events'
import { onServerEvent } from './serverEvents'
import { onSocketStatus, sendSocketMessage } from './socket'

export interface InvitesState {
  /** Входящие приглашения (ключ — id отправителя). */
  incoming: InviteReceivedData[]
  /** Текст статуса для пригласившего (ожидание / отказ). */
  statusMessage: string | null
}

const INITIAL: InvitesState = { incoming: [], statusMessage: null }

let state: InvitesState = INITIAL
const listeners = new Set<() => void>()

function setState(next: InvitesState): void {
  state = next
  listeners.forEach((l) => l())
}

onServerEvent((event) => {
  switch (event.event) {
    case 'inviteReceived': {
      const rest = state.incoming.filter((i) => i.from !== event.data.from)
      setState({ ...state, incoming: [...rest, event.data] })
      break
    }
    case 'inviteSent':
      // Не блокируем UI модалкой «ожидайте» — ответ придёт как партия или отказ.
      break
    case 'inviteDeclined':
      setState({
        ...state,
        statusMessage: `${event.data.byName} отклонил(а) приглашение`,
      })
      break
    case 'inviteCancelled':
      setState({
        ...state,
        incoming: state.incoming.filter((i) => i.from !== event.data.from),
      })
      break
    case 'inviteFailed':
      setState({
        ...state,
        statusMessage:
          event.data.reason === 'offline'
            ? 'Игрок не в сети'
            : event.data.reason === 'gameInProgress'
              ? 'Игра уже идёт'
              : `Не удалось пригласить (${event.data.reason})`,
      })
      break
    case 'gameStarted':
      setState({ incoming: [], statusMessage: null })
      break
  }
})

onSocketStatus((status) => {
  if (status === 'closed') setState(INITIAL)
})

export function getInvitesState(): InvitesState {
  return state
}

export function subscribeInvites(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function invitePlayer(to: number, cubitCount: number): boolean {
  return sendSocketMessage({ event: 'invitePlayer', data: { to, cubitCount } })
}

export function respondToInvite(from: number, accept: boolean): boolean {
  const sent = sendSocketMessage({
    event: 'inviteResponse',
    data: { from, accept },
  })
  if (sent) {
    setState({
      ...state,
      incoming: state.incoming.filter((i) => i.from !== from),
    })
  }
  return sent
}

export function dismissInviteStatus(): void {
  if (state.statusMessage !== null) {
    setState({ ...state, statusMessage: null })
  }
}
