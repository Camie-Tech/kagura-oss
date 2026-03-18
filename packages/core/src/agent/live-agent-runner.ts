/**
 * Live Agent Loop Runner (OSS)
 *
 * This is the "true agent loop" execution model:
 * - Take screenshot + DOM summary each turn
 * - Ask AI for ONE next action (JSON)
 * - Execute action
 * - Repeat until done/stuck/pause
 *
 * Adapter-only: no DB, no Stripe, no cloud imports.
 */

import type { CoreAdapters } from '../adapters.js'
import { extractPageAnalysis, summarizePageAnalysis } from '../dom-extractor.js'
import { normalizeProviderError, type DeploymentMode } from '../providers/provider-errors.js'
import { touchState, createEmptyState, type AgentExecutionState } from '../state.js'
import type { PlaywrightAction } from '../ai/ai-parser.js'
import type { TestStep } from '../types.js'
import {
  launchBrowser,
  executeInstrumentedAction,
  captureScreenshot,
  type ActionExecutorBrowserType,
} from './action-executor.js'

export type LiveAgentRunStatus = 'completed' | 'failed' | 'paused'

export type LiveAgentRunResult = {
  runId: string
  status: LiveAgentRunStatus
  steps: TestStep[]
  state: AgentExecutionState
  summary: {
    passedSteps: number
    failedSteps: number
    totalSteps: number
  }
  paused?: {
    reason: 'missing_credentials' | 'needs_user_input' | 'aborted'
    message: string
  }
  aiSummary?: string
  errorMessage?: string
}

export type LiveAgentRunnerConfig = {
  deploymentMode?: DeploymentMode
  browserType?: ActionExecutorBrowserType
  headless?: boolean
  maxTurns?: number
  actionTimeoutMs?: number
  conversationWindowSize?: number
}

const DEFAULT_MAX_TURNS = 100

type ConversationTurn = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function windowedTurns(turns: ConversationTurn[], windowSize: number): ConversationTurn[] {
  if (turns.length <= windowSize * 2 + 1) return turns
  const first = turns[0]
  const recent = turns.slice(-(windowSize * 2))
  return [first, ...recent]
}

