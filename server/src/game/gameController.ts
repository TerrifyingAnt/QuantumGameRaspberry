import {
  TABLETOP_CUBITS,
  TABLETOP_MODE,
  TABLETOP_SEAT_A,
  TABLETOP_SEAT_B,
  TABLETOP_SEAT_NAMES,
} from '../config.js'
import type { NfcBridge, TagEvent } from '../nfcBridge.js'
import type { WsHub } from '../wsHub.js'
import {
  allowedFaces,
  applyCard,
  cantPlayReason,
  cardRequirement,
  cubitMeasured,
  needsTarget,
  recordPlayedCards,
  type CardParams,
  type Target,
} from './cardEffects.js'
import {
  CardRegistry,
  type CardType,
  isCardType,
} from './cardRegistry.js'
import { isFace } from './die.js'
import { GameState } from './gameState.js'

export class GameController {
  private readonly cards: CardRegistry
  private gameState: GameState | null = null
  private isGameOn = false
  private readonly tabletop = TABLETOP_MODE

  private awaitingCard = false
  private pendingCardType: CardType | null = null
  private pendingWriteClient = 0

  private hasTarget = false
  private target: Target = { player: 0, cubit: 0 }

  private pendingPlayActive = false
  private pendingPlayType: CardType = 'identity'
  private pendingPlayUid = ''

  private kroneckerActive = false
  private kroneckerPairCards = 0
  private kroneckerRegisters: number[] = []

  /** Счётчик для синтетических UID онлайн-карт (каждая сыгранная карта уникальна). */
  private onlineCardSeq = 0

  constructor(
    private readonly ws: WsHub,
    private readonly nfc: NfcBridge,
    registry: CardRegistry,
  ) {
    this.cards = registry
    this.cards.load()

    if (this.tabletop) {
      for (const [id, name] of Object.entries(TABLETOP_SEAT_NAMES)) {
        this.ws.setName(Number(id), name)
      }
    }

    this.nfc.onTag((event) => this.handleTag(event))

    this.ws.on('startGame', (_id, data) => this.startGame(data))
    this.ws.on('selectTarget', (id, data) => this.selectTarget(id, data))
    this.ws.on('playCard', (id, data) => this.playCard(id, data))
    this.ws.on('writeCard', (id, data) => this.writeCard(id, data))
    this.ws.on('giveUp', (id) => this.giveUp(id))
    this.ws.on('cardInput', (id, data) => this.cardInput(id, data))
    this.ws.on('restartTabletop', () => this.restartTabletop())
  }

  isRunning(): boolean {
    return this.isGameOn
  }

  isTabletop(): boolean {
    return this.tabletop
  }

  /** Старт партии из InviteService (после принятия приглашения). */
  beginGame(playerIds: number[], cubitCount: number): void {
    this.startGame({ players: playerIds, cubitCount })
  }

  /** Автостарт двух мест за общим столом. */
  beginTabletop(cubitCount = TABLETOP_CUBITS): void {
    if (!this.tabletop) return
    this.startGame({
      players: [TABLETOP_SEAT_A, TABLETOP_SEAT_B],
      cubitCount,
    })
  }

  restartTabletop(): void {
    if (!this.tabletop) return
    this.isGameOn = false
    this.gameState = null
    this.hasTarget = false
    this.pendingPlayActive = false
    this.kroneckerActive = false
    this.kroneckerPairCards = 0
    this.kroneckerRegisters = []
    this.beginTabletop()
  }

  /** Новому клиенту (киоск) отдаём текущую партию стола. */
  onClientConnected(clientId: number): void {
    if (!this.tabletop || !this.isGameOn || !this.gameState) return
    const startedDoc = {
      players: this.gameState.playerIds,
      cubitCount: this.gameState.targetRegister.dice.length,
    }
    this.ws.send(clientId, 'gameStarted', startedDoc)
    this.ws.send(clientId, 'setGameState', this.buildGameStateDoc())
    if (this.pendingPlayActive) {
      const requirement = cardRequirement(this.pendingPlayType)
      const prompt: Record<string, unknown> = { card: this.pendingPlayType }
      if (requirement === 'TwoTargets') {
        prompt.need = 'secondTarget'
      } else {
        prompt.need = 'face'
        prompt.faces = allowedFaces(this.pendingPlayType, this.gameState, this.target)
      }
      this.ws.send(clientId, 'cardNeedsInput', prompt)
    }
  }

  /** Сброс партии, если все участники отключились (не для стола — места виртуальные). */
  onClientDisconnected(clientId: number): void {
    if (this.tabletop) return
    if (!this.isGameOn || !this.gameState) return
    if (!this.gameState.playerIds.includes(clientId)) return
    const stillOnline = this.gameState.playerIds.some((id) => this.ws.isOnline(id))
    if (!stillOnline) {
      console.log('[Game] All players disconnected — resetting game')
      this.isGameOn = false
      this.gameState = null
      this.hasTarget = false
      this.pendingPlayActive = false
      this.kroneckerActive = false
      this.kroneckerPairCards = 0
      this.kroneckerRegisters = []
    }
  }

