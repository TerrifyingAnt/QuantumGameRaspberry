export const APP_VERSION = '1.0.0'

/** WebSocket к backend на том же хосте (Pi kiosk / телефоны в сети). */
export function getSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8080/ws'
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  // Vite dev: прокси /ws → backend (см. vite.config.ts)
  return `${proto}://${window.location.host}/ws`
}

/** @deprecated используйте getSocketUrl(); оставлено для совместимости импортов. */
export const SOCKET_URL = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
  : 'ws://localhost:8080/ws'

export function isKioskMode(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('kiosk') === '1' || params.get('kiosk') === 'true'
}
