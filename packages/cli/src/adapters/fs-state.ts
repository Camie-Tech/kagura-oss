import fs from 'node:fs/promises'
import path from 'node:path'

import type { StateStorage, AgentExecutionState } from '@kagura-run/core'
import { kaguraStateDir } from '../config/paths.js'

export function createFsStateStorage(): StateStorage {
  return {
    async save(runId: string, state: AgentExecutionState) {
      const dir = kaguraStateDir()
      await fs.mkdir(dir, { recursive: true })
      const p = path.join(dir, `${runId}.json`)
      const tmp = `${p}.tmp`
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
      await fs.rename(tmp, p)
    },

    async load(runId: string) {
      const p = path.join(kaguraStateDir(), `${runId}.json`)
      try {
        const raw = await fs.readFile(p, 'utf8')
        return JSON.parse(raw)
      } catch {
        return null
      }
    },

    async delete(runId: string) {
      const p = path.join(kaguraStateDir(), `${runId}.json`)
      await fs.rm(p, { force: true })
    },
  }
}
