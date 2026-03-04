/**
 * Portable execution state for pause/resume.
 *
 * Requirements:
 * - JSON serializable
 * - No Playwright objects
 * - No cloud/DB assumptions
 */

import type { TestStep } from './types'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export type JsonObject = { [key: string]: JsonValue }

export interface ScreenshotRef {
  /** Storage key or URL depending on the adapter implementation. */
  url: string
  stepIndex?: number
  label?: string
  createdAt?: number
}

export interface AgentExecutionState {
  /** Stable run identifier (provided by caller). */
  runId: string

  /** ISO timestamps to keep JSON portable across languages. */
  startedAt: string
  updatedAt: string

  /** Current best-known URL in the session. */
  currentUrl: string

  /** Steps executed so far (portable). */
  steps: TestStep[]

  /** References to screenshots captured so far. */
  screenshots: ScreenshotRef[]

  /** Provider-agnostic conversation history (model messages, tool outputs, etc.). */
  conversationHistory: JsonValue[]

  /** Arbitrary metadata (caller-owned). */
  metadata?: JsonObject
}

export function createEmptyState(params: {
  runId: string
  initialUrl: string
  now?: Date
}): AgentExecutionState {
  const now = params.now ?? new Date()
  return {
    runId: params.runId,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    currentUrl: params.initialUrl,
    steps: [],
    screenshots: [],
    conversationHistory: [],
  }
}

export function touchState(state: AgentExecutionState, now: Date = new Date()): AgentExecutionState {
  return {
    ...state,
    updatedAt: now.toISOString(),
  }
}
