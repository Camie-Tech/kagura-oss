/**
 * Shared Action Executor Primitives (OSS)
 *
 * Low-level utilities for executing Playwright actions and capturing screenshots.
 * Used by both `runner/test-runner` and the live agent loop runner.
 *
 * Adapter-only: no cloud imports, no env reads.
 */

import { chromium, firefox, webkit, type Browser, type Page } from 'playwright'
import type { CoreAdapters } from '../adapters.js'
import type { PlaywrightAction } from '../ai/ai-parser.js'
import type { TestStep } from '../types.js'

export type ActionExecutorBrowserType = 'chromium' | 'firefox' | 'webkit'

export interface ActionExecutorScreenshotResult {
  url: string
  path?: string
  stepIndex: number
  label?: string
}

export interface ActionResult {
  step: TestStep
  screenshot?: ActionExecutorScreenshotResult
}

export async function launchBrowser(browserType: ActionExecutorBrowserType, headless: boolean): Promise<Browser> {
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

export async function executeSingleAction(page: Page, action: PlaywrightAction): Promise<void> {
  switch (action.action) {
    case 'navigate': {
      if (!action.url) throw new Error('Navigate action requires url')
      await page.goto(action.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
        page.goto(action.url!, { waitUntil: 'domcontentloaded', timeout: 30000 }),
      )
      return
    }

    case 'click': {
      if (!action.selector) throw new Error('Click action requires selector')
      
      // Check if this looks like a submit/login button that might trigger navigation
      const isLikelySubmit = action.selector.toLowerCase().includes('submit') ||
                             action.selector.toLowerCase().includes('login') ||
                             action.selector.toLowerCase().includes('sign') ||
                             action.description?.toLowerCase().includes('submit') ||
                             action.description?.toLowerCase().includes('login') ||
                             action.description?.toLowerCase().includes('sign in')
      
      const currentUrl = page.url()
      await page.click(action.selector, { timeout: action.timeout ?? 10000 })
      
      // For submit-like buttons, wait for navigation or network idle
      if (isLikelySubmit) {
        try {
          // Wait up to 10 seconds for URL to change OR network to settle
          await Promise.race([
            page.waitForURL((url) => url.href !== currentUrl, { timeout: 10000 }),
            page.waitForLoadState('networkidle', { timeout: 10000 }),
          ])
        } catch {
          // If neither happens, just wait a bit for any async updates
          await page.waitForTimeout(2000)
        }
      } else {
        // For regular clicks, brief wait for any animations/updates
        await page.waitForTimeout(500)
      }
      return
    }

    case 'type': {
      if (!action.selector) throw new Error('Type action requires selector')
      if (typeof action.text !== 'string') throw new Error('Type action requires text')
      await page.fill(action.selector, action.text, { timeout: action.timeout ?? 10000 })
      return
    }

    case 'select': {
      if (!action.selector) throw new Error('Select action requires selector')
      if (typeof action.text !== 'string') throw new Error('Select action requires text')
      await page.selectOption(action.selector, { label: action.text }, { timeout: action.timeout ?? 10000 })
      return
    }

    case 'wait': {
      const timeoutMs = action.timeout ?? 10000
      
      // If selector provided, wait for element
      if (action.selector) {
        await page.waitForSelector(action.selector, { timeout: timeoutMs, state: 'visible' })
        return
      }
      
      // If URL pattern provided (in text field), wait for URL change
      if (action.text) {
        const urlPattern = action.text
        // Wait for URL to contain or not contain the pattern
        if (urlPattern.startsWith('!') || urlPattern.startsWith('not ')) {
          // Wait for URL to NOT contain this pattern (e.g., "!login" or "not /auth")
          const pattern = urlPattern.replace(/^(!|not\s+)/, '')
          await page.waitForURL((url) => !url.href.includes(pattern), { timeout: timeoutMs })
        } else {
          // Wait for URL to contain this pattern
          await page.waitForURL((url) => url.href.includes(urlPattern), { timeout: timeoutMs })
        }
        return
      }
      
      // Default: wait for network to be idle (navigation complete)
      await page.waitForLoadState('networkidle', { timeout: timeoutMs })
      return
    }

    case 'scroll': {
      if (action.selector) {
        await page.locator(action.selector).scrollIntoViewIfNeeded()
      } else {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      }
      return
    }

    case 'hover': {
      if (!action.selector) throw new Error('Hover action requires selector')
      await page.hover(action.selector, { timeout: action.timeout ?? 10000 })
      return
    }

    case 'assert': {
      await executeAssertAction(page, action)
      return
    }

    case 'screenshot': {
      // screenshot is captured separately by caller
      return
    }

    default:
      throw new Error(`Unknown action type: ${(action as any).action}`)
  }
}

export async function executeAssertAction(page: Page, action: PlaywrightAction): Promise<void> {
  const assertType = action.type ?? 'text'
  const timeoutMs = action.timeout ?? 10000

  switch (assertType) {
    case 'text': {
      if (!action.selector) throw new Error('Text assert requires selector')
      if (typeof action.expected !== 'string') throw new Error('Text assert requires expected')
      const el = await page.waitForSelector(action.selector, { timeout: timeoutMs })
      const txt = await el?.textContent()
      if (!txt?.includes(action.expected)) {
        throw new Error(`Expected text "${action.expected}" not found. Got: "${txt}"`)
      }
      return
    }

    case 'visible': {
      if (!action.selector) throw new Error('Visible assert requires selector')
      await page.waitForSelector(action.selector, { timeout: timeoutMs, state: 'visible' })
      return
    }

    case 'hidden': {
      if (!action.selector) throw new Error('Hidden assert requires selector')
      await page.waitForSelector(action.selector, { timeout: timeoutMs, state: 'hidden' })
      return
    }

    case 'url': {
      if (typeof action.expected !== 'string') throw new Error('URL assert requires expected')
      const current = page.url()
      if (!current.includes(action.expected)) {
        throw new Error(`Expected URL to contain "${action.expected}". Got: "${current}"`)
      }
      return
    }

    case 'title': {
      if (typeof action.expected !== 'string') throw new Error('Title assert requires expected')
      const title = await page.title()
      if (!title.includes(action.expected)) {
        throw new Error(`Expected title to contain "${action.expected}". Got: "${title}"`)
      }
      return
    }

    default:
      throw new Error(`Unknown assert type: ${assertType}`)
  }
}

export async function captureScreenshot(
  adapters: CoreAdapters,
  page: Page,
  runId: string,
  stepIndex: number,
  label: string,
): Promise<ActionExecutorScreenshotResult | null> {
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

export function shouldAutoScreenshot(action: PlaywrightAction): boolean {
  return ['navigate', 'assert', 'click'].includes(action.action)
}

export function createTimeoutRace(ms: number, message: string): Promise<never> & { clear: () => void } {
  let timer: NodeJS.Timeout
  const p = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  }) as Promise<never> & { clear: () => void }

  p.clear = () => clearTimeout(timer)
  return p
}

