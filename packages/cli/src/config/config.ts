import fs from 'node:fs/promises'

import { kaguraConfigPath, kaguraHomeDir } from './paths.js'

export type CliConfig = {
  apiUrl?: string
  apiKey?: string
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

export function resolveApiUrl(cfg: CliConfig): string {
  return cfg.apiUrl || process.env.KAGURA_API_URL || 'http://localhost:3004'
}

export function resolveApiKey(cfg: CliConfig): string | undefined {
  return cfg.apiKey || process.env.KAGURA_API_KEY
}

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '')
}
