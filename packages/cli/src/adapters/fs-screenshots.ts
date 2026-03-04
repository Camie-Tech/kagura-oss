import fs from 'node:fs/promises'
import path from 'node:path'

import type { ScreenshotStorage } from '@kagura-run/core'
import { kaguraScreenshotsDir } from '../config/paths'

export function createFsScreenshotStorage(): ScreenshotStorage {
  return {
    async save(runId, stepIndex, buffer, label) {
      const baseDir = kaguraScreenshotsDir()
      const runDir = path.join(baseDir, runId)
      await fs.mkdir(runDir, { recursive: true })

      const safeLabel = label ? label.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 50) : ''
      const name = `${String(stepIndex).padStart(3, '0')}${safeLabel ? `-${safeLabel}` : ''}.png`
      const filePath = path.join(runDir, name)
      await fs.writeFile(filePath, buffer)

      return { url: `file://${filePath}`, path: filePath }
    },
  }
}
