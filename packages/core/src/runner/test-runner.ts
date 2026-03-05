/**
 * Test Runner (Playwright)
 *
 * Executes Playwright actions produced by the AI parser.
 *
 * OSS-safe design:
 * - No DB imports
 * - No filesystem paths
 * - Screenshots via adapters.screenshots
 * - Events via adapters.events
 */

import type { Browser, BrowserContext, Page } from 'playwright'
import type { CoreAdapters } from '../adapters.js'
import type { TestStep } from '../types.js'
import type { PlaywrightAction } from '../ai/ai-parser.js'
import { launchBrowser, executeInstrumentedAction } from '../agent/action-executor.js'

export type BrowserType = 'chromium' | 'firefox' | 'webkit'
export type InputMode = 'ask_user' | 'ai_generated'

export interface RunnerTestConfig {
  browser?: BrowserType
  headless?: boolean
  viewport?: { width: number; height: number }
  timeout?: number
  stepTimeout?: number
  inputMode?: InputMode
}

export interface ScreenshotResult {
  url: string
  path?: string
  stepIndex: number
  label?: string
}

export interface TestExecutionResult {
  success: boolean
  status: 'passed' | 'failed' | 'error'
  steps: TestStep[]
  screenshots: ScreenshotResult[]
  errorMessage?: string
  startedAt: Date
  completedAt: Date
  durationMs: number
  consoleLogs: string[]
}

const DEFAULT_CONFIG: Required<RunnerTestConfig> = {
  browser: 'chromium',
  headless: true,
  viewport: { width: 1920, height: 1080 },
  timeout: 120000,
  stepTimeout: 30000,
  inputMode: 'ask_user',
}

export async function executeTest(params: {
  adapters: CoreAdapters
  runId: string
  actions: PlaywrightAction[]
  config?: RunnerTestConfig
  userAgent?: string
}): Promise<TestExecutionResult> {
  const { adapters, runId, actions, config = {}, userAgent } = params

  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const startedAt = new Date()
  const consoleLogs: string[] = []
  const steps: TestStep[] = []
  const screenshots: ScreenshotResult[] = []

  let browser: Browser | null = null
  let context: BrowserContext | null = null
  let page: Page | null = null

  let overallSuccess = true
  let errorMessage: string | undefined

  try {
    browser = await launchBrowser(mergedConfig.browser, mergedConfig.headless)

    context = await browser.newContext({
      viewport: mergedConfig.viewport,
      userAgent: userAgent || 'Kagura-TestBot/1.0',
    })

    page = await context.newPage()

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    })

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]

      const res = await executeInstrumentedAction({
        page,
        action,
        adapters,
        runId,
        stepIndex: i,
        stepTimeout: mergedConfig.stepTimeout,
        totalSteps: actions.length,
      })

      steps.push(res.step)
      if (res.screenshot) screenshots.push(res.screenshot)

      if (res.step.status === 'failed') {
        overallSuccess = false
        errorMessage = res.step.errorMessage
        break
      }
    }

  } catch (err) {
    overallSuccess = false
    errorMessage = err instanceof Error ? err.message : 'Test execution failed'

    adapters.events.emit({
      type: 'error',
      timestamp: Date.now(),
      data: { runId, message: errorMessage },
    })

  } finally {
    if (page) await page.close().catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
  }

  const completedAt = new Date()

  return {
    success: overallSuccess,
    status: overallSuccess ? 'passed' : errorMessage?.includes('timed out') ? 'error' : 'failed',
    steps,
    screenshots,
    errorMessage,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    consoleLogs,
  }
}


