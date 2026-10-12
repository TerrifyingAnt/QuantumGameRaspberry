import type { CardType } from './cardRegistry.js'
import { Register } from './register.js'

export class GameState {
  static readonly CARDS_PER_TURN = 2

  playerIds: number[]
  registers: Register[]
  targetRegister: Register
  currentPlayer = 0
  playedCards = 0
  playedCardUids: string[] = []
  cardHistory: CardType[][][]
  skipNextTurn: boolean[]

  constructor(playerIds: number[], diceCount: number) {
    this.playerIds = [...playerIds]
    this.registers = playerIds.map(() => new Register(diceCount))
    this.targetRegister = new Register(diceCount)
    this.cardHistory = playerIds.map(() =>
      Array.from({ length: diceCount }, () => [] as CardType[]),
    )
    this.skipNextTurn = playerIds.map(() => false)
  }

  isCardPlayed(uidHex: string): boolean {
    return this.playedCardUids.includes(uidHex.toLowerCase())
  }
}