  /** Рассылка участникам или всем (стол). */
  private notify(event: string, data: unknown): void {
    if (this.tabletop || !this.gameState) {
      this.ws.broadcast(event, data)
      return
    }
    for (const id of this.gameState.playerIds) {
      this.ws.send(id, event, data)
    }
  }

  private isCurrentActor(clientId: number): boolean {
    if (!this.gameState) return false
    if (this.tabletop) return true
    return this.gameState.playerIds[this.gameState.currentPlayer] === clientId
  }

  handleTag(event: TagEvent): void {
    const uidHex = event.uidHex.toLowerCase()
    let type = this.cards.lookup(uidHex)
    let registered = type !== null
    let writtenType: CardType | null = null
    if (event.textData && isCardType(event.textData)) {
      writtenType = event.textData
    }

    if (!registered && writtenType) {
      type = writtenType
      registered = true
      console.log('[Game] Card not registered, fallback to written type')
    }

    if (!this.isGameOn || !this.gameState) {
      if (
        this.awaitingCard &&
        this.pendingCardType &&
        (writtenType === this.pendingCardType || event.mockWriteOk)
      ) {
        this.cards.setHex(uidHex, this.pendingCardType)
        this.cards.save()
        this.awaitingCard = false
        this.nfc.cancelWrite()
        console.log(`[Game] Card registered as ${this.pendingCardType}`)
        this.ws.send(this.pendingWriteClient, 'cardWritten', null)
        return
      }

      console.log(`[Game] Card scanned: ${registered && type ? type : 'unknown'}`)
      const scanned: { registered: boolean; type?: string } = { registered }
      if (registered && type) scanned.type = type
      this.ws.broadcast('cardScanned', scanned)
      return
    }

    if (!registered || !type) {
      console.log(`[Game] Unknown card (uid: ${uidHex})`)
      return
    }

    this.tryPlayCard(type, uidHex)
  }

  /**
   * Онлайн: сыграть карту с телефона без NFC.
   * data: { "type": "pauli_x" } — имя типа из cards.md.
   */
  private playCard(clientId: number, data: unknown): void {
    if (!this.isGameOn || !this.gameState) return
    if (!this.isCurrentActor(clientId)) return
    if (typeof data !== 'object' || data === null) return
    const typeName = (data as { type?: unknown }).type
    if (typeof typeName !== 'string' || !isCardType(typeName)) {
      console.log(`[Game] playCard: unknown type ${String(typeName)}`)
      return
    }
    this.onlineCardSeq += 1
    const uidHex = `online-${this.onlineCardSeq.toString(16)}`
    this.tryPlayCard(typeName, uidHex)
  }

  /** Общая логика применения карты (NFC-скан или WS playCard). */
  private tryPlayCard(type: CardType, uidHex: string): void {
    if (!this.gameState) return

    console.log(`[Game] Card ${type}`)

    // Проверка повторов как на ESP временно отключена.
    if (this.gameState.isCardPlayed(uidHex) && false) {
      this.refusePlay('alreadyPlayed')
      return
    }
    if (this.pendingPlayActive) {
      console.log('[Game] Card ignored, a card is awaiting input')
      return
    }

    const requirement = cardRequirement(type)

    if (type === 'kronecker_multiplication') {
      if (this.kroneckerActive) {
        this.refusePlay('kroneckerAlreadyActive')
        return
      }
      this.kroneckerActive = true
      this.kroneckerPairCards = 0
      this.kroneckerRegisters = []
      console.log('[Game] Kronecker pair armed')
      this.commitCard(type, uidHex, { primary: this.target })
      return
    }

    const reason = cantPlayReason(
      type,
      this.gameState,
      this.target,
      this.kroneckerActive ? this.kroneckerPairCards : 0,
    )

    if (requirement === 'None') {
      if (reason) {
        this.refusePlay(reason)
        return
      }
      this.commitCard(type, uidHex, { primary: this.target })
      return
    }

    if (!this.hasTarget) {
      console.log('[Game] Card ignored, no target selected')
      return
    }

    if (this.kroneckerActive && this.kroneckerPairCards === 1 && this.kroneckerRegisters.length > 0) {
      if (!this.kroneckerRegisters.includes(this.target.player)) {
        this.refusePlay('registerMismatch')
        return
      }
    }

    if (reason) {
      this.refusePlay(reason)
      return
    }

    if (requirement === 'OneTarget') {
      this.commitCard(type, uidHex, { primary: this.target })
      return
    }

    this.pendingPlayActive = true
    this.pendingPlayType = type
    this.pendingPlayUid = uidHex

    const prompt: Record<string, unknown> = { card: type }
    if (requirement === 'TwoTargets') {
      prompt.need = 'secondTarget'
    } else {
      prompt.need = 'face'
      prompt.faces = allowedFaces(type, this.gameState, this.target)
    }
    this.notify('cardNeedsInput', prompt)
    console.log(`[Game] Card ${type} awaits input`)
  }

