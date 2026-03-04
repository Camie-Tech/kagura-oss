import { describe, expect, it } from 'vitest'

import { createEmptyState, touchState } from '../src/state'

describe('AgentExecutionState', () => {
  it('is JSON serializable and roundtrips', () => {
    const state = createEmptyState({ runId: 'run_123', initialUrl: 'https://example.com' })
    const json = JSON.stringify(state)
    const parsed = JSON.parse(json)

    expect(parsed.runId).toBe('run_123')
    expect(parsed.currentUrl).toBe('https://example.com')
    expect(Array.isArray(parsed.steps)).toBe(true)
    expect(Array.isArray(parsed.screenshots)).toBe(true)
    expect(Array.isArray(parsed.conversationHistory)).toBe(true)
  })

  it('updates updatedAt via touchState', async () => {
    const s1 = createEmptyState({ runId: 'run_abc', initialUrl: 'https://example.com', now: new Date('2026-01-01T00:00:00.000Z') })
    const s2 = touchState(s1, new Date('2026-01-01T00:00:05.000Z'))

    expect(s2.updatedAt).not.toBe(s1.updatedAt)
    expect(s2.startedAt).toBe(s1.startedAt)
  })
})
