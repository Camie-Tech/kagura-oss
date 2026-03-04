/**
 * Agentic Runner (OSS)
 *
 * Phase 4 goal: provide an OSS-safe agent loop entrypoint that relies only on adapters.
 *
 * NOTE: This implementation is intentionally adapter-driven and avoids any Cloud concerns
 * (DB, Stripe, hosted storage). Cloud/CLI provide adapters.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { CoreAdapters } from '../adapters'
import { extractPageAnalysis, type PageAnalysis } from '../dom-extractor'
import { normalizeProviderError, type DeploymentMode } from '../providers/provider-errors'
import { createEmptyState, touchState, type AgentExecutionState } from '../state'
import { parseWithPageAnalysis, type PlaywrightAction } from '../ai/ai-parser'
import { executeTest, type TestExecutionResult, type RunnerTestConfig } from '../runner/test-runner'

export type AgenticRunStatus = 'completed' | 'failed'

export type AgenticRunResult = {
  runId: string
  status: AgenticRunStatus
  /** Summary suitable for logs/check runs. */
  summary: {
    totalSteps: number
    passedSteps: number
    failedSteps: number
  }
  execution: TestExecutionResult
  state: AgentExecutionState
}

export type AgenticRunnerConfig = {
  /** How many planning/execution iterations to attempt. */
  maxIterations?: number
  /** Deployment mode affects error messaging. */
  deploymentMode?: DeploymentMode
  /** Test runner configuration. */
  runnerConfig?: RunnerTestConfig
}

/**
 * Main entrypoint.
 *
 * For Phase 4 parity, this does:
 * 1) Navigate + analyze DOM (PageAnalysis)
 * 2) Ask AI to produce action plan (parseWithPageAnalysis)
 * 3) Execute action plan (executeTest)
 *
 * Adapters provide:
 * - AI
 * - events
 * - screenshots
 * - state persistence
 * - (optional) billing
 * - (optional) user interaction
 */
export async function runAgenticTest(params: {
  adapters: CoreAdapters
  runId: string
  targetUrl: string
  description: string
  userId?: string | null
  config?: AgenticRunnerConfig
  /**
   * Test-only: inject a page analysis instead of launching a browser.
   */
  _pageAnalysis?: PageAnalysis
  /**
   * Test-only: inject an executor to avoid running Playwright.
   */
  _executor?: typeof executeTest
}): Promise<AgenticRunResult> {
  const { adapters, runId, targetUrl, description, userId } = params
  const config = params.config ?? {}

  const maxIterations = config.maxIterations ?? 1
  const deploymentMode = config.deploymentMode ?? 'cloud'
  const exec = params._executor ?? executeTest

  adapters.events.emit({
    type: 'run',
    timestamp: Date.now(),
    data: { phase: 'started', runId, targetUrl, description },
  })

  let state: AgentExecutionState = createEmptyState({ runId, initialUrl: targetUrl })

  // If a previous state exists, allow resume (Phase 4 parity uses last snapshot)
  const existing = await adapters.state.load(runId).catch(() => null)
  if (existing) {
    state = existing
  }

  state = touchState({ ...state, currentUrl: state.currentUrl || targetUrl })
  await adapters.state.save(runId, state)

  let lastError: string | null = null

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    adapters.events.emit({
      type: 'agentic',
      timestamp: Date.now(),
      data: { phase: 'iteration_started', runId, iteration, maxIterations },
    })

    // Optional billing gate
    if (adapters.billing) {
      const ok = await adapters.billing.hasCredits(userId ?? null)
      if (!ok) {
        lastError = 'Insufficient credits'
        break
      }
    }

    try {
      // 1) Acquire page analysis
      const pageAnalysis = params._pageAnalysis ?? (await analyzeTargetUrl(targetUrl))

      // 2) Plan
      const plan = await parseWithPageAnalysis({
        adapters,
        description,
        targetUrl,
        pageAnalysis,
        userId: userId ?? null,
      })

      if (!plan.success) {
        throw new Error(plan.error || 'Failed to generate action plan')
      }

      const actions = plan.actions as PlaywrightAction[]

      adapters.events.emit({
        type: 'agentic',
        timestamp: Date.now(),
        data: { phase: 'plan_generated', runId, iteration, actionsCount: actions.length },
      })

      // Update state snapshot (conversation history is adapter/provider specific; we store minimal)
      state = touchState({
        ...state,
        currentUrl: targetUrl,
        conversationHistory: [...state.conversationHistory, { iteration, kind: 'plan', actionsCount: actions.length }],
      })
      await adapters.state.save(runId, state)

      // 3) Execute
      const execution = await exec({
        adapters,
        runId,
        actions,
        config: config.runnerConfig,
      })

      // Optional billing deduct based on something simple (later: token/step based)
      if (adapters.billing) {
        await adapters.billing.deductCredits(userId ?? null, { reason: 'agentic_run', units: 1 })
      }

      const failedSteps = execution.steps.filter((s) => s.status === 'failed').length
      const passedSteps = execution.steps.filter((s) => s.status === 'success').length

      state = touchState({
        ...state,
        currentUrl: targetUrl,
        steps: execution.steps,
        screenshots: execution.screenshots.map((s) => ({ url: s.url, stepIndex: s.stepIndex, label: s.label })),
        conversationHistory: [...state.conversationHistory, { iteration, kind: 'execution', status: execution.status }],
      })
      await adapters.state.save(runId, state)

      adapters.events.emit({
        type: 'run',
        timestamp: Date.now(),
        data: { phase: 'completed', runId, status: execution.status, durationMs: execution.durationMs },
      })

      return {
        runId,
        status: execution.status === 'passed' ? 'completed' : 'failed',
        summary: {
          totalSteps: execution.steps.length,
          passedSteps,
          failedSteps,
        },
        execution,
        state,
      }

    } catch (err) {
      const normalized = normalizeProviderError(err, { deploymentMode })
      lastError = normalized.message

      adapters.events.emit({
        type: 'error',
        timestamp: Date.now(),
        data: { runId, iteration, message: normalized.message, code: normalized.code, status: normalized.status },
      })

      state = touchState({
        ...state,
        conversationHistory: [...state.conversationHistory, { iteration, kind: 'error', message: normalized.message }],
      })
      await adapters.state.save(runId, state)

      // try next iteration if any
      continue
    }
  }

  adapters.events.emit({
    type: 'run',
    timestamp: Date.now(),
    data: { phase: 'completed', runId, status: 'failed', error: lastError || 'Unknown error' },
  })

  // Return a minimal failure execution result if we never ran executeTest
  const now = new Date()
  const execution: TestExecutionResult = {
    success: false,
    status: 'error',
    steps: [],
    screenshots: [],
    errorMessage: lastError || 'Agentic run failed',
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    consoleLogs: [],
  }

  return {
    runId,
    status: 'failed',
    summary: { totalSteps: 0, passedSteps: 0, failedSteps: 0 },
    execution,
    state,
  }
}

async function analyzeTargetUrl(url: string): Promise<PageAnalysis> {
  // For OSS parity we launch a short-lived Playwright browser to capture DOM analysis.
  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null

  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    page = await context.newPage()

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    return await extractPageAnalysis(page)
  } finally {
    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }
}
