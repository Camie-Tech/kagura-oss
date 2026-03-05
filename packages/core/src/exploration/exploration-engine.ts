/**
 * Exploration Engine (OSS)
 *
 * Adapter-driven autonomous exploration that maps pages/links/forms without asserting.
 * Cloud keeps DB/event streaming; OSS owns the exploration loop.
 */

import { chromium } from 'playwright'
import type { CoreAdapters } from '../adapters.js'
import { extractPageAnalysis, summarizePageAnalysis, type PageAnalysis } from '../dom-extractor.js'
import { normalizeProviderError, type DeploymentMode } from '../providers/provider-errors.js'
import { touchState, createEmptyState, type AgentExecutionState } from '../state.js'
import { captureScreenshot, executeSingleAction } from '../agent/action-executor.js'
import type { ExplorationConfig, ExplorationSiteMap } from '../types.js'

function toJson<T>(value: T): any {
  return JSON.parse(JSON.stringify(value))
}

type ExplorerAction =
  | { action: 'navigate'; url: string; description: string }
  | { action: 'click'; selector: string; description: string }
  | { action: 'type'; selector: string; text: string; description: string }
  | { action: 'scroll'; selector?: string; description: string }
  | { action: 'wait'; selector?: string; description: string }
  | { action: 'back'; description: string }
  | { action: 'ask_user'; message: string; description: string }
  | { action: 'done'; description: string; reason?: string }

const DEFAULT_CONFIG: ExplorationConfig = {
  maxPages: 50,
  maxDepth: 5,
  timeout: 5 * 60 * 1000,
  suggestedTestCount: 10,
  autoRun: false,
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? Math.round(value) : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

export function normalizeExplorationConfig(config?: Partial<ExplorationConfig> | null): ExplorationConfig {
  return {
    maxPages: clampInt(config?.maxPages, DEFAULT_CONFIG.maxPages, 1, 200),
    maxDepth: clampInt(config?.maxDepth, DEFAULT_CONFIG.maxDepth, 0, 20),
    timeout: clampInt(config?.timeout, DEFAULT_CONFIG.timeout, 10_000, 60 * 60 * 1000),
    suggestedTestCount: clampInt(config?.suggestedTestCount, DEFAULT_CONFIG.suggestedTestCount, 1, 25),
    autoRun: Boolean((config as any)?.autoRun ?? DEFAULT_CONFIG.autoRun),
  }
}

function pageKey(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString()
  } catch {
    return url
  }
}

function sameOriginUrl(raw: string, origin: string): string | null {
  try {
    const u = new URL(raw)
    if (u.origin !== origin) return null
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

function parseExplorerAction(text: string): ExplorerAction | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== 'object') return null
    const action = String((parsed as any).action || '').trim()

    if (action === 'navigate' && typeof (parsed as any).url === 'string') {
      return { action: 'navigate', url: (parsed as any).url, description: String((parsed as any).description || 'Navigate') }
    }
    if (action === 'click' && typeof (parsed as any).selector === 'string') {
      return { action: 'click', selector: (parsed as any).selector, description: String((parsed as any).description || 'Click') }
    }
    if (action === 'type' && typeof (parsed as any).selector === 'string') {
      return {
        action: 'type',
        selector: (parsed as any).selector,
        text: String((parsed as any).text || ''),
        description: String((parsed as any).description || 'Type'),
      }
    }
    if (action === 'scroll') {
      return {
        action: 'scroll',
        selector: typeof (parsed as any).selector === 'string' ? (parsed as any).selector : undefined,
        description: String((parsed as any).description || 'Scroll'),
      }
    }
    if (action === 'wait') {
      return {
        action: 'wait',
        selector: typeof (parsed as any).selector === 'string' ? (parsed as any).selector : undefined,
        description: String((parsed as any).description || 'Wait'),
      }
    }
    if (action === 'back') {
      return { action: 'back', description: String((parsed as any).description || 'Back') }
    }
    if (action === 'ask_user' && typeof (parsed as any).message === 'string') {
      return { action: 'ask_user', message: (parsed as any).message, description: String((parsed as any).description || 'Ask user') }
    }
    if (action === 'done') {
      return {
        action: 'done',
        description: String((parsed as any).description || 'Done'),
        reason: typeof (parsed as any).reason === 'string' ? (parsed as any).reason : undefined,
      }
    }

    return null
  } catch {
    return null
  }
}

