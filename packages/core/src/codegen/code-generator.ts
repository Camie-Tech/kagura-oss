/**
 * Code Generator — Generate Playwright test code from action plans/steps
 *
 * Pure code generation with no side effects.
 * Used for "Export to Code" feature.
 */

import type { PlaywrightAction } from '../ai/ai-parser.js'
import type { TestStep } from '../types.js'

export interface CodeGenOptions {
  testName?: string
  baseUrl?: string
  includeComments?: boolean
  timeout?: number
}

/**
 * Generates a Playwright test file from an array of actions.
 */
export function generateTestCode(actions: PlaywrightAction[], options: CodeGenOptions = {}): string {
  const {
    testName = 'Generated Test',
    baseUrl,
    includeComments = true,
    timeout = 30000,
  } = options

  const lines: string[] = []

  lines.push("import { test, expect } from '@playwright/test';")
  lines.push('')
  lines.push(`test('${escapeString(testName)}', async ({ page }) => {`)
  lines.push(`  test.setTimeout(${timeout});`)
  lines.push('')

  for (const action of actions) {
    if (includeComments && action.description) {
      lines.push(`  // ${action.description}`)
    }

    const code = actionToCode(action, baseUrl)
    if (code) {
      lines.push(`  ${code}`)
      lines.push('')
    }
  }

  lines.push('});')
  lines.push('')

  return lines.join('\n')
}

/**
 * Generates Playwright test code from executed test steps.
 * Uses step data (which includes actual results) rather than planned actions.
 */
export function generateTestCodeFromSteps(steps: TestStep[], options: CodeGenOptions = {}): string {
  const {
    testName = 'Generated Test',
    timeout = 30000,
  } = options

  const lines: string[] = []

  lines.push("import { test, expect } from '@playwright/test';")
  lines.push('')
  lines.push(`test('${escapeString(testName)}', async ({ page }) => {`)
  lines.push(`  test.setTimeout(${timeout});`)
  lines.push('')

  for (const step of steps) {
    if (step.status === 'skipped') continue

    lines.push(`  // Step ${step.index + 1}: ${step.description}`)
    const code = stepActionToCode(step.action, step.description)
    if (code) {
      lines.push(`  ${code}`)
      lines.push('')
    }
  }

  lines.push('});')
  lines.push('')

  return lines.join('\n')
}

function actionToCode(action: PlaywrightAction, baseUrl?: string): string | null {
  switch (action.action) {
    case 'navigate': {
      const url = baseUrl && action.url?.startsWith(baseUrl)
        ? action.url.slice(baseUrl.length) || '/'
        : action.url || '/'
      return `await page.goto('${escapeString(url)}');`
    }

    case 'click':
      if (!action.selector) return null
      return `await page.locator('${escapeString(action.selector)}').click();`

    case 'type':
      if (!action.selector || !action.text) return null
      return `await page.locator('${escapeString(action.selector)}').fill('${escapeString(action.text)}');`

    case 'hover':
      if (!action.selector) return null
      return `await page.locator('${escapeString(action.selector)}').hover();`

    case 'select':
      if (!action.selector) return null
      return `await page.locator('${escapeString(action.selector)}').selectOption('${escapeString(action.text || '')}');`

    case 'scroll':
      if (action.selector) {
        return `await page.locator('${escapeString(action.selector)}').scrollIntoViewIfNeeded();`
      }
      return `await page.evaluate(() => window.scrollBy(0, 500));`

    case 'wait':
      if (action.selector) {
        return `await page.locator('${escapeString(action.selector)}').waitFor({ timeout: ${action.timeout || 5000} });`
      }
      return `await page.waitForTimeout(${action.timeout || 1000});`

    case 'assert':
      return generateAssertCode(action)

    case 'screenshot':
      return `await page.screenshot({ fullPage: true });`

    default:
      return null
  }
}

function generateAssertCode(action: PlaywrightAction): string | null {
  switch (action.type) {
    case 'text':
      if (action.selector) {
        return `await expect(page.locator('${escapeString(action.selector)}')).toContainText('${escapeString(action.expected || '')}');`
      }
      return `await expect(page.locator('body')).toContainText('${escapeString(action.expected || '')}');`

    case 'visible':
      if (!action.selector) return null
      return `await expect(page.locator('${escapeString(action.selector)}')).toBeVisible();`

    case 'hidden':
      if (!action.selector) return null
      return `await expect(page.locator('${escapeString(action.selector)}')).toBeHidden();`

    case 'url':
      return `await expect(page).toHaveURL(/${escapeRegex(action.expected || '')}/);`

    case 'title':
      return `await expect(page).toHaveTitle(/${escapeRegex(action.expected || '')}/);`

    default:
      if (action.expected && action.selector) {
        return `await expect(page.locator('${escapeString(action.selector)}')).toContainText('${escapeString(action.expected)}');`
      }
      return null
  }
}

function stepActionToCode(action: string, description: string): string | null {
  const lower = action.toLowerCase()

  if (lower === 'navigate' || lower.startsWith('navigate')) {
    const urlMatch = description.match(/(?:to|url:?)\s+(https?:\/\/\S+)/i)
    const url = urlMatch ? urlMatch[1] : '/'
    return `await page.goto('${escapeString(url)}');`
  }

  if (lower === 'click') {
    return `// ${description}\n  // TODO: Add appropriate selector`
  }

  if (lower === 'type') {
    return `// ${description}\n  // TODO: Add appropriate selector and text`
  }

  if (lower === 'screenshot') {
    return `await page.screenshot({ fullPage: true });`
  }

  if (lower === 'assert') {
    return `// Assertion: ${description}\n  // TODO: Add appropriate assertion`
  }

  return `// ${action}: ${description}`
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
