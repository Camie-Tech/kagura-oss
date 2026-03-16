import fs from 'node:fs/promises'
import { kaguraConfigPath, kaguraHomeDir } from './paths.js'

export type EmailConfig = {
  baseEmail: string
  imap: {
    host: string
    port: number
    secure: boolean
    auth: { user: string; pass: string }
  }
  smtp?: {
    host: string
    port: number
    secure: boolean
    auth: { user: string; pass: string }
  }
}

export type CliConfig = {
  mode?: 'local' | 'cloud'
  /** Web app URL (for setup links, dashboard) */
  appUrl?: string
  /** Public API URL (for CLI commands) */
  apiUrl?: string
  apiKey?: string
  anthropicApiKey?: string
  email?: EmailConfig
}

export async function loadCliConfig(): Promise<CliConfig> {
  const p = kaguraConfigPath()
  try {
    const raw = await fs.readFile(p, 'utf8')
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export async function saveCliConfig(cfg: CliConfig): Promise<void> {
  await fs.mkdir(kaguraHomeDir(), { recursive: true })
  const p = kaguraConfigPath()
  const tmp = `${p}.tmp`
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), { encoding: 'utf8' })
  await fs.rename(tmp, p)
}

/** 
 * Resolve the public API URL
 * Priority: KAGURA_API_URL env > config.apiUrl > default
 */
export function resolveApiUrl(cfg: CliConfig): string {
  const url = process.env.KAGURA_API_URL || cfg.apiUrl || 'https://api.kagura.run'
  return url.replace(/\/$/, '')
}

/** 
 * Resolve the web app URL (for browser links, dashboard)
 * Priority: KAGURA_APP_URL env > config.appUrl > default
 */
export function resolveAppUrl(cfg: CliConfig): string {
  const url = process.env.KAGURA_APP_URL || cfg.appUrl || 'https://app.kagura.run'
  return url.replace(/\/$/, '')
}

export function resolveApiKey(cfg: CliConfig): string | undefined {
  return cfg.apiKey || process.env.KAGURA_API_KEY
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '')
}