export function parseAgentActionJson(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    // try to salvage if model included extra text
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export function isCredentialQuestion(message: string): boolean {
  const lower = message.toLowerCase()
  const keywords = ['email', 'password', 'username', 'login', 'sign in', 'sign-in', 'credentials', 'account', 'authenticate', 'log in']
  return keywords.some((k) => lower.includes(k))
}

export function formatCredentialsForAgent(values: Record<string, string>): string {
  // WARNING: caller must ensure this never gets logged to a public UI.
  // Core emits only to AI prompt here; Cloud must redact in events.
  const lines = Object.entries(values).map(([k, v]) => `${k}: ${v}`)
  return `Here are the credentials to use:\n${lines.join('\n')}`
}

function systemPrompt(adapters: CoreAdapters): string {
  let base = `You are a QA testing agent controlling a browser via Playwright. You see a screenshot and a DOM summary each turn.

Return EXACTLY one JSON object per turn (no markdown).

Actions:
- {"action":"navigate","url":"...","description":"..."}
- {"action":"click","selector":"...","description":"..."}
- {"action":"type","selector":"...","text":"...","description":"..."}
- {"action":"select","selector":"...","text":"...","description":"..."}
- {"action":"wait","selector":"...","description":"..."}
- {"action":"scroll","selector":"...","description":"..."}
- {"action":"hover","selector":"...","description":"..."}
- {"action":"assert","type":"text|visible|hidden|url|title","selector":"...","expected":"...","description":"..."}
- {"action":"screenshot","description":"..."}
- {"action":"done","summary":"..."}
- {"action":"stuck","reason":"...","description":"..."}
- {"action":"ask_user","message":"...","description":"..."}
- {"action":"use_skill","skill":"<skill_name>","skillAction":"<action_name>","input":{...},"description":"..."}

Rules:
- If you need credentials or external input (OTP/magic link), use ask_user.
- If an action fails, try a different selector/strategy.
- Be concise but descriptive in description.
- If a skill is available (e.g., email), use use_skill to invoke it instead of ask_user for things the skill can handle (e.g., reading verification emails, extracting OTPs).`

  // Inject skill prompts so the agent knows what capabilities are available
  if (adapters.skills) {
    const skillPrompts = adapters.skills.getSkillPrompts()
    if (skillPrompts) {
      base += skillPrompts
    }
  }

  return base
}

export async function runLiveAgenticTest(params: {
  adapters: CoreAdapters
  runId: string
  targetUrl: string
  description: string
  userId?: string | null
  config?: LiveAgentRunnerConfig
}): Promise<LiveAgentRunResult> {
  const { adapters, runId, targetUrl, description, userId } = params
  const cfg = params.config ?? {}

  const deploymentMode = cfg.deploymentMode ?? 'cloud'
  const browserType = cfg.browserType ?? 'chromium'
  const headless = cfg.headless ?? true
  const maxTurns = cfg.maxTurns ?? DEFAULT_MAX_TURNS
  const actionTimeoutMs = cfg.actionTimeoutMs ?? 30000
  const conversationWindowSize = cfg.conversationWindowSize ?? 5

  adapters.events.emit({
    type: 'status',
    timestamp: Date.now(),
    data: { phase: 'started', runId, targetUrl },
  })

  let state: AgentExecutionState = createEmptyState({ runId, initialUrl: targetUrl })
  const loaded = await adapters.state.load(runId).catch(() => null)
  if (loaded) state = loaded
  state = touchState({ ...state, currentUrl: state.currentUrl || targetUrl })
  await adapters.state.save(runId, state)

  // Credentials gating (pause if missing)
  const creds = await adapters.credentials.getForUrl(userId ?? null, targetUrl).catch(() => [])
  if (!creds || creds.length === 0) {
    const message = `Missing credentials for ${targetUrl}. Provide credentials to continue.`
    adapters.events.emit({ type: 'pause', timestamp: Date.now(), data: { runId, reason: 'missing_credentials', message } })
    state = touchState({
      ...state,
      metadata: { ...(state.metadata || {}), paused: { reason: 'missing_credentials', targetUrl } },
    })
    await adapters.state.save(runId, state)
    return {
      runId,
      status: 'paused',
      steps: [],
      state,
      summary: { totalSteps: 0, passedSteps: 0, failedSteps: 0 },
      paused: { reason: 'missing_credentials', message },
    }
  }

  // Browser lifecycle
  const browser = await launchBrowser(browserType, headless)
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  const steps: TestStep[] = []
  const turns: ConversationTurn[] = []

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(() =>
      page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    )

    // initial screenshot
    const initialShot = await captureScreenshot(adapters, page, runId, -1, 'Initial page')
    if (initialShot) {
      adapters.events.emit({
        type: 'screenshot',
        timestamp: Date.now(),
        data: { runId, stepIndex: -1, screenshotUrl: initialShot.url, label: initialShot.label ?? null },
      })
    }

    turns.push({ role: 'system', content: systemPrompt(adapters) })
    turns.push({
      role: 'user',
      content: `You are at ${targetUrl}. Test goal: "${description}". Start with one action.`,
    })

    let aiSummary = ''
    let errorMessage: string | undefined

    for (let turn = 0; turn < maxTurns; turn++) {
      if (adapters.interaction.isAborted()) {
        const message = 'Run aborted by user'
        adapters.events.emit({ type: 'pause', timestamp: Date.now(), data: { runId, reason: 'aborted', message } })
        return {
          runId,
          status: 'paused',
          steps,
          state,
          summary: summarizeSteps(steps),
          paused: { reason: 'aborted', message },
        }
      }

      // Analyze current page DOM summary
      const analysis = await extractPageAnalysis(page)
      const domSummary = summarizePageAnalysis(analysis)

      // Ask AI for next action
      const promptTurns = windowedTurns(turns, conversationWindowSize)
      const prompt = promptTurns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n\n') + `\n\nDOM Summary:\n${domSummary}`

      const aiText = await adapters.ai.completeText(
        {
          system: systemPrompt(adapters),
          prompt,
          maxTokens: 1024,
          temperature: 0.2,
        },
        userId ?? null,
      )

      turns.push({ role: 'assistant', content: aiText })

      let actionObj = parseAgentActionJson(aiText)
      if (!actionObj) {
        // retry once
        const retry = await adapters.ai.completeText(
          {
            system: systemPrompt(adapters),
            prompt: `${prompt}\n\nYour response was not valid JSON. Respond with ONLY the JSON action object.` ,
            maxTokens: 512,
            temperature: 0,
          },
          userId ?? null,
        )
        turns.push({ role: 'assistant', content: retry })
        actionObj = parseAgentActionJson(retry)
      }

      if (!actionObj || typeof actionObj !== 'object') {
        errorMessage = 'Could not parse AI response as JSON action'
        break
      }

      const agentAction = actionObj as { action: string; [k: string]: any }
      adapters.events.emit({
        type: 'log',
        timestamp: Date.now(),
        data: { runId, phase: 'agent_action', action: agentAction.action, description: agentAction.description ?? null, turn },
      })

      if (agentAction.action === 'done') {
        aiSummary = typeof agentAction.summary === 'string' ? agentAction.summary : 'Completed.'
        break
      }

      if (agentAction.action === 'stuck') {
        errorMessage = typeof agentAction.reason === 'string' ? agentAction.reason : 'Agent stuck'
        break
      }

      if (agentAction.action === 'use_skill') {
        const skillName = String(agentAction.skill || '')
        const skillActionName = String(agentAction.skillAction || '')
        const skillInput = agentAction.input ?? {}

        if (!adapters.skills) {
          turns.push({ role: 'user', content: 'No skills are configured. Try a different approach.' })
          continue
        }

        const skill = adapters.skills.get(skillName)
        if (!skill || !skill.isConfigured()) {
          turns.push({ role: 'user', content: `Skill "${skillName}" is not available. Try a different approach.` })
          continue
        }

        const action = skill.actions().find(a => a.name === skillActionName)
        if (!action) {
          turns.push({ role: 'user', content: `Skill "${skillName}" has no action "${skillActionName}". Available actions: ${skill.actions().map(a => a.name).join(', ')}` })
          continue
        }

        try {
          const result = await action.execute(skillInput)
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          turns.push({ role: 'user', content: `Skill action "${skillName}.${skillActionName}" returned:\n${resultStr}` })

          adapters.events.emit({
            type: 'log',
            timestamp: Date.now(),
            data: { runId, phase: 'skill_action', skill: skillName, action: skillActionName, turn },
          })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          turns.push({ role: 'user', content: `Skill action "${skillName}.${skillActionName}" failed: ${errMsg}` })
        }
        continue
      }

      if (agentAction.action === 'ask_user') {
        const msg = String(agentAction.message || 'Need input')

        // If it is credentials, auto-answer from saved creds (first credential)
        if (isCredentialQuestion(msg)) {
          const values = creds[0]?.values || {}
          const response = formatCredentialsForAgent(values)
          turns.push({ role: 'user', content: response })
          continue
        }

        // Pause and ask the outside world via adapter
        adapters.events.emit({ type: 'pause', timestamp: Date.now(), data: { runId, reason: 'needs_user_input', message: msg } })
        state = touchState({
          ...state,
          metadata: { ...(state.metadata || {}), paused: { reason: 'needs_user_input', message: msg } },
          conversationHistory: [...state.conversationHistory, { kind: 'ask_user', message: msg }],
        })
        await adapters.state.save(runId, state)

        const userReply = await adapters.interaction.askUser(msg)
        turns.push({ role: 'user', content: `User replied: ${userReply}` })
        continue
      }

      // Execute as PlaywrightAction
      const pwAction: PlaywrightAction = {
        action: agentAction.action as any,
        url: agentAction.url,
        selector: agentAction.selector,
        text: agentAction.text,
        expected: agentAction.expected,
        type: agentAction.type,
        description: agentAction.description ?? `${agentAction.action}`,
        timeout: typeof agentAction.timeout === 'number' ? agentAction.timeout : undefined,
      }

      const res = await executeInstrumentedAction({
        page,
        action: pwAction,
        adapters,
        runId,
        stepIndex: steps.length,
        stepTimeout: actionTimeoutMs,
        totalSteps: undefined,
      })

      steps.push(res.step)

      // Persist state snapshot after each turn
      state = touchState({
        ...state,
        currentUrl: page.url(),
        steps,
        conversationHistory: [...state.conversationHistory, { kind: 'turn', turn, action: pwAction.action }],
      })
      await adapters.state.save(runId, state)

      // Add next user turn context
      if (res.step.status === 'failed') {
        turns.push({ role: 'user', content: `Action failed: ${res.step.errorMessage || 'unknown error'}. Try a different approach.` })
      } else {
        turns.push({ role: 'user', content: `Action succeeded. What is the next action?` })
      }
    }

    const summary = summarizeSteps(steps)

    if (errorMessage) {
      adapters.events.emit({ type: 'completed', timestamp: Date.now(), data: { runId, status: 'failed', error: errorMessage } })
      return {
        runId,
        status: 'failed',
        steps,
        state,
        summary,
        aiSummary,
        errorMessage,
      }
    }

    adapters.events.emit({ type: 'completed', timestamp: Date.now(), data: { runId, status: 'completed' } })
    return {
      runId,
      status: 'completed',
      steps,
      state,
      summary,
      aiSummary,
    }
  } catch (err) {
    const normalized = normalizeProviderError(err, { deploymentMode })
    adapters.events.emit({ type: 'error', timestamp: Date.now(), data: { runId, message: normalized.message, code: normalized.code } })
    const summary = summarizeSteps(steps)
    return {
      runId,
      status: 'failed',
      steps,
      state,
      summary,
      errorMessage: normalized.message,
    }
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

function summarizeSteps(steps: TestStep[]) {
  const failedSteps = steps.filter((s) => s.status === 'failed').length
  const passedSteps = steps.filter((s) => s.status === 'success').length
  return { totalSteps: steps.length, passedSteps, failedSteps }
}