  private startGame(data: unknown): void {
    if (this.isGameOn) {
      console.log('[Game] startGame ignored, a game is already in progress')
      return
    }
    if (typeof data !== 'object' || data === null) return
    const players = (data as { players?: unknown }).players
    const cubitCount = (data as { cubitCount?: unknown }).cubitCount
    if (!Array.isArray(players) || players.length === 0 || typeof cubitCount !== 'number' || cubitCount <= 0) {
      console.log('[Game] startGame has invalid data')
      return
    }
    if (!players.every((p) => typeof p === 'number')) {
      console.log('[Game] startGame has invalid data')
      return
    }

    const playerIds = players as number[]
    this.gameState = new GameState(playerIds, cubitCount)
    this.isGameOn = true
    this.hasTarget = false
    this.pendingPlayActive = false
    this.kroneckerActive = false
    this.kroneckerPairCards = 0
    this.kroneckerRegisters = []
    console.log(`[Game] Game started: ${playerIds.length} players, ${cubitCount} dice`)

    const startedDoc = { players: playerIds, cubitCount }
    this.notify('gameStarted', startedDoc)
    this.notify('setGameState', this.buildGameStateDoc())
  }

  private selectTarget(clientId: number, data: unknown): void {
    if (!this.isGameOn || !this.gameState) return
    if (!this.isCurrentActor(clientId)) return
    if (this.pendingPlayActive) return
    if (typeof data !== 'object' || data === null) return
    const player = (data as { player?: unknown }).player
    const cubit = (data as { cubit?: unknown }).cubit
    if (typeof player !== 'number' || typeof cubit !== 'number') return
    if (player < 0 || player >= this.gameState.registers.length) return
    if (cubit < 0 || cubit >= this.gameState.registers[player]!.dice.length) return
    this.target = { player, cubit }
    this.hasTarget = true
    console.log(`[Game] Target: player ${player} cubit ${cubit}`)
    // Общему экрану нужен подтверждённый выбор цели.
    this.notify('targetSelected', { player, cubit })
  }

  private writeCard(clientId: number, data: unknown): void {
    if (typeof data !== 'string') return
    if (data === '') {
      this.awaitingCard = false
      this.nfc.cancelWrite()
      console.log('[Game] Pending card write cancelled')
      return
    }
    if (!isCardType(data)) {
      console.log(`[Game] writeCard: unknown card type ${data}`)
      return
    }
    this.pendingCardType = data
    this.pendingWriteClient = clientId
    this.awaitingCard = true
    this.nfc.requestWrite(data)
    console.log(`[Game] Waiting for a card to register as ${data}`)
  }

  private commitCard(type: CardType, uidHex: string, params: CardParams): boolean {
    if (!this.gameState) return false
    if (!applyCard(type, this.gameState, params)) {
      console.log('[Game] Card ignored, no effect')
      return false
    }
    this.gameState.playedCardUids.push(uidHex.toLowerCase())
    recordPlayedCards(type, this.gameState, params)
    this.hasTarget = false

    if (type !== 'kronecker_multiplication') {
      if (this.kroneckerActive && this.kroneckerPairCards === 0) {
        this.kroneckerPairCards = 1
        this.kroneckerRegisters = []
        if (needsTarget(type)) {
          this.kroneckerRegisters.push(params.primary.player)
          if (params.hasSecond && params.second && params.second.player !== params.primary.player) {
            this.kroneckerRegisters.push(params.second.player)
          }
        }
      } else if (this.kroneckerActive) {
        this.kroneckerActive = false
        this.kroneckerPairCards = 0
        this.kroneckerRegisters = []
        this.gameState.playedCards++
      } else {
        this.gameState.playedCards++
      }
    }

    if (this.gameState.playedCards >= GameState.CARDS_PER_TURN) {
      this.gameState.currentPlayer =
        (this.gameState.currentPlayer + 1) % this.gameState.playerIds.length
      while (this.gameState.skipNextTurn[this.gameState.currentPlayer]) {
        this.gameState.skipNextTurn[this.gameState.currentPlayer] = false
        this.gameState.currentPlayer =
          (this.gameState.currentPlayer + 1) % this.gameState.playerIds.length
      }
      this.gameState.playedCards = 0
    }

    const playedDoc = {
      target: needsTarget(type)
        ? { register: params.primary.player, cubit: params.primary.cubit }
        : null,
      card: type,
    }
    this.notify('cardPlayed', playedDoc)
    this.notify('setGameState', this.buildGameStateDoc())

    for (let i = 0; i < this.gameState.registers.length; i++) {
      if (this.gameState.registers[i]!.equals(this.gameState.targetRegister)) {
        console.log(`[Game] Player ${this.gameState.playerIds[i]} reached the target register`)
        this.endGame(i)
        break
      }
    }
    return true
  }

