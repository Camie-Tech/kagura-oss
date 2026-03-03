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

import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright'
import type { CoreAdapters } from '../adapters'
import type { TestStep } from '../types'
import type { PlaywrightAction } from '../ai/ai-parser'

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
      const stepStart = Date.now()

      const step: TestStep = {
        index: i,
        action: action.action,
        description: action.description,
        status: 'skipped',
        durationMs: 0,
      }

      adapters.events.emit({
        type: 'step',
        timestamp: Date.now(),
        data: {
          phase: 'started',
          runId,
          stepIndex: i,
          totalSteps: actions.length,
          description: action.description,
          action: action.action,
        },
      })

      try {
        const timeoutPromise = timeout(mergedConfig.stepTimeout, `Step ${i + 1} timed out after ${mergedConfig.stepTimeout}ms`)
        try {
          await Promise.race([executeAction(page, action), timeoutPromise])
        } finally {
          timeoutPromise.clear()
        }

        step.status = 'success'
        step.durationMs = Date.now() - stepStart

        if (action.action === 'screenshot' || shouldAutoScreenshot(action)) {
          const res = await captureScreenshot(adapters, page, runId, i, action.description)
          if (res) {
            screenshots.push(res)
            step.screenshotUrl = res.url

            adapters.events.emit({
              type: 'screenshot',
              timestamp: Date.now(),
              data: { runId, stepIndex: i, screenshotUrl: res.url, label: res.label },
            })
          }
        }

      } catch (err) {
        step.status = 'failed'
        step.durationMs = Date.now() - stepStart
        step.errorMessage = err instanceof Error ? err.message : 'Unknown error'

        overallSuccess = false
        errorMessage = step.errorMessage

        const res = await captureScreenshot(adapters, page, runId, i, `Failure: ${action.description}`)
        if (res) {
          screenshots.push(res)
          step.screenshotUrl = res.url

          adapters.events.emit({
            type: 'screenshot',
            timestamp: Date.now(),
            data: { runId, stepIndex: i, screenshotUrl: res.url, label: res.label },
          })
        }
      }

      steps.push(step)

      adapters.events.emit({
        type: 'step',
        timestamp: Date.now(),
        data: { phase: 'completed', runId, stepIndex: i, totalSteps: actions.length, step },
      })

      if (!overallSuccess) break
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

async function launchBrowser(browserType: BrowserType, headless: boolean): Promise<Browser> {
  const options = { headless }
  switch (browserType) {
    case 'firefox':
      return firefox.launch(options)
    case 'webkit':
      return webkit.launch(options)
    case 'chromium':
    default:
      return chromium.launch(options)
  }
}

async function executeAction(page: Page, action: PlaywrightAction): Promise<void> {
  switch (action.action) {
    case 'navigate':
      if (!action.url) throw new Error('Navigate action requires URL')
      await page.goto(action.url, { waitUntil: 'networkidle', timeout: 30000 })
      break

    case 'click':
      if (!action.selector) throw new Error('Click action requires selector')
      await page.click(action.selector, { timeout: action.timeout || 10000 })
      break

    case 'type':
      if (!action.selector) throw new Error('Type action requires selector')
      if (!action.text) throw new Error('Type action requires text')
      await page.fill(action.selector, action.text, { timeout: action.timeout || 10000 })
      break

    case 'wait':
      if (!action.selector) throw new Error('Wait action requires selector')
      await page.waitForSelector(action.selector, { timeout: action.timeout || 10000, state: 'visible' })
      break

    case 'assert':
      await executeAssert(page, action)
      break

    case 'screenshot':
      // screenshot is captured separately
      break

    case 'scroll':
      if (action.selector) {
        await page.locator(action.selector).scrollIntoViewIfNeeded()
      } else {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      }
      break

    case 'hover':
      if (!action.selector) throw new Error('Hover action requires selector')
      await page.hover(action.selector, { timeout: action.timeout || 10000 })
      break

    case 'select':
      if (!action.selector) throw new Error('Select action requires selector')
      if (!action.text) throw new Error('Select action requires text (option to select)')
      await page.selectOption(action.selector, { label: action.text }, { timeout: action.timeout || 10000 })
      break

    default:
      throw new Error(`Unknown action type: ${action.action}`)
  }
}

async function executeAssert(page: Page, action: PlaywrightAction): Promise<void> {
  const assertType = action.type || 'text'
  const timeoutMs = action.timeout || 10000

  switch (assertType) {
    case 'text': {
      if (!action.selector) throw new Error('Text assertion requires selector')
      if (!action.expected) throw new Error('Text assertion requires expected value')

      const element = await page.waitForSelector(action.selector, { timeout: timeoutMs })
      const text = await element?.textContent()
      if (!text?.includes(action.expected)) {
        throw new Error(`Expected text "${action.expected}" not found. Got: "${text}"`)
      }
      break
    }

    case 'visible':
      if (!action.selector) throw new Error('Visible assertion requires selector')
      await page.waitForSelector(action.selector, { state: 'visible', timeout: timeoutMs })
      break

    case 'hidden':
      if (!action.selector) throw new Error('Hidden assertion requires selector')
      await page.waitForSelector(action.selector, { state: 'hidden', timeout: timeoutMs })
      break

    case 'url': {
      if (!action.expected) throw new Error('URL assertion requires expected value')
      const currentUrl = page.url()
      if (!currentUrl.includes(action.expected)) {
        throw new Error(`Expected URL to contain "${action.expected}". Got: "${currentUrl}"`)
      }
      break
    }

    case 'title': {
      if (!action.expected) throw new Error('Title assertion requires expected value')
      const title = await page.title()
      if (!title.includes(action.expected)) {
        throw new Error(`Expected title to contain "${action.expected}". Got: "${title}"`)
      }
      break
    }

    default:
      throw new Error(`Unknown assertion type: ${assertType}`)
  }
}

async function captureScreenshot(
  adapters: CoreAdapters,
  page: Page,
  runId: string,
  stepIndex: number,
  label: string
): Promise<ScreenshotResult | null> {
  try {
    const buffer = await page.screenshot({ fullPage: false })
    const stored = await adapters.screenshots.save(runId, stepIndex, buffer, label)
    return { url: stored.url, path: stored.path, stepIndex, label }
  } catch (err) {
    adapters.events.emit({
      type: 'error',
      timestamp: Date.now(),
      data: { runId, message: `Screenshot capture failed: ${err instanceof Error ? err.message : String(err)}` },
    })
    return null
  }
}

function shouldAutoScreenshot(action: PlaywrightAction): boolean {
  return ['navigate', 'assert', 'click'].includes(action.action)
}

function timeout(ms: number, message: string): Promise<never> & { clear: () => void } {
  let timer: NodeJS.Timeout
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  }) as Promise<never> & { clear: () => void }

  promise.clear = () => clearTimeout(timer)
  return promise
}
