export type Face = '+' | '-' | 'i' | '-i' | '0' | '1'
export type Axis = 'X' | 'Y' | 'Z'

const FACES: Face[] = ['+', '-', 'i', '-i', '0', '1']

const FACE_INDEX: Record<Face, number> = {
  '+': 0,
  '-': 1,
  i: 2,
  '-i': 3,
  '0': 4,
  '1': 5,
}

const AXIS_INDEX: Record<Axis, number> = { X: 0, Y: 1, Z: 2 }

/** После +90° вокруг каждой оси (как controller/src/die.cpp). */
const ROTATE_PLUS_90: Face[][] = [
  ['+', '-', '0', '1', '-i', 'i'],
  ['1', '0', 'i', '-i', '+', '-'],
  ['i', '-i', '-', '+', '0', '1'],
]

export function isFace(value: string): value is Face {
  return (FACES as string[]).includes(value)
}

export function randomFace(): Face {
  return FACES[Math.floor(Math.random() * FACES.length)]!
}

export function faceString(face: Face): Face {
  return face
}

export function rotateFace(face: Face, axis: Axis, degrees: number): Face {
  let steps: number
  switch (degrees) {
    case 90:
      steps = 1
      break
    case 180:
      steps = 2
      break
    case -90:
      steps = 3
      break
    default:
      console.warn(`[Die] ignoring rotation by ${degrees} degrees`)
      return face
  }

  let current = face
  for (let i = 0; i < steps; i++) {
    current = ROTATE_PLUS_90[AXIS_INDEX[axis]]![FACE_INDEX[current]]!
  }
  return current
}

export function reachable(face: Face, axis: Axis): Face[] {
  const orbit: Face[] = []
  let current = face
  do {
    orbit.push(current)
    current = ROTATE_PLUS_90[AXIS_INDEX[axis]]![FACE_INDEX[current]]!
  } while (current !== face)
  return orbit
}

export function allFaces(): Face[] {
  return [...FACES]
}
