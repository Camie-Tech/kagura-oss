/**
 * Test Decomposer — Break complex tests into focused sub-tests using AI
 *
 * OSS-safe design:
 * - No provider SDK imports.
 * - No environment variable reads.
 * - Uses CoreAdapters.ai.completeText().
 */

import type { CoreAdapters } from '../adapters.js'

export interface SubTest {
  name: string
  objective: string
  dependsOn?: string[]
}

export interface DecomposeResult {
  success: boolean
  subTests: SubTest[]
  error?: string
}

const SYSTEM_PROMPT = `You are a QA test architect. Given a complex test description, break it into smaller, focused sub-tests that can be executed independently.

RULES:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Each sub-test should test ONE specific behavior or flow
3. Sub-tests should be ordered logically (setup before verification)
4. Include a "dependsOn" array if a sub-test requires another to run first
5. Keep sub-test names concise and descriptive
6. Each sub-test should have a clear, testable objective

Return a JSON array of objects:
[
  {
    "name": "Short descriptive name",
    "objective": "Clear description of what to test",
    "dependsOn": ["name of prerequisite sub-test"]
  }
]`

export async function decomposeTest(params: {
  adapters: CoreAdapters
  description: string
  targetUrl: string
  userId?: string | null
  model?: string
}): Promise<DecomposeResult> {
  const { adapters, description, targetUrl, userId, model } = params

  try {
    const prompt = `Break this complex test into focused sub-tests.

Target URL: ${targetUrl}

Test Description:
${description}

Return ONLY a JSON array of sub-tests.`

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

    const subTests: SubTest[] = JSON.parse(unwrapJson(text))

    const err = validateSubTests(subTests)
    if (err) return { success: false, subTests: [], error: err }

    return { success: true, subTests }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error decomposing test'
    return { success: false, subTests: [], error: errorMessage }
  }
}

function unwrapJson(text: string): string {
  let jsonText = text.trim()
  const codeBlock = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1].trim()
  return jsonText
}

function validateSubTests(subTests: SubTest[]): string | null {
  if (!Array.isArray(subTests)) return 'AI response is not an array of sub-tests'
  for (const st of subTests) {
    if (!st.name || !st.objective) {
      return `Invalid sub-test format: ${JSON.stringify(st)}`
    }
  }
  return null
}
