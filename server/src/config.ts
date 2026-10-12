import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Корень репозитория QuantumGame (server/src → ../..) */
export const REPO_ROOT = path.resolve(here, '../..')

export const PORT = Number(process.env.PORT ?? 8080)
export const HOST = process.env.HOST ?? '0.0.0.0'

/** Каталог со сборкой фронта (front/dist). */
export const FRONT_DIST = process.env.FRONT_DIST
  ? path.resolve(process.env.FRONT_DIST)
  : path.join(REPO_ROOT, 'front', 'dist')

/** JSON-реестр UID → тип карты. */
export const CARD_REGISTRY_PATH = process.env.CARD_REGISTRY_PATH
  ? path.resolve(process.env.CARD_REGISTRY_PATH)
  : path.join(REPO_ROOT, 'server', 'data', 'card-registry.json')

/**
 * NFC_MODE: mock | hardware | auto
 * NFC_MOCK=1 — совместимость (эквивалент mock).
 */
function resolveNfcMode(): 'mock' | 'hardware' | 'auto' {
  const mockEnv = process.env.NFC_MOCK
  if (mockEnv === '1' || mockEnv === 'true') return 'mock'
  if (mockEnv === '0' || mockEnv === 'false') return 'hardware'
  const mode = (process.env.NFC_MODE ?? 'auto').toLowerCase()
  if (mode === 'mock' || mode === 'hardware' || mode === 'auto') return mode
  return 'auto'
}

export const NFC_MODE = resolveNfcMode()

/** @deprecated используйте NFC_MODE */
export const NFC_MOCK = NFC_MODE === 'mock'

/** Путь к Python-мосту PN532. */
export const NFC_BRIDGE_SCRIPT = process.env.NFC_BRIDGE_SCRIPT
  ? path.resolve(process.env.NFC_BRIDGE_SCRIPT)
  : path.join(REPO_ROOT, 'server', 'nfc', 'nfc_bridge.py')

export const PYTHON_BIN = process.env.PYTHON_BIN ?? (process.platform === 'win32' ? 'python' : 'python3')
