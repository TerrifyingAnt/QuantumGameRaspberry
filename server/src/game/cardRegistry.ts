import fs from 'node:fs'
import path from 'node:path'

export const CARD_TYPE_NAMES = [
  'pauli_x',
  'pauli_y',
  'pauli_z',
  'pauli_x3',
  'pauli_y3',
  'pauli_z3',
  'phase_forward',
  'phase_backward',
  'rotate_x',
  'rotate_y',
  'rotate_z',
  'hadamard',
  'hadamard_3',
  'swap',
  'quantum_noise',
  'kronecker_multiplication',
  'measurement',
  'identity',
  'barrier',
  'reshuffle',
  'quantum_lucky',
] as const

export type CardType = (typeof CARD_TYPE_NAMES)[number]

export interface RegistryEntry {
  uid: string
  type: CardType
}

/** UID как hex lowercase без разделителей (как байты на ESP). */
export function uidToHex(uid: Uint8Array | number[]): string {
  return Array.from(uid)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function parseUidHex(hex: string): Uint8Array | null {
  const cleaned = hex.replace(/[\s:-]/g, '').toLowerCase()
  if (!/^[0-9a-f]+$/.test(cleaned) || cleaned.length % 2 !== 0 || cleaned.length === 0) {
    return null
  }
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function isCardType(name: string): name is CardType {
  return (CARD_TYPE_NAMES as readonly string[]).includes(name)
}

export function cardTypeToString(type: CardType): string {
  return type
}

export class CardRegistry {
  private table: RegistryEntry[] = []

  constructor(private readonly filePath: string) {
    this.seedDefaults()
  }

  private seedDefaults(): void {
    // Заглушки как на ESP — перезаписываются файлом при load().
    this.setHex('040d67027b1391', 'pauli_x')
    this.setHex('040d66027b1391', 'pauli_y')
    this.setHex('04112233445588', 'pauli_z')
    this.setHex('04112233445599', 'pauli_x3')
    this.setHex('041122334455aa', 'pauli_y3')
    this.setHex('041122334455bb', 'pauli_z3')
  }

  load(): boolean {
    try {
      if (!fs.existsSync(this.filePath)) return false
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown
      if (!Array.isArray(raw)) return false
      const parsed: RegistryEntry[] = []
      for (const item of raw) {
        if (
          typeof item !== 'object' ||
          item === null ||
          typeof (item as RegistryEntry).uid !== 'string' ||
          !isCardType((item as RegistryEntry).type)
        ) {
          return false
        }
        parsed.push({
          uid: (item as RegistryEntry).uid.toLowerCase(),
          type: (item as RegistryEntry).type,
        })
      }
      this.table = parsed
      return true
    } catch {
      console.warn('[Cards] Stored registry is corrupt, keeping defaults')
      return false
    }
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.table, null, 2), 'utf8')
  }

  lookup(uidHex: string): CardType | null {
    const key = uidHex.toLowerCase()
    const entry = this.table.find((e) => e.uid === key)
    return entry?.type ?? null
  }

  setHex(uidHex: string, type: CardType): void {
    const key = uidHex.toLowerCase()
    const existing = this.table.find((e) => e.uid === key)
    if (existing) {
      existing.type = type
      return
    }
    this.table.push({ uid: key, type })
  }

  remove(uidHex: string): boolean {
    const key = uidHex.toLowerCase()
    const index = this.table.findIndex((e) => e.uid === key)
    if (index < 0) return false
    this.table.splice(index, 1)
    return true
  }

  entries(): readonly RegistryEntry[] {
    return this.table
  }
}
