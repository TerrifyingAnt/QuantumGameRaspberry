import { type Face, randomFace } from './die.js'

export class Register {
  dice: Face[]

  constructor(count: number, faces?: Face[]) {
    if (faces) {
      this.dice = [...faces]
    } else {
      this.dice = Array.from({ length: count }, () => randomFace())
    }
  }

  equals(other: Register): boolean {
    if (this.dice.length !== other.dice.length) return false
    return this.dice.every((face, i) => face === other.dice[i])
  }

  clone(): Register {
    return new Register(this.dice.length, this.dice)
  }
}
