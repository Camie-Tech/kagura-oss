import { describe, expect, it } from 'vitest'

import { runAgenticTest } from '../src/agent/agentic-runner'

describe('runAgenticTest pause behavior', () => {
  it('pauses when credentials are missing', async () => {
    const events: any[] = []
    const saves: any[] = []

    const res = await runAgenticTest({
      adapters: {
        events: { emit: (e: any) => events.push(e) },
        screenshots: {
          save: async () => ({ url: 'mock://s' }),
        },
        credentials: {
          getForUrl: async () => null,
        },
        state: {
          save: async (_id: string, s: any) => saves.push(s),
          load: async () => null,
          delete: async () => {},
        },
        interaction: {
          askUser: async () => ({ kind: 'skip' }),
        },
        billing: null,
        ai: {
          completeText: async () => '[]',
        },
      } as any,
      runId: 'run_pause',
      targetUrl: 'https://example.com',
      description: 'Test',
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
      _executor: async () => {
        throw new Error('should not execute')
      },
    })

    expect(res.status).toBe('paused')
    expect(res.paused?.reason).toBe('missing_credentials')
    expect(events.some((e) => e?.data?.phase === 'paused')).toBe(true)
    expect(saves.length).toBeGreaterThan(0)
  })
})
