/**
 * Adapter Interfaces — Contract between core engine and consumers (web/cli)
 *
 * Core never imports from apps/web or apps/cli.
 * Instead, consumers implement these interfaces and inject them into core functions.
 */

import type Anthropic from '@anthropic-ai/sdk'

// ── Event Emitter ──────────────────────────────────────────────────────────

export interface CoreEvent {
  type: 'step' | 'screenshot' | 'status' | 'error' | 'completed' | 'pause' | 'log'
  data: Record<string, unknown>
  timestamp: number
}

export interface EventEmitter {
  emit(event: CoreEvent): void
}

// ── Screenshot Storage ─────────────────────────────────────────────────────

export interface ScreenshotStorage {
  save(
    runId: string,
    stepIndex: number,
    buffer: Buffer,
    label?: string
  ): Promise<{ url: string; path: string }>
}

// ── Credential Provider ────────────────────────────────────────────────────

export interface SavedCredential {
  id: string
  label: string
  values: Record<string, string> // { email, password, etc }
}

export interface CredentialProvider {
  getForUrl(userId: string | null, url: string): Promise<SavedCredential[]>
  recordUsage(credentialId: string): Promise<void>
}

// ── State Storage ──────────────────────────────────────────────────────────

export interface ExecutionState {
  conversationHistory: unknown[]
  currentUrl: string
  stepsCompleted: unknown[] // TestStep[]
  screenshotsTaken: string[]
  // Additional resumable state
  [key: string]: unknown
}

export interface StateStorage {
  save(runId: string, state: ExecutionState): Promise<void>
  load(runId: string): Promise<ExecutionState | null>
  delete(runId: string): Promise<void>
}

// ── User Interaction ───────────────────────────────────────────────────────

export interface UserInteraction {
  /**
   * Ask the user a question and wait for response.
   * In web: pauses execution, shows UI prompt, waits for API call.
   * In CLI: prompts on stdin.
   */
  askUser(question: string): Promise<string>

  /**
   * Check if the run has been aborted by the user.
   */
  isAborted(): boolean
}

// ── Billing Provider ───────────────────────────────────────────────────────

export interface BillingProvider {
  hasCredits(userId: string): Promise<boolean>
  deduct(userId: string, amount: number): Promise<void>
}

// ── AI Provider ────────────────────────────────────────────────────────────

export interface AIProvider {
  /**
   * Get an Anthropic client for the given user.
   * In cloud mode: uses server API key.
   * In self-hosted mode: uses user's connected provider.
   * In CLI mode: uses ANTHROPIC_API_KEY env var.
   */
  getAnthropicClient(userId?: string | null): Anthropic

  // Future: getOpenAIClient()
}

// ── Combined Adapters ──────────────────────────────────────────────────────

/**
 * All adapters combined — passed to core runner functions.
 */
export interface CoreAdapters {
  events: EventEmitter
  screenshots: ScreenshotStorage
  credentials: CredentialProvider
  state: StateStorage
  interaction: UserInteraction
  billing: BillingProvider | null // null = skip billing (CLI mode)
  ai: AIProvider
}
