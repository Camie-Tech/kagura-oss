/**
 * Adapter Interfaces — Contract between core engine and consumers (web/cli)
 *
 * Core never imports from apps/web or apps/cli.
 * Instead, consumers implement these interfaces and inject them into core functions.
 */


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

import type { AgentExecutionState } from './state'

export interface StateStorage {
  /**
   * Persist the full state snapshot for this run.
   * Implementations should overwrite any previous snapshot.
   */
  save(runId: string, state: AgentExecutionState): Promise<void>

  /**
   * Load the last saved state snapshot for this run.
   */
  load(runId: string): Promise<AgentExecutionState | null>

  /**
   * Delete any stored state for this run.
   */
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

export type AIModelId = string

export interface AICompletionRequest {
  /** System instructions for the model. */
  system: string
  /** User prompt content. */
  prompt: string
  /** Model identifier (provider-specific). */
  model?: AIModelId
  /** Maximum output tokens. */
  maxTokens?: number
  /** Temperature / creativity. */
  temperature?: number
}

export interface AIProvider {
  /**
   * Provider-agnostic text completion.
   *
   * Core must not instantiate provider SDK clients or read env vars.
   * Cloud/CLI implement this adapter using their preferred provider.
   */
  completeText(request: AICompletionRequest, userId?: string | null): Promise<string>
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
