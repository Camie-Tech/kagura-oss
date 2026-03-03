/**
 * AI/LLM Parser
 * Converts natural language test descriptions into Playwright action plans.
 *
 * OSS-safe design:
 * - No provider SDK imports.
 * - No environment variable reads.
 * - Uses CoreAdapters.ai.completeText().
 */

import type { CoreAdapters } from '../adapters'
import type { PageAnalysis } from '../dom-extractor'
import { summarizePageAnalysis } from '../dom-extractor'

export interface PlaywrightAction {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'assert' | 'screenshot' | 'scroll' | 'hover' | 'select'
  url?: string
  selector?: string
  text?: string
  expected?: string
  type?: 'text' | 'visible' | 'hidden' | 'url' | 'title'
  timeout?: number
  description: string
  expected_state?: string
}

export interface ParseResult {
  success: boolean
  actions: PlaywrightAction[]
  error?: string
}

const SYSTEM_PROMPT = `You are a QA test automation expert. Convert natural language test descriptions into a JSON array of Playwright actions.

IMPORTANT RULES:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Use semantic selectors when possible (aria labels, data-testid, text content, placeholders)
3. For buttons/links, prefer text-based selectors like button:has-text("Login") or [role="button"]:has-text("Submit")
4. For inputs, use placeholder, name, or label associations
5. Always include a descriptive "description" field for each action
6. Add a screenshot action after important steps (navigation, form submission, verification)
7. Use reasonable timeouts (default 5000ms for waits)

Available actions:
- navigate: Go to a URL { "action": "navigate", "url": "...", "description": "..." }
- click: Click an element { "action": "click", "selector": "...", "description": "..." }
- type: Type into an input { "action": "type", "selector": "...", "text": "...", "description": "..." }
- wait: Wait for element { "action": "wait", "selector": "...", "timeout": 5000, "description": "..." }
- assert: Verify something { "action": "assert", "type": "text|visible|hidden|url|title", "selector": "...", "expected": "...", "description": "..." }
- screenshot: Take screenshot { "action": "screenshot", "description": "..." }
- scroll: Scroll page { "action": "scroll", "selector": "...", "description": "..." }
- hover: Hover over element { "action": "hover", "selector": "...", "description": "..." }
- select: Select dropdown option { "action": "select", "selector": "...", "text": "...", "description": "..." }

Example selectors:
- button:has-text("Login")
- input[placeholder="Email"]
- [data-testid="submit-btn"]
- #username
- .login-form
- text=Welcome back
- [role="textbox"][name="email"]`

const USER_PROMPT_TEMPLATE = `Convert this test description into Playwright actions:

Target URL: {targetUrl}

Test Description:
{description}

Return ONLY a JSON array of actions. Example format:
[
  { "action": "navigate", "url": "https://example.com", "description": "Go to homepage" },
  { "action": "click", "selector": "button:has-text(\\"Login\\")", "description": "Click login button" }
]`

const AGENTIC_SYSTEM_PROMPT = `You are a QA test automation expert. You are given the ACTUAL page state (DOM analysis) of a website and a test description. Generate a precise JSON array of Playwright actions based on what you can actually see on the page.

CRITICAL RULES:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Use the DOM analysis to pick EXACT selectors that exist on the page
3. For inputs, use the actual name, placeholder, or label from the DOM analysis
4. For buttons, use the actual text from the DOM analysis
5. Include an "expected_state" for each action — what the page should look like after this action
6. Add screenshot actions after important steps
7. If the page has a modal open, deal with it first
8. If you detect the page uses a non-standard auth flow (magic link, SSO, OAuth), note it

Available actions:
- navigate: { "action": "navigate", "url": "...", "description": "...", "expected_state": "..." }
- click: { "action": "click", "selector": "...", "description": "...", "expected_state": "..." }
- type: { "action": "type", "selector": "...", "text": "...", "description": "...", "expected_state": "..." }
- wait: { "action": "wait", "selector": "...", "timeout": 5000, "description": "...", "expected_state": "..." }
- assert: { "action": "assert", "type": "text|visible|hidden|url|title", "selector": "...", "expected": "...", "description": "...", "expected_state": "..." }
- screenshot: { "action": "screenshot", "description": "...", "expected_state": "..." }
- scroll: { "action": "scroll", "selector": "...", "description": "...", "expected_state": "..." }
- hover: { "action": "hover", "selector": "...", "description": "...", "expected_state": "..." }
- select: { "action": "select", "selector": "...", "text": "...", "description": "...", "expected_state": "..." }`

