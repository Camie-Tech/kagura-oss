import os from 'node:os'
import path from 'node:path'

export function kaguraHomeDir(): string {
  return path.join(os.homedir(), '.kagura')
}

export function kaguraStateDir(): string {
  return path.join(kaguraHomeDir(), 'state')
}

export function kaguraScreenshotsDir(): string {
  return path.join(kaguraHomeDir(), 'screenshots')
}

export function kaguraConfigPath(): string {
  return path.join(kaguraHomeDir(), 'config.json')
}

export function kaguraCredentialsPath(): string {
  return path.join(kaguraHomeDir(), 'credentials.json')
}