  private cardInput(clientId: number, data: unknown): void {
    if (!this.isGameOn || !this.gameState || !this.pendingPlayActive) return
    if (!this.isCurrentActor(clientId)) return
    const state = this.gameState
    if (typeof data !== 'object' || data === null) return

    const requirement = cardRequirement(this.pendingPlayType)
    const params: CardParams = { primary: this.target }

    if (requirement === 'TwoTargets') {
      const secondTarget = (data as { secondTarget?: { player?: unknown; cubit?: unknown } }).secondTarget
      const player = secondTarget?.player
      const cubit = secondTarget?.cubit
      if (typeof player !== 'number' || typeof cubit !== 'number') {
        this.refusePlay('invalidSecondTarget')
        return
      }
      if (player < 0 || player >= state.registers.length || cubit < 0 || cubit >= state.registers[player]!.dice.length) {
        this.refusePlay('invalidSecondTarget')
        return
      }
      params.hasSecond = true
      params.second = { player, cubit }
      if (cubitMeasured(state, player, cubit)) {
        this.refusePlay('measured')
        return
      }
      if (this.kroneckerActive && this.kroneckerPairCards === 1 && this.kroneckerRegisters.length > 0) {
        if (!this.kroneckerRegisters.includes(player)) {
          this.refusePlay('registerMismatch')
          return
        }
      }
    } else if (requirement === 'TargetAndFace') {
      const faceName = (data as { face?: unknown }).face
      if (typeof faceName !== 'string' || !isFace(faceName)) {
        this.refusePlay('invalidFace')
        return
      }
      const faces = allowedFaces(this.pendingPlayType, state, this.target)
      if (!faces.includes(faceName)) {
        this.refusePlay('invalidFace')
        return
      }
      params.hasFace = true
      params.face = faceName
    } else {
      return
    }

    this.pendingPlayActive = false
    this.commitCard(this.pendingPlayType, this.pendingPlayUid, params)
  }

  private giveUp(clientId: number): void {
    if (!this.isGameOn || !this.gameState) return
    if (this.tabletop) {
      // На общем столе «сдача» = перезапуск партии.
      console.log('[Game] Tabletop giveUp → restart')
      this.restartTabletop()
      return
    }
    const senderIndex = this.gameState.playerIds.indexOf(clientId)
    if (senderIndex < 0) return

    if (this.gameState.playerIds.length < 2) {
      this.isGameOn = false
      this.hasTarget = false
      this.pendingPlayActive = false
      this.kroneckerActive = false
      this.kroneckerPairCards = 0
      this.kroneckerRegisters = []
      console.log('[Game] Sole player gave up, game stopped')
      return
    }

    const winnerIndex = (senderIndex + 1) % this.gameState.playerIds.length
    console.log(`[Game] Player ${clientId} gave up`)
    this.endGame(winnerIndex)
  }

  private endGame(winnerIndex: number): void {
    if (!this.gameState) return
    const winnerId = this.gameState.playerIds[winnerIndex]!
    this.isGameOn = false
    this.hasTarget = false
    this.pendingPlayActive = false
    this.kroneckerActive = false
    this.kroneckerPairCards = 0
    this.kroneckerRegisters = []

    const endedDoc = {
      winnerId,
      winnerName: TABLETOP_SEAT_NAMES[winnerId] ?? this.ws.nameOf(winnerId),
    }
    this.notify('gameEnded', endedDoc)
  }

  private refusePlay(reason: string): void {
    this.hasTarget = false
    this.pendingPlayActive = false
    console.log(`[Game] Card refused: ${reason}`)
    if (!this.gameState) return
    this.notify('cantPlay', reason)
  }

  private buildGameStateDoc(): Record<string, unknown> {
    const state = this.gameState!
    const cardsOnField = state.cardHistory.map((playerHistory) =>
      playerHistory.map((history) => (history.length === 0 ? null : history[history.length - 1]!)),
    )

    return {
      players: state.playerIds,
      registers: state.registers.map((reg) => [...reg.dice]),
      targetRegister: [...state.targetRegister.dice],
      currentPlayer: state.currentPlayer,
      playedCards: state.playedCards,
      skipNextTurn: [...state.skipNextTurn],
      kronecker: this.kroneckerActive
        ? { registers: [...this.kroneckerRegisters], cardsPlayed: this.kroneckerPairCards }
        : null,
      cardsOnField,
    }
  }
}