function unwrapJson(text: string): string {
  let jsonText = text.trim()
  const codeBlock = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1].trim()
  return jsonText
}

function ensureNavigateFirst(actions: PlaywrightAction[], targetUrl: string, expectedState?: string) {
  if (actions.length === 0 || actions[0].action !== 'navigate') {
    actions.unshift({
      action: 'navigate',
      url: targetUrl,
      description: `Navigate to ${targetUrl}`,
      ...(expectedState ? { expected_state: expectedState } : {}),
    })
  }
}

function validateActions(actions: PlaywrightAction[]): string | null {
  if (!Array.isArray(actions)) return 'AI response is not an array of actions'
  for (const action of actions) {
    if (!action.action || !action.description) {
      return `Invalid action format: ${JSON.stringify(action)}`
    }
  }
  return null
}

export async function parseNaturalLanguageTest(params: {
  adapters: CoreAdapters
  description: string
  targetUrl: string
  userId?: string | null
  model?: string
}): Promise<ParseResult> {
  const { adapters, description, targetUrl, userId, model } = params

  try {
    const userPrompt = USER_PROMPT_TEMPLATE.replace('{targetUrl}', targetUrl).replace('{description}', description)

    const text = await adapters.ai.completeText(
      {
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        model: model || 'claude-sonnet-4-20250514',
        maxTokens: 2048,
        temperature: 0.2,
      },
      userId ?? null
    )

    const actions: PlaywrightAction[] = JSON.parse(unwrapJson(text))

    const err = validateActions(actions)
    if (err) return { success: false, actions: [], error: err }

    ensureNavigateFirst(actions, targetUrl)

    return { success: true, actions }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error parsing test'
    return { success: false, actions: [], error: errorMessage }
  }
}

export async function parseWithPageAnalysis(params: {
  adapters: CoreAdapters
  description: string
  targetUrl: string
  pageAnalysis: PageAnalysis
  screenshotDescription?: string
  userId?: string | null
  model?: string
}): Promise<ParseResult> {
  const { adapters, description, targetUrl, pageAnalysis, screenshotDescription, userId, model } = params

  try {
    const pageSummary = summarizePageAnalysis(pageAnalysis)

    let userPrompt = `Generate a precise Playwright action plan for this test.\n\nTarget URL: ${targetUrl}\n\nACTUAL PAGE STATE (DOM analysis):\n${pageSummary}\n`

    if (screenshotDescription) {
      userPrompt += `\nSCREENSHOT DESCRIPTION:\n${screenshotDescription}\n`
    }

    userPrompt += `\nTest Description:\n${description}\n\nBased on what you can ACTUALLY SEE on the page, generate the most accurate action plan possible.\nReturn ONLY a JSON array of actions.`

    const text = await adapters.ai.completeText(
      {
        system: AGENTIC_SYSTEM_PROMPT,
        prompt: userPrompt,
        model: model || 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        temperature: 0.2,
      },
      userId ?? null
    )

    const actions: PlaywrightAction[] = JSON.parse(unwrapJson(text))

    const err = validateActions(actions)
    if (err) return { success: false, actions: [], error: err }

    ensureNavigateFirst(actions, targetUrl, `Page loads at ${targetUrl}`)

    return { success: true, actions }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error parsing test'
    return { success: false, actions: [], error: errorMessage }
  }
}
