/**
 * Контракт WebSocket-событий: ../../EVENTS.md (корень workspace).
 * Конверт: {"event": "<название>", "data": <структура>}.
 * Файл контракта меняется параллельно — держать в sync.
 */

export interface OnlineUser {
  id: number
  name: string
}

export interface GameStartedData {
  players: number[]
  cubitCount: number
}

/** Активная пара kronecker_multiplication (поле kronecker события setGameState). */
export interface KroneckerState {
  /** Регистры, заданные первой картой пары (индексы по players). Пусто — пара не ограничена. */
  registers: number[]
  /** Сколько карт пары применено: 0 или 1. */
  cardsPlayed: number
}

export interface GameStateData {
  players: number[]
  registers: string[][]
  targetRegister: string[]
  currentPlayer: number
  playedCards: number
  /** Выровнено с players: помеченный барьером игрок пропустит следующий ход. */
  skipNextTurn: boolean[]
  /** Активная пара kronecker_multiplication или null, когда пара не активна. */
  kronecker: KroneckerState | null
  /**
   * Матрица, выровненная с registers: для каждого игрока массив по кубитам,
   * в ячейке — имя последней карты, сыгранной на кубит, или null.
   */
  cardsOnField: (string | null)[][]
}

export interface CardPlayedTarget {
  register: number
  cubit: number
}

export interface CardPlayedData {
  /**
   * Первая цель карты. null для карт без цели (identity, reshuffle, barrier,
   * kronecker_multiplication) — см. EVENTS.md.
   */
  target: CardPlayedTarget | null
  card: string
}

export interface GameEndedData {
  winnerId: number
  winnerName: string
}

export interface CardScannedData {
  registered: boolean
  /** Тип карты. Присутствует только если registered === true. */
  type?: string
}

export interface CardNeedsInputData {
  /** Название карты, ждущей ввод. */
  card: string
  /** Что требуется: вторая цель или выбор грани. */
  need: 'secondTarget' | 'face'
  /** Допустимые грани (строки протокола). Присутствует при need === 'face'. */
  faces?: string[]
}

export interface InviteReceivedData {
  from: number
  fromName: string
  cubitCount: number
}

export interface InviteDeclinedData {
  by: number
  byName: string
}

export interface InviteSentData {
  to: number
  cubitCount: number
}

export interface InviteFailedData {
  reason: string
}

export type ServerEvent =
  | { event: 'setId'; data: number }
  | { event: 'setOnlineUsers'; data: OnlineUser[] }
  | { event: 'addOnlineUser'; data: OnlineUser }
  | { event: 'removeOnlineUser'; data: number }
  | { event: 'gameStarted'; data: GameStartedData }
  | { event: 'setGameState'; data: GameStateData }
  | { event: 'cardPlayed'; data: CardPlayedData }
  | { event: 'gameEnded'; data: GameEndedData }
  | { event: 'cardScanned'; data: CardScannedData }
  | { event: 'cardWritten'; data: null }
  | { event: 'cardNeedsInput'; data: CardNeedsInputData }
  | { event: 'cantPlay'; data: string }
  | { event: 'inviteReceived'; data: InviteReceivedData }
  | { event: 'inviteSent'; data: InviteSentData }
  | { event: 'inviteDeclined'; data: InviteDeclinedData }
  | { event: 'inviteCancelled'; data: { from: number } }
  | { event: 'inviteFailed'; data: InviteFailedData }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

function isStringMatrix(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))
  )
}

function isNullableStringMatrix(value: unknown): value is (string | null)[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => Array.isArray(row) && row.every((cell) => cell === null || typeof cell === 'string'),
    )
  )
}

function isBooleanArray(value: unknown): value is boolean[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'boolean')
}

function isKroneckerState(value: unknown): value is KroneckerState {
  return (
    isRecord(value) &&
    isNumberArray(value.registers) &&
    (value.cardsPlayed === 0 || value.cardsPlayed === 1)
  )
}

function isOnlineUser(value: unknown): value is OnlineUser {
  return isRecord(value) && typeof value.id === 'number' && typeof value.name === 'string'
}

function isOnlineUserList(value: unknown): value is OnlineUser[] {
  return Array.isArray(value) && value.every(isOnlineUser)
}