function buildSystemPrompt(args: { instructions?: string | null; credentialValues?: Record<string, string> | null }): string {
  const lines: string[] = [
    'You are a QA explorer. Autonomously explore the web app. Discover pages, forms, buttons, interactive elements. Map user flows. Note what each page does. Take screenshots of significant pages.',
    'Do NOT test assertions. Avoid logout/delete/destructive actions.',
    'Respond with ONLY one JSON action object per turn.',
    '',
    'If you encounter a login/signup page and credentials are available, log in and continue exploring.',
    'If you encounter an auth wall with no credentials available, use ask_user to request credentials.',
  ]

  if (args.instructions?.trim()) {
    lines.push('', `User instructions: ${args.instructions.trim()}`)
  }

  if (args.credentialValues && Object.keys(args.credentialValues).length > 0) {
    // NOTE: Cloud must redact secrets in UI logs; this is only for the model.
    lines.push('', 'Credentials are available. Use them if login is required:', JSON.stringify(args.credentialValues))
  }

  lines.push(
    '',
    'Allowed actions:',
    '- navigate {"action":"navigate","url":"...","description":"..."}',
    '- click {"action":"click","selector":"...","description":"..."}',
    '- type {"action":"type","selector":"...","text":"...","description":"..."}',
    '- scroll {"action":"scroll","selector?":"...","description":"..."}',
    '- wait {"action":"wait","selector?":"...","description":"..."}',
    '- back {"action":"back","description":"..."}',
    '- ask_user {"action":"ask_user","message":"...","description":"..."}',
    '- done {"action":"done","description":"...","reason":"..."}',
  )

  return lines.join('\n')
}

function buildTurnContext(args: {
  targetUrl: string
  origin: string
  turn: number
  depth: number
  config: ExplorationConfig
  siteMap: ExplorationSiteMap
  analysis: PageAnalysis
  domSummary: string
  recentActions: string[]
}): string {
  const visited = args.siteMap.pages.map((p) => `${p.depth}:${p.url}`).slice(-20)
  const recent = args.recentActions.slice(-10)

  return [
    `Target URL: ${args.targetUrl}`,
    `Turn: ${args.turn}`,
    `Depth: ${args.depth}/${args.config.maxDepth}`,
    `Visited pages: ${args.siteMap.pages.length}/${args.config.maxPages}`,
    `Origin: ${args.origin}`,
    '',
    `Current URL: ${args.analysis.url}`,
    `Title: ${args.analysis.title}`,
    '',
    'DOM summary:',
    args.domSummary,
    '',
    `Recent actions: ${recent.length ? recent.join(' | ') : '(none)'}`,
    `Visited (recent): ${visited.length ? visited.join(' | ') : '(none)'}`,
    '',
    'Pick the next best exploration action. Prefer new internal links or navigation.',
  ].join('\n')
}

function emptySiteMap(): ExplorationSiteMap {
  return { pages: [], links: [], forms: [], flows: [{ name: 'Autonomous exploration path', steps: [] }] }
}

function recordAnalysis(siteMap: ExplorationSiteMap, analysis: PageAnalysis, depth: number) {
  const url = pageKey(analysis.url)

  if (!siteMap.pages.some((p) => p.url === url)) {
    siteMap.pages.push({ url, title: analysis.title, depth, discoveredAt: Date.now() })
  }

  for (const link of analysis.links || []) {
    const toUrl = pageKey(link.href)
    if (!siteMap.links.some((l) => l.from === url && l.to === toUrl)) {
      siteMap.links.push({ from: url, to: toUrl, text: link.text })
    }
  }

  for (const f of analysis.forms || []) {
    const inputs = (f.inputs || [])
      .map((inp) => inp.label || inp.name || inp.placeholder)
      .filter(Boolean)
      .slice(0, 10)

    siteMap.forms.push({
      url,
      action: f.action,
      method: f.method,
      inputs,
    })
  }
}

