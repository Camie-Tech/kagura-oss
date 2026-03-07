/**
 * Group Decomposer — Decompose test groups and detect simple objectives
 *
 * OSS-safe design:
 * - No provider SDK imports.
 * - No environment variable reads.
 * - Uses CoreAdapters.ai.completeText().
 */

import type { CoreAdapters } from '../adapters.js'

export interface GroupTest {
  name: string
  objective: string
  priority: 'high' | 'medium' | 'low'
}

export interface GroupDecomposeResult {
  success: boolean
  tests: GroupTest[]
  error?: string
}

/**
 * Determines whether a test objective is simple enough to run directly
 * without AI decomposition. Simple objectives are single-action or
 * single-verification tests.
 */
export function isSimpleObjective(objective: string): boolean {
  const trimmed = objective.trim().toLowerCase()

  // Very short descriptions are usually simple
  if (trimmed.split(/\s+/).length <= 8) return true

  // Contains "and" or "then" suggesting multi-step
  if (/\b(and then|then|after that|followed by|next|also|additionally)\b/.test(trimmed)) return false

  // Multiple sentences suggest complexity
  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  if (sentences.length > 2) return false

  // Contains enumeration
  if (/\d+\.\s/.test(objective) || /[-•]\s/.test(objective)) return false

  return true
}

const SYSTEM_PROMPT = `You are a QA test architect. Given a group of related test objectives or a high-level feature description, decompose it into individual, executable test cases.

RULES:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Each test should be independently executable
3. Assign priority based on: high = critical path, medium = important feature, low = edge case
4. Keep test names concise and descriptive
5. Each test should have ONE clear objective

Return a JSON array of objects:
[
  {
    "name": "Short descriptive name",
    "objective": "Clear testable objective",
    "priority": "high" | "medium" | "low"
  }
]`

export async function decomposeGroup(params: {
  adapters: CoreAdapters
  groupDescription: string
  targetUrl: string
  maxTests?: number
  userId?: string | null
  model?: string
}): Promise<GroupDecomposeResult> {
  const { adapters, groupDescription, targetUrl, maxTests = 10, userId, model } = params

  // If the group is simple enough, return it as a single test
  if (isSimpleObjective(groupDescription)) {
    return {
      success: true,
      tests: [
        {
          name: groupDescription.slice(0, 60),
          objective: groupDescription,
          priority: 'high',
        },
      ],
    }
  }

  try {
    const prompt = `Decompose this test group into individual test cases (max ${maxTests}).

Target URL: ${targetUrl}

Group Description:
${groupDescription}

Return ONLY a JSON array of test cases.`

    const text = await adapters.ai.completeText(
      {
        system: SYSTEM_PROMPT,
        prompt,
        model: model || 'claude-sonnet-4-20250514',
        maxTokens: 2048,
        temperature: 0.3,
      },
      userId ?? null
    )

    const tests: GroupTest[] = JSON.parse(unwrapJson(text))

    const err = validateGroupTests(tests)
    if (err) return { success: false, tests: [], error: err }

    return { success: true, tests: tests.slice(0, maxTests) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error decomposing group'
    return { success: false, tests: [], error: errorMessage }
  }
}

function unwrapJson(text: string): string {
  let jsonText = text.trim()
  const codeBlock = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1].trim()
  return jsonText
}

function validateGroupTests(tests: GroupTest[]): string | null {
  if (!Array.isArray(tests)) return 'AI response is not an array of tests'
  for (const t of tests) {
    if (!t.name || !t.objective) {
      return `Invalid test format: ${JSON.stringify(t)}`
    }
  }
  return null
}
