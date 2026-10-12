import type { CardType } from './cardRegistry.js'
import {
  type Axis,
  type Face,
  allFaces,
  rotateFace,
  reachable,
} from './die.js'
import type { GameState } from './gameState.js'
import type { Register } from './register.js'

export interface Target {
  player: number
  cubit: number
}

export type CardRequirement = 'None' | 'OneTarget' | 'TwoTargets' | 'TargetAndFace'

export interface CardParams {
  primary: Target
  hasSecond?: boolean
  second?: Target
  hasFace?: boolean
  face?: Face
}

const HADAMARD: Record<Face, Face> = {
  '+': '0',
  '-': '1',
  i: '-i',
  '-i': 'i',
  '0': '+',
  '1': '-',
}

function x3Window(targetCubit: number, diceCount: number): { start: number; end: number } {
  const start = targetCubit > 0 ? targetCubit - 1 : 0
  const end = start + 3 < diceCount ? start + 3 : diceCount
  return { start, end }
}

function rotateRange(reg: Register, targetCubit: number, axis: Axis): void {
  const { start, end } = x3Window(targetCubit, reg.dice.length)
  for (let i = start; i < end; i++) {
    reg.dice[i] = rotateFace(reg.dice[i]!, axis, 180)
  }
}

function inverseOf(type: CardType): CardType {
  if (type === 'phase_forward') return 'phase_backward'
  if (type === 'phase_backward') return 'phase_forward'
  return type
}

export function cardRequirement(type: CardType): CardRequirement {
  switch (type) {
    case 'pauli_x':
    case 'pauli_y':
    case 'pauli_z':
    case 'pauli_x3':
    case 'pauli_y3':
    case 'pauli_z3':
    case 'hadamard':
    case 'hadamard_3':
    case 'phase_forward':
    case 'phase_backward':
    case 'quantum_noise':
    case 'measurement':
      return 'OneTarget'
    case 'rotate_x':
    case 'rotate_y':
    case 'rotate_z':
    case 'quantum_lucky':
      return 'TargetAndFace'
    case 'swap':
      return 'TwoTargets'
    default:
      return 'None'
  }
}

export function needsTarget(type: CardType): boolean {
  const req = cardRequirement(type)
  return req === 'OneTarget' || req === 'TwoTargets' || req === 'TargetAndFace'
}

export function isUndoable(type: CardType): boolean {
  switch (type) {
    case 'pauli_x':
    case 'pauli_y':
    case 'pauli_z':
    case 'phase_forward':
    case 'phase_backward':
    case 'hadamard':
    case 'measurement':
      return true
    default:
      return false
  }
}

export function cubitMeasured(state: GameState, player: number, cubit: number): boolean {
  const history = state.cardHistory[player]?.[cubit]
  return !!history && history.length > 0 && history[history.length - 1] === 'measurement'
}

export function affectedCubits(
  type: CardType,
  state: GameState,
  target: Target,
): number[] {
  switch (type) {
    case 'pauli_x':
    case 'pauli_y':
    case 'pauli_z':
    case 'hadamard':
    case 'phase_forward':
    case 'phase_backward':
    case 'rotate_x':
    case 'rotate_y':
    case 'rotate_z':
    case 'quantum_lucky':
    case 'measurement':
      return [target.cubit]
    case 'pauli_x3':
    case 'pauli_y3':
    case 'pauli_z3':
    case 'hadamard_3': {
      const diceCount = state.registers[target.player]!.dice.length
      const { start, end } = x3Window(target.cubit, diceCount)
      const out: number[] = []
      for (let i = start; i < end; i++) out.push(i)
      return out
    }
    default:
      return []
  }
}

export function cantPlayReason(
  type: CardType,
  state: GameState,
  target: Target,
  cardsPlayedInPair = 0,
): string | null {
  if (type !== 'quantum_noise' && needsTarget(type)) {
    if (cubitMeasured(state, target.player, target.cubit)) return 'measured'
    for (const cubit of affectedCubits(type, state, target)) {
      if (cubitMeasured(state, target.player, cubit)) return 'measured'
    }
  }

  switch (type) {
    case 'pauli_x3':
    case 'pauli_y3':
    case 'pauli_z3':
    case 'hadamard_3': {
      const dice = state.registers[target.player]!.dice
      if (dice.length < 3 || target.cubit === 0 || target.cubit + 1 >= dice.length) {
        return 'windowDoesNotFit'
      }
      return null
    }
    case 'quantum_noise': {
      const history = state.cardHistory[target.player]![target.cubit]!
      if (history.length === 0) return 'nothingToUndo'
      if (!isUndoable(history[history.length - 1]!)) return 'notUndoable'
      return null
    }
    case 'barrier': {
      const next = (state.currentPlayer + 1) % state.playerIds.length
      if (state.skipNextTurn[next]) return 'barrierAlreadySet'
      return null
    }
    case 'identity':
      return state.playedCards === 0 && cardsPlayedInPair === 0 ? 'identityFirst' : null
    default:
      return null
  }
}

