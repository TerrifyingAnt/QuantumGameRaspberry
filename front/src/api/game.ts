import type { CardNeedsInputData, GameEndedData, GameStartedData, GameStateData } from './events'
import { onServerEvent } from './serverEvents'
import { onSocketStatus, sendSocketMessage } from './socket'

export interface GameData {
  /** Параметры активной игры (из gameStarted). null — игры нет. */
  started: GameStartedData | null
  /** Последнее состояние поля (из setGameState). null — ещё не пришло. */
  state: GameStateData | null
  /** Итог игры (из gameEnded). null — игра ещё не завершена. */
  ended: GameEndedData | null
  /** Карта, ждущая доп. ввода от нас (из cardNeedsInput). null — не ждёт. */
  needsInput: CardNeedsInputData | null
  /** Причина последнего cantPlay (id из EVENTS.md). null — поп-ап не показывать. */
  cantPlay: string | null
}

const INITIAL_DATA: GameData = {
  started: null,
  state: null,
  ended: null,
  needsInput: null,
  cantPlay: null,
}

let data: GameData = INITIAL_DATA

/** Монотонный счётчик cantPlay: инвалидирует визуальный выбор цели. */
let rejectSeq = 0

const listeners = new Set<() => void>()

function setData(next: GameData): void {
  data = next
  listeners.forEach((listener) => listener())
}

onServerEvent((event) => {
  switch (event.event) {
    case 'gameStarted':
      if (event.data !== data.started) {
        setData({ started: event.data, state: null, ended: null, needsInput: null, cantPlay: null })
      }
      break

    case 'setGameState':
      setData({ ...data, state: event.data })
      break

    case 'gameEnded':
      setData({ ...data, ended: event.data, needsInput: null, cantPlay: null })
      break

    case 'cardNeedsInput':
      setData({ ...data, needsInput: event.data })
      break

    case 'cantPlay':
      // Сервер сбросил цель и ожидающий ввод: карта не расходуется, ход не
      // засчитывается. rejectSeq инвалидирует визуальный выбор цели в UI.
      rejectSeq += 1
      setData({ ...data, needsInput: null, cantPlay: event.data })
      break
  }
})

// Игра живёт на сервере в рамках соединения: при обрыве считаем её
// завершённой, новое gameStarted придёт после нового startGame.
onSocketStatus((status) => {
  if (status === 'closed') {
    setData(INITIAL_DATA)
  }
})

/** Отправить startGame: players — id участников, cubitCount — кубитов в регистрах. */
export function startGame(players: number[], cubitCount: number): boolean {
  return sendSocketMessage({ event: 'startGame', data: { players, cubitCount } })
}

/** Перезапуск партии в режиме общего стола. */
export function restartTabletop(): boolean {
  return sendSocketMessage({ event: 'restartTabletop', data: null })
}

/** Отправить selectTarget: player — индекс в players, cubit — индекс кубита в регистре. */
export function selectTarget(player: number, cubit: number): boolean {
  return sendSocketMessage({ event: 'selectTarget', data: { player, cubit } })
}

/** Отправить giveUp — сдаться (data-часть контрактом не используется). */
export function giveUp(): boolean {
  return sendSocketMessage({ event: 'giveUp' })
}

/** Отправить writeCard: typeName — тип карты для записи; пустая строка отменяет ожидание. */
export function writeCard(typeName: string): boolean {
  return sendSocketMessage({ event: 'writeCard', data: typeName })
}

/** Доп. ввод для карты, ждущей его (см. cardNeedsInput). */
export type CardInput = { face: string } | { secondTarget: { player: number; cubit: number } }

/**
 * Отправить cardInput. После ввода карта применяется сразу:
 * приходят cardPlayed и setGameState. Успешная отправка снимает
 * ожидание ввода в сторе.
 */
export function cardInput(input: CardInput): boolean {
  const sent = sendSocketMessage({ event: 'cardInput', data: input })
  if (sent && data.needsInput !== null) {
    setData({ ...data, needsInput: null })
  }
  return sent
}

export function getGameData(): GameData {
  return data
}

/** Текущий rejectSeq (растёт с каждым cantPlay). Выбор цели старше него — неактуален. */
export function getRejectSeq(): number {
  return rejectSeq
}

/** Закрыть поп-ап cantPlay (только UI: сервер уже сбросил цель). */
export function dismissCantPlay(): void {
  if (data.cantPlay !== null) {
    setData({ ...data, cantPlay: null })
  }
}

export function subscribeGame(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
