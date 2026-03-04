import { describe, expect, it } from 'vitest'

import { runAgenticTest } from '../src/agent/agentic-runner'

function makeAdapters() {
  const events: any[] = []
  const saves: any[] = []

  return {
    events,
    saves,
    adapters: {
      events: {
        emit: (e: any) => events.push(e),
      },
      screenshots: {
        save: async (_runId: string, stepIndex: number, _buf: Buffer, label?: string) => ({
          url: `mock://screenshot/${stepIndex}`,
          path: undefined,
          label,
        }),
      },
      credentials: {
        getForUrl: async () => ({ email: 'test@example.com', password: 'secret' }),
      },
      state: {
        save: async (_runId: string, state: any) => {
          saves.push(state)
        },
        load: async () => null,
        delete: async () => {},
      },
      interaction: {
        askUser: async () => ({ kind: 'skip' }),
      },
      billing: null,
      ai: {
        completeText: async () => {
          // Return minimal JSON actions
          return JSON.stringify([
            { action: 'navigate', url: 'https://example.com', description: 'Go' },
            { action: 'assert', type: 'title', expected: 'Example', description: 'Check title' },
          ])
        },
      },
    },
  }
}

describe('runAgenticTest (skeleton)', () => {
  it('runs with injected executor + pageAnalysis and emits events/state', async () => {
    const { adapters, events, saves } = makeAdapters()

    const res = await runAgenticTest({
      adapters: adapters as any,
      runId: 'run_test',
      targetUrl: 'https://example.com',
      description: 'Visit example',
      _pageAnalysis: {
        title: 'Example',
        url: 'https://example.com',
        forms: [],
        buttons: [],
        links: [],
        headings: [],
        errors: [],
        modals: [],
      } as any,
      _executor: async () => ({
        success: true,
        status: 'passed',
        steps: [],
        screenshots: [],
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 1,
        consoleLogs: [],
      }),
    })

    expect(res.runId).toBe('run_test')
    expect(res.status).toBe('completed')
    expect(events.length).toBeGreaterThan(0)
    expect(saves.length).toBeGreaterThan(0)
  })
})