export function allowedFaces(
  type: CardType,
  state: GameState,
  target: Target,
): Face[] {
  if (type === 'quantum_lucky') return allFaces()

  let axis: Axis | null = null
  if (type === 'rotate_x') axis = 'X'
  else if (type === 'rotate_y') axis = 'Y'
  else if (type === 'rotate_z') axis = 'Z'
  if (!axis) return []

  const current = state.registers[target.player]!.dice[target.cubit]!
  return reachable(current, axis)
}

export function undoLastCard(state: GameState, target: Target): boolean {
  const history = state.cardHistory[target.player]![target.cubit]!
  if (history.length === 0 || !isUndoable(history[history.length - 1]!)) {
    return false
  }
  const last = history[history.length - 1]!
  applyCard(inverseOf(last), state, { primary: target })
  history.pop()
  return true
}

export function applyCard(type: CardType, state: GameState, params: CardParams): boolean {
  const reg = state.registers[params.primary.player]!

  switch (type) {
    case 'pauli_x':
      reg.dice[params.primary.cubit] = rotateFace(reg.dice[params.primary.cubit]!, 'X', 180)
      break
    case 'pauli_y':
      reg.dice[params.primary.cubit] = rotateFace(reg.dice[params.primary.cubit]!, 'Y', 180)
      break
    case 'pauli_z':
      reg.dice[params.primary.cubit] = rotateFace(reg.dice[params.primary.cubit]!, 'Z', 180)
      break
    case 'pauli_x3':
      rotateRange(reg, params.primary.cubit, 'X')
      break
    case 'pauli_y3':
      rotateRange(reg, params.primary.cubit, 'Y')
      break
    case 'pauli_z3':
      rotateRange(reg, params.primary.cubit, 'Z')
      break
    case 'hadamard':
      reg.dice[params.primary.cubit] = HADAMARD[reg.dice[params.primary.cubit]!]
      break
    case 'hadamard_3': {
      const { start, end } = x3Window(params.primary.cubit, reg.dice.length)
      for (let i = start; i < end; i++) {
        reg.dice[i] = HADAMARD[reg.dice[i]!]
      }
      break
    }
    case 'phase_forward':
      reg.dice[params.primary.cubit] = rotateFace(reg.dice[params.primary.cubit]!, 'Z', 90)
      break
    case 'phase_backward':
      reg.dice[params.primary.cubit] = rotateFace(reg.dice[params.primary.cubit]!, 'Z', -90)
      break
    case 'rotate_x':
    case 'rotate_y':
    case 'rotate_z': {
      const axis: Axis = type === 'rotate_x' ? 'X' : type === 'rotate_y' ? 'Y' : 'Z'
      const face = params.face
      if (face === undefined) return false
      for (let step = 0; step < 4 && reg.dice[params.primary.cubit] !== face; step++) {
        reg.dice[params.primary.cubit] = rotateFace(reg.dice[params.primary.cubit]!, axis, 90)
      }
      break
    }
    case 'quantum_noise':
      return undoLastCard(state, params.primary)
    case 'quantum_lucky':
      if (params.face === undefined) return false
      reg.dice[params.primary.cubit] = params.face
      break
    case 'swap': {
      if (!params.hasSecond || !params.second) return false
      const first = state.registers[params.primary.player]!.dice
      const second = state.registers[params.second.player]!.dice
      const temp = first[params.primary.cubit]!
      first[params.primary.cubit] = second[params.second.cubit]!
      second[params.second.cubit] = temp
      break
    }
    case 'barrier':
      state.skipNextTurn[(state.currentPlayer + 1) % state.playerIds.length] = true
      break
    case 'kronecker_multiplication':
    case 'measurement':
    case 'identity':
    case 'reshuffle':
      break
  }
  return true
}

export function recordPlayedCards(type: CardType, state: GameState, params: CardParams): void {
  if (type === 'swap' && params.second) {
    state.cardHistory[params.primary.player]![params.primary.cubit]!.push(type)
    state.cardHistory[params.second.player]![params.second.cubit]!.push(type)
    return
  }
  for (const cubit of affectedCubits(type, state, params.primary)) {
    state.cardHistory[params.primary.player]![cubit]!.push(type)
  }
}