export async function runExploration(params: {
  adapters: CoreAdapters
  runId: string
  targetUrl: string
  userId: string | null
  instructions?: string | null
  config?: Partial<ExplorationConfig> | null
  deploymentMode?: DeploymentMode
}): Promise<{
  status: 'completed' | 'paused' | 'failed'
  siteMap: ExplorationSiteMap
  steps: string[]
  state: AgentExecutionState
  errorMessage?: string
}> {
  const { adapters, runId, targetUrl, userId } = params
  const config = normalizeExplorationConfig(params.config)
  const deploymentMode = params.deploymentMode ?? 'cloud'

  let state: AgentExecutionState = createEmptyState({ runId, initialUrl: targetUrl })
  const loaded = await adapters.state.load(runId).catch(() => null)
  if (loaded) state = loaded

  const siteMap = emptySiteMap()
  const steps: string[] = []

  const origin = new URL(targetUrl).origin
  const start = Date.now()

  adapters.events.emit({ type: 'status', timestamp: Date.now(), data: { phase: 'exploration_started', runId, targetUrl } })

  // Load credentials (optional)
  const creds = await adapters.credentials.getForUrl(userId, targetUrl).catch(() => [])
  const credentialValues = creds[0]?.values || null

  const system = buildSystemPrompt({ instructions: params.instructions, credentialValues })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
      page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    )

    // initial screenshot
    await captureScreenshot(adapters, page, runId, -1, 'Exploration start')

    let depth = 0

    while (Date.now() - start < config.timeout) {
      if (adapters.interaction.isAborted()) {
        adapters.events.emit({ type: 'pause', timestamp: Date.now(), data: { runId, reason: 'aborted', message: 'Aborted' } })
        state = touchState({ ...state, currentUrl: page.url(), metadata: { ...(state.metadata || {}), exploration: toJson({ siteMap, steps }) } })
        await adapters.state.save(runId, state)
        return { status: 'paused', siteMap, steps, state, errorMessage: 'Aborted' }
      }

      const analysis = await extractPageAnalysis(page)
      const domSummary = summarizePageAnalysis(analysis)

      recordAnalysis(siteMap, analysis, depth)

      state = touchState({
        ...state,
        currentUrl: page.url(),
        metadata: { ...(state.metadata || {}), exploration: toJson({ siteMap, steps, depth }) },
      })
      await adapters.state.save(runId, state)

      if (siteMap.pages.length >= config.maxPages) break
      if (depth > config.maxDepth) break

      const prompt = buildTurnContext({
        targetUrl,
        origin,
        turn: steps.length,
        depth,
        config,
        siteMap,
        analysis,
        domSummary,
        recentActions: steps,
      })

      const aiText = await adapters.ai.completeText({ system, prompt, maxTokens: 512, temperature: 0.2 }, userId)
      const action = parseExplorerAction(aiText)

      if (!action) {
        steps.push('AI returned invalid JSON, stopping')
        break
      }

      if (action.action === 'done') {
        steps.push(`DONE: ${action.description}${action.reason ? ` (${action.reason})` : ''}`)
        break
      }

      if (action.action === 'ask_user') {
        // If credentials are missing, pause.
        if (!credentialValues) {
          adapters.events.emit({ type: 'pause', timestamp: Date.now(), data: { runId, reason: 'needs_user_input', message: action.message } })
          state = touchState({
            ...state,
            metadata: { ...(state.metadata || {}), paused: { reason: 'needs_user_input', message: action.message }, exploration: toJson({ siteMap, steps, depth }) },
          })
          await adapters.state.save(runId, state)
          return { status: 'paused', siteMap, steps, state, errorMessage: action.message }
        }

        const reply = await adapters.interaction.askUser(action.message)
        steps.push(`ASK_USER: ${action.message} => ${reply}`)
        continue
      }

      if (action.action === 'back') {
        steps.push(`BACK: ${action.description}`)
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
        depth = Math.max(0, depth - 1)
        continue
      }

      if (action.action === 'navigate') {
        const next = sameOriginUrl(action.url, origin)
        if (!next) {
          steps.push(`SKIP external navigation: ${action.url}`)
          continue
        }
        steps.push(`NAVIGATE: ${next}`)
        await executeSingleAction(page, { action: 'navigate', url: next, description: action.description } as any)
        depth += 1
        await captureScreenshot(adapters, page, runId, steps.length, `Explored: ${next}`)
        continue
      }

      if (action.action === 'click') {
        steps.push(`CLICK: ${action.description}`)
        await executeSingleAction(page, { action: 'click', selector: action.selector, description: action.description } as any)
        await captureScreenshot(adapters, page, runId, steps.length, `After click: ${action.description}`)
        continue
      }

      if (action.action === 'type') {
        steps.push(`TYPE: ${action.description}`)
        await executeSingleAction(page, { action: 'type', selector: action.selector, text: action.text, description: action.description } as any)
        continue
      }

      if (action.action === 'scroll') {
        steps.push(`SCROLL: ${action.description}`)
        await executeSingleAction(page, { action: 'scroll', selector: action.selector, description: action.description } as any)
        continue
      }

      if (action.action === 'wait') {
        steps.push(`WAIT: ${action.description}`)
        if (action.selector) {
          await page.waitForSelector(action.selector, { timeout: 15000, state: 'visible' }).catch(() => {})
        } else {
          await page.waitForTimeout(1000)
        }
        continue
      }
    }

    adapters.events.emit({ type: 'completed', timestamp: Date.now(), data: { runId, status: 'completed', pages: siteMap.pages.length } })
    state = touchState({ ...state, currentUrl: page.url(), metadata: { ...(state.metadata || {}), exploration: toJson({ siteMap, steps }) } })
    await adapters.state.save(runId, state)

    return { status: 'completed', siteMap, steps, state }
  } catch (err) {
    const normalized = normalizeProviderError(err, { deploymentMode })
    adapters.events.emit({ type: 'error', timestamp: Date.now(), data: { runId, message: normalized.message } })
    state = touchState({ ...state, currentUrl: page.url(), metadata: { ...(state.metadata || {}), exploration: toJson({ siteMap, steps }) } })
    await adapters.state.save(runId, state)
    return { status: 'failed', siteMap, steps, state, errorMessage: normalized.message }
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}
