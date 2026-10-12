import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import express from 'express'
import {
  CARD_REGISTRY_PATH,
  FRONT_DIST,
  HOST,
  NFC_MODE,
  PORT,
  TABLETOP_CUBITS,
  TABLETOP_MODE,
  TABLETOP_SEAT_A,
  TABLETOP_SEAT_B,
  TABLETOP_SEAT_NAMES,
} from './config.js'
import { CardRegistry } from './game/cardRegistry.js'
import { GameController } from './game/gameController.js'
import { InviteService } from './inviteService.js'
import { createNfcBridge } from './nfcBridge.js'
import { Options } from './options.js'
import { WsHub } from './wsHub.js'

const app = express()
app.use(express.json())

const options = new Options()
const nfc = createNfcBridge()
const registry = new CardRegistry(CARD_REGISTRY_PATH)

app.get('/api/health', (_req, res) => {
  const nfcStatus = nfc.getStatus()
  res.json({
    ok: true,
    nfcMode: NFC_MODE,
    nfc: nfcStatus,
    tabletop: TABLETOP_MODE,
    frontDist: FRONT_DIST,
    frontReady: fs.existsSync(path.join(FRONT_DIST, 'index.html')),
  })
})

app.get('/api/tabletop', (_req, res) => {
  res.json({
    enabled: TABLETOP_MODE,
    cubitCount: TABLETOP_CUBITS,
    seats: [
      { id: TABLETOP_SEAT_A, name: TABLETOP_SEAT_NAMES[TABLETOP_SEAT_A] },
      { id: TABLETOP_SEAT_B, name: TABLETOP_SEAT_NAMES[TABLETOP_SEAT_B] },
    ],
  })
})

app.get('/api/nfc/status', (_req, res) => {
  res.json(nfc.getStatus())
})

/** Mock-скан доступен всегда (удобно даже при auto→mock). */
app.post('/api/nfc/scan', (req, res) => {
  const uid = req.body?.uid
  const text = req.body?.text
  if (typeof uid !== 'string' || uid.length === 0) {
    res.status(400).json({ error: 'uid required' })
    return
  }
  nfc.injectMockTag(uid, typeof text === 'string' ? text : undefined)
  res.json({ ok: true, status: nfc.getStatus() })
})

if (fs.existsSync(path.join(FRONT_DIST, 'index.html'))) {
  app.use(
    express.static(FRONT_DIST, {
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (req.path.startsWith('/api')) {
      next()
      return
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.sendFile(path.join(FRONT_DIST, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
} else {
  console.warn(`[HTTP] front dist not found at ${FRONT_DIST} — build front first`)
  app.get('/', (_req, res) => {
    res.status(503).send('Frontend not built. Run: cd front && npm run build')
  })
}

const server = http.createServer(app)
const ws = new WsHub(server, '/ws')

ws.on('setOption', (_clientId, data) => {
  if (typeof data !== 'object' || data === null) return
  const name = (data as { name?: unknown }).name
  const value = (data as { value?: unknown }).value
  if (typeof name !== 'string' || name.length === 0) return
  if (typeof value !== 'string' && typeof value !== 'boolean') return
  options.set(name, value)
  console.log(`[Options] ${name} = ${String(value)}`)
})

const game = new GameController(ws, nfc, registry)
const invites = TABLETOP_MODE ? null : new InviteService(ws, game)
ws.onConnect((clientId) => game.onClientConnected(clientId))
ws.onDisconnect((clientId) => {
  invites?.clearForClient(clientId)
  game.onClientDisconnected(clientId)
})
nfc.start()

if (TABLETOP_MODE) {
  game.beginTabletop(TABLETOP_CUBITS)
  console.log(`[Tabletop] auto-started ${TABLETOP_CUBITS} cubits`)
}

server.listen(PORT, HOST, () => {
  console.log(`[HTTP] http://${HOST}:${PORT}`)
  console.log(`[WS]   ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/ws`)
  console.log(`[NFC] mode=${NFC_MODE}`)
  if (TABLETOP_MODE) console.log('[Tabletop] shared-screen mode ON')
})

function shutdown(): void {
  nfc.stop()
  server.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