export async function executeInstrumentedAction(params: {
  page: Page
  action: PlaywrightAction
  adapters: CoreAdapters
  runId: string
  stepIndex: number
  stepTimeout?: number
  totalSteps?: number
}): Promise<ActionResult> {
  const { page, action, adapters, runId, stepIndex, stepTimeout = 30000, totalSteps } = params

  const started = Date.now()
  const step: TestStep = {
    index: stepIndex,
    action: action.action,
    description: action.description,
    status: 'skipped',
    durationMs: 0,
  }

  adapters.events.emit({
    type: 'step',
    timestamp: Date.now(),
    data: { phase: 'started', runId, stepIndex, totalSteps: totalSteps ?? null, description: action.description, action: action.action },
  })

  let screenshot: ActionExecutorScreenshotResult | undefined

  try {
    const race = createTimeoutRace(stepTimeout, `Step ${stepIndex + 1} timed out after ${stepTimeout}ms`)
    try {
      await Promise.race([executeSingleAction(page, action), race])
    } finally {
      race.clear()
    }

    step.status = 'success'
    step.durationMs = Date.now() - started

    if (action.action === 'screenshot' || shouldAutoScreenshot(action)) {
      const s = await captureScreenshot(adapters, page, runId, stepIndex, action.description)
      if (s) {
        screenshot = s
        step.screenshotUrl = s.url
        adapters.events.emit({
          type: 'screenshot',
          timestamp: Date.now(),
          data: { runId, stepIndex, screenshotUrl: s.url, label: s.label ?? null },
        })
      }
    }
  } catch (err) {
    step.status = 'failed'
    step.durationMs = Date.now() - started
    step.errorMessage = err instanceof Error ? err.message : String(err)

    const s = await captureScreenshot(adapters, page, runId, stepIndex, `Failure: ${action.description}`)
    if (s) {
      screenshot = s
      step.screenshotUrl = s.url
      adapters.events.emit({
        type: 'screenshot',
        timestamp: Date.now(),
        data: { runId, stepIndex, screenshotUrl: s.url, label: s.label ?? null },
      })
    }
  }

  adapters.events.emit({
    type: 'step',
    timestamp: Date.now(),
    data: { phase: 'completed', runId, stepIndex, step },
  })

  return { step, screenshot }
}
