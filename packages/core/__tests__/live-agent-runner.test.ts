import { describe, expect, it } from 'vitest'

import { runLiveAgenticTest } from '../src/agent/live-agent-runner'

function makeAdapters() {
  const events: any[] = []
  const saves: any[] = []

  return {
    events,
    saves,
    adapters: {
      events: { emit: (e: any) => events.push(e) },
      screenshots: {
        save: async (_runId: string, stepIndex: number) => ({ url: `mock://shot/${stepIndex}`, path: '' }),
      },
      credentials: {
        getForUrl: async () => [{ id: 'c1', label: 'default', values: { email: 'a@b.com', password: 'p' } }],
        recordUsage: async () => {},
      },
      state: {
        save: async (_id: string, s: any) => saves.push(s),
        load: async () => null,
        delete: async () => {},
      },
      interaction: {
        askUser: async () => 'ok',
        isAborted: () => true, // abort immediately so we don't need Playwright
      },
      billing: null,
      ai: {
        completeText: async () => '{"action":"done","summary":"ok"}',
      },
    },
  }
}

describe('runLiveAgenticTest', () => {
  it('pauses when aborted before doing any turn work', async () => {
    const { adapters, events } = makeAdapters()

    const res = await runLiveAgenticTest({
      adapters: adapters as any,
      runId: 'run_live',
      targetUrl: 'https://example.com',
      description: 'Test',
      config: { maxTurns: 1 },
    })

    expect(res.status).toBe('paused')
    expect(events.some((e) => e.type === 'pause')).toBe(true)
  })
})
