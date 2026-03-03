/**
 * Test Evaluator — AI-powered pass/fail verdict
 *
 * OSS-safe design:
 * - No provider SDK imports.
 * - No environment variable reads.
 * - Uses CoreAdapters.ai.completeText().
 */

import type { CoreAdapters } from '../adapters'

export type TestVerdict = 'passed' | 'failed' | 'inconclusive'

export interface EvaluationResult {
  verdict: TestVerdict
  reason: string
}

export interface EvaluatorStep {
  index: number
  description: string
  status: 'success' | 'failed' | 'skipped'
  error?: string | null
}

export async function evaluateTestResult(params: {
  adapters: CoreAdapters
  testDescription: string
  passCriteria: string | null
  steps: EvaluatorStep[]
  aiSummary: string
  errorMessage?: string
  /** Optional final screenshot as base64 jpeg/png. */
  finalScreenshotBase64?: string
  userId?: string | null
  model?: string
}): Promise<EvaluationResult> {
  const {
    adapters,
    testDescription,
    passCriteria,
    steps,
    aiSummary,
    errorMessage,
    finalScreenshotBase64,
    userId,
    model,
  } = params

  const successSteps = steps.filter((s) => s.status === 'success').length
  const failedSteps = steps.filter((s) => s.status === 'failed').length
  const totalSteps = steps.length

  const stepTranscript = steps
    .map((s) => {
      const status = s.status === 'success' ? 'OK' : s.status === 'failed' ? 'FAILED' : 'SKIPPED'
      const error = s.error ? ` — Error: ${s.error}` : ''
      return `  Step ${s.index + 1} [${status}]: ${s.description}${error}`
    })
    .join('\n')

  const criteriaSection = passCriteria
    ? `## Explicit Pass Criteria (defined by user)\n${passCriteria}`
    : `## Pass Criteria\nNo explicit pass criteria were provided. Infer reasonable pass criteria from the test objectives. If the objective describes a user flow (e.g., "test sign in", "test checkout"), the ENTIRE flow must complete end-to-end for a pass — reaching an intermediate state (e.g., "email sent" for sign-in) is NOT sufficient. The user must reach the final expected state (e.g., authenticated dashboard for sign-in, order confirmation for checkout).`

  const userPrompt = `You are a QA evaluator. A test has finished executing. Your job is to determine whether the SOFTWARE UNDER TEST passed or failed based on the evidence.

${criteriaSection}

## Test Objectives
${testDescription}

## Execution Summary
${aiSummary}

## Step Results (${successSteps}/${totalSteps} succeeded, ${failedSteps} failed)
${stepTranscript}

${errorMessage ? `## Execution Error\n${errorMessage}` : ''}

## Evaluation Rules
1. You are judging the SOFTWARE, not the test agent. A step failure due to a flaky selector or agent limitation is NOT a software failure.
2. Core function failure = FAIL (e.g., login broken, form submission error, critical feature missing)
3. Cosmetic issues = PASS with note (e.g., minor layout differences, slow load times)
4. If the test objective describes a complete flow, the flow must reach its logical endpoint to PASS. Partial completion due to SOFTWARE bugs = FAIL.
5. **CRITICAL: External verification flows (magic links, email OTPs, SMS codes, 2FA) are NOT software failures.** If the software correctly sent a verification email/SMS and the test couldn't continue because the agent lacks inbox/phone access, that is INCONCLUSIVE — the software worked correctly up to that point but the full flow could not be verified. Do NOT mark this as FAIL.
6. If there's insufficient evidence to determine pass/fail = INCONCLUSIVE
7. Consider the overall flow: did the user journey succeed even if individual steps had retries?
8. Without explicit pass criteria, infer what a reasonable QA engineer would expect as the success state for the described objective.

Respond with ONLY a JSON object (no markdown, no code blocks):
{"verdict": "passed" | "failed" | "inconclusive", "reason": "1-2 sentence explanation"}`

  // For OSS core we keep screenshots as text context (base64). Consumers may extend
  // AIProvider to support multimodal later.
  const promptWithOptionalImage = finalScreenshotBase64
    ? `${userPrompt}\n\n## Final Screenshot (base64)\n${finalScreenshotBase64.slice(0, 4000)}\n(Truncated)`
    : userPrompt

  try {
    const text = await adapters.ai.completeText(
      {
        system: 'You are a QA test evaluator. Respond with only a JSON object containing verdict and reason.',
        prompt: promptWithOptionalImage,
        model: model || 'claude-sonnet-4-5-20250929',
        maxTokens: 256,
        temperature: 0.1,
      },
      userId ?? null
    )

    return parseEvaluatorResponse(text)
  } catch (error) {
    return {
      verdict: 'inconclusive',
      reason: `Evaluator error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

function parseEvaluatorResponse(text: string): EvaluationResult {
  const trimmed = text.trim()

  // direct parse
  try {
    const parsed = JSON.parse(trimmed)
    if (isValidVerdict(parsed?.verdict)) {
      return { verdict: parsed.verdict, reason: parsed.reason || 'No reason provided' }
    }
  } catch {
    // try extraction
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (isValidVerdict(parsed?.verdict)) {
        return { verdict: parsed.verdict, reason: parsed.reason || 'No reason provided' }
      }
    } catch {
      // fall through
    }
  }

  const lower = trimmed.toLowerCase()
  if (lower.includes('passed')) return { verdict: 'passed', reason: trimmed.slice(0, 200) }
  if (lower.includes('failed')) return { verdict: 'failed', reason: trimmed.slice(0, 200) }

  return { verdict: 'inconclusive', reason: 'Could not parse evaluator response' }
}

function isValidVerdict(v: unknown): v is TestVerdict {
  return v === 'passed' || v === 'failed' || v === 'inconclusive'
}
