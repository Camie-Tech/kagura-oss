import crypto from 'node:crypto'

import { runAgenticTest, type CoreAdapters } from '@kagura-run/core'

import { createConsoleEventEmitter } from '../adapters/console-events'
import { createFsScreenshotStorage } from '../adapters/fs-screenshots'
import { createFsStateStorage } from '../adapters/fs-state'
import { createFileCredentialProvider } from '../adapters/file-credentials'
import { createAnthropicAiProvider } from '../adapters/anthropic-ai'

export async function runCommand(args: { url: string; desc: string }): Promise<number> {
  const runId = `run_${crypto.randomUUID()}`

  const adapters: CoreAdapters = {
    events: createConsoleEventEmitter(),
    screenshots: createFsScreenshotStorage(),
    credentials: createFileCredentialProvider(),
    state: createFsStateStorage(),
    interaction: {
      askUser: async () => ({ kind: 'skip' }),
    },
    billing: null,
    ai: createAnthropicAiProvider(),
  }

  const res = await runAgenticTest({
    adapters,
    runId,
    targetUrl: args.url,
    description: args.desc,
    config: { maxIterations: 1 },
  })

  if (res.status === 'paused') {
    // eslint-disable-next-line no-console
    console.log(`[kagura] paused: ${res.paused?.message}`)
    return 2
  }

  if (res.status === 'failed') {
    // eslint-disable-next-line no-console
    console.error('[kagura] run failed')
    return 1
  }

  // eslint-disable-next-line no-console
  console.log('[kagura] run completed')
  return 0
}
