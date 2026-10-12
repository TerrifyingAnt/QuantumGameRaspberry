import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './config.js'

export type OptionValue = string | boolean

const DEFAULTS: Record<string, OptionValue> = {
  ssid: 'BoardGame',
  password: 'boardgame',
  allowCardReplay: false,
}

export class Options {
  private values: Record<string, OptionValue> = { ...DEFAULTS }
  private readonly filePath: string

  constructor(filePath = path.join(REPO_ROOT, 'server', 'data', 'options.json')) {
    this.filePath = filePath
    this.load()
  }

  load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, unknown>
      for (const [name, value] of Object.entries(raw)) {
        if (typeof value === 'string' || typeof value === 'boolean') {
          this.values[name] = value
        }
      }
    } catch {
      console.warn('[Options] Failed to load, using defaults')
    }
  }

  save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.values, null, 2), 'utf8')
  }

  get(name: string): OptionValue | undefined {
    return this.values[name]
  }

  set(name: string, value: OptionValue): void {
    this.values[name] = value
    this.save()
  }
}
