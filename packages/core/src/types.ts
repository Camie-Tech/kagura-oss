/**
 * Shared Types — Used across core runners
 *
 * These types are extracted from apps/web/lib/db.ts
 * and made framework-agnostic.
 */

import type { EmailSkillConfig } from './skills/email/types.js'

// ── Test Configuration ─────────────────────────────────────────────────────

export interface TestConfig {
  viewport?: {
    width: number
    height: number
  }
  timeout?: number
  inputMode?: 'ask_user' | 'ai_generated'
  headless?: boolean
}

// ── Test Step ──────────────────────────────────────────────────────────────

export interface TestStep {
  index: number
  action: string
  description: string
  status: 'success' | 'failed' | 'skipped'
  errorMessage?: string
  screenshotUrl?: string
  durationMs: number
}

// ── Adaptation Log ─────────────────────────────────────────────────────────

export interface AdaptationLog {
  turn: number
  situation: string
  reasoning: string
  action: string
  result: string
  timestamp: number
}

// ── User Interaction Log ───────────────────────────────────────────────────

export interface UserInteractionLog {
  turn: number
  question: string
  response: string
  timestamp: number
}

// ── Agent Run Parameters ───────────────────────────────────────────────────

export interface AgentRunParams {
  runId: string
  description: string
  targetUrl: string
  config?: TestConfig
  userId?: string | null
}

// ── Agent Run Result ───────────────────────────────────────────────────────

export interface AgentRunResult {
  success: boolean
  status: 'passed' | 'failed' | 'paused' | 'paused_credits' | 'timed_out' | 'error'
  steps: TestStep[]
  errorMessage?: string
  aiSummary?: string
  developerReport?: string
  durationMs: number
  adaptations?: AdaptationLog[]
  userInteractions?: UserInteractionLog[]
}

// ── Exploration Configuration ──────────────────────────────────────────────

export interface ExplorationConfig {
  maxPages: number
  maxDepth: number
  timeout: number
  suggestedTestCount: number
  autoRun: boolean
  /** Optional email skill config for auto-generating credentials and handling verification flows. */
  emailConfig?: EmailSkillConfig
}

// ── Exploration Site Map ───────────────────────────────────────────────────

export interface ExplorationPage {
  url: string
  title: string
  depth: number
  discoveredAt: number
}

export interface ExplorationLink {
  from: string
  to: string
  text: string
}

export interface ExplorationForm {
  url: string
  action: string
  method: string
  inputs: string[]
}

export interface ExplorationFlow {
  name: string
  steps: string[]
}

export interface ExplorationSiteMap {
  pages: ExplorationPage[]
  links: ExplorationLink[]
  forms: ExplorationForm[]
  flows: ExplorationFlow[]
}

// ── Exploration Run Parameters ─────────────────────────────────────────────

export interface ExplorationParams {
  explorationId: string
  userId: string
  targetUrl: string
  instructions?: string
  config?: Partial<ExplorationConfig>
}

// ── Exploration Run Result ─────────────────────────────────────────────────

export interface ExplorationResult {
  success: boolean
  status: 'completed' | 'completed_with_auth_failure' | 'stopped' | 'error'
  siteMap: ExplorationSiteMap
  suggestions: TestSuggestion[]
  errorMessage?: string
  durationMs: number
}

// ── Test Suggestion ────────────────────────────────────────────────────────

export interface TestSuggestion {
  name: string
  objective: string
  url: string
  priority: 'high' | 'medium' | 'low'
  category: 'auth' | 'navigation' | 'form' | 'crud' | 'workflow' | 'other'
}