function isGameStartedData(value: unknown): value is GameStartedData {
  return (
    isRecord(value) &&
    isNumberArray(value.players) &&
    typeof value.cubitCount === 'number'
  )
}
function isGameStateData(value: unknown): value is GameStateData {
  return (
    isRecord(value) &&
    isNumberArray(value.players) &&
    isStringMatrix(value.registers) &&
    Array.isArray(value.targetRegister) &&
    value.targetRegister.every((cell) => typeof cell === 'string') &&
    typeof value.currentPlayer === 'number' &&
    typeof value.playedCards === 'number' &&
    isBooleanArray(value.skipNextTurn) &&
    (value.kronecker === null || isKroneckerState(value.kronecker)) &&
    isNullableStringMatrix(value.cardsOnField)
  )
}

function isCardPlayedTarget(value: unknown): value is CardPlayedTarget {
  return isRecord(value) && typeof value.register === 'number' && typeof value.cubit === 'number'
}

function isCardPlayedData(value: unknown): value is CardPlayedData {
  return (
    isRecord(value) &&
    (value.target === null || isCardPlayedTarget(value.target)) &&
    typeof value.card === 'string'
  )
}

function isGameEndedData(value: unknown): value is GameEndedData {
  return isRecord(value) && typeof value.winnerId === 'number' && typeof value.winnerName === 'string'
}

function isCardScannedData(value: unknown): value is CardScannedData {
  return (
    isRecord(value) &&
    typeof value.registered === 'boolean' &&
    (value.type === undefined || typeof value.type === 'string')
  )
}

function isCardNeedsInputData(value: unknown): value is CardNeedsInputData {
  return (
    isRecord(value) &&
    typeof value.card === 'string' &&
    (value.need === 'secondTarget' || value.need === 'face') &&
    (value.faces === undefined ||
      (Array.isArray(value.faces) && value.faces.every((face) => typeof face === 'string')))
  )
}

/**
 * Разбирает входящее сообщение сокета в типизированное событие.
 * null — если JSON не является конвертом или data не совпадает с контрактом.
 */
export function parseServerEvent(raw: unknown): ServerEvent | null {
  if (!isRecord(raw)) return null

  const { event, data } = raw
  if (typeof event !== 'string') return null

  switch (event) {
    case 'setId':
      return typeof data === 'number' ? { event, data } : null
    case 'setOnlineUsers':
      return isOnlineUserList(data) ? { event, data } : null
    case 'addOnlineUser':
      return isOnlineUser(data) ? { event, data } : null
    case 'removeOnlineUser':
      return typeof data === 'number' ? { event, data } : null
    case 'gameStarted':
      return isGameStartedData(data) ? { event, data } : null
    case 'setGameState':
      return isGameStateData(data) ? { event, data } : null
    case 'cardPlayed':
      return isCardPlayedData(data) ? { event, data } : null
    case 'gameEnded':
      return isGameEndedData(data) ? { event, data } : null
    case 'cardScanned':
      return isCardScannedData(data) ? { event, data } : null
    case 'cardWritten':
      // Контроллер шлёт data: null (пустой JsonDocument). Пустой объект
      // тоже принимаем и нормализуем в null.
      return data === null || (isRecord(data) && Object.keys(data).length === 0)
        ? { event, data: null }
        : null
    case 'cardNeedsInput':
      return isCardNeedsInputData(data) ? { event, data } : null
    case 'cantPlay':
      // data — текстовый id причины (см. таблицу в EVENTS.md).
      return typeof data === 'string' ? { event, data } : null
    case 'inviteReceived':
      if (
        isRecord(data) &&
        typeof data.from === 'number' &&
        typeof data.fromName === 'string' &&
        typeof data.cubitCount === 'number'
      ) {
        return {
          event,
          data: {
            from: data.from,
            fromName: data.fromName,
            cubitCount: data.cubitCount,
          },
        }
      }
      return null
    case 'inviteSent':
      if (isRecord(data) && typeof data.to === 'number' && typeof data.cubitCount === 'number') {
        return { event, data: { to: data.to, cubitCount: data.cubitCount } }
      }
      return null
    case 'inviteDeclined':
      if (isRecord(data) && typeof data.by === 'number' && typeof data.byName === 'string') {
        return { event, data: { by: data.by, byName: data.byName } }
      }
      return null
    case 'inviteCancelled':
      if (isRecord(data) && typeof data.from === 'number') {
        return { event, data: { from: data.from } }
      }
      return null
    case 'inviteFailed':
      if (isRecord(data) && typeof data.reason === 'string') {
        return { event, data: { reason: data.reason } }
      }
      return null
    default:
      return null
  }
}
