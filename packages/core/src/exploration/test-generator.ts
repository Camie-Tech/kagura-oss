/**
 * Test Generator — Generate test suggestions from exploration sitemap using AI
 *
 * OSS-safe design:
 * - No provider SDK imports.
 * - No environment variable reads.
 * - Uses CoreAdapters.ai.completeText().
 */

import type { CoreAdapters } from '../adapters.js'
import type { ExplorationSiteMap, TestSuggestion } from '../types.js'

export interface TestGeneratorResult {
  success: boolean
  suggestions: TestSuggestion[]
  error?: string
}

const SYSTEM_PROMPT = `You are a QA test architect. Given a sitemap of a web application (discovered pages, links, forms, and flows), generate focused, actionable test suggestions.

RULES:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Each suggestion should be independently executable
3. Prioritize based on user impact: high = auth/checkout/critical paths, medium = important features, low = edge cases
4. Categorize each test: auth, navigation, form, crud, workflow, or other
5. Include the specific URL where the test should start
6. Write clear, specific objectives that a test agent can execute

Return a JSON array of objects:
[
  {
    "name": "Short descriptive name",
    "objective": "Clear, specific test objective",
    "url": "https://example.com/page",
    "priority": "high" | "medium" | "low",
    "category": "auth" | "navigation" | "form" | "crud" | "workflow" | "other"
  }
]`

export async function generateTestSuggestions(params: {
  adapters: CoreAdapters
  siteMap: ExplorationSiteMap
  targetUrl: string
  maxSuggestions?: number
  userId?: string | null
  model?: string
}): Promise<TestGeneratorResult> {
  const { adapters, siteMap, targetUrl, maxSuggestions = 10, userId, model } = params

  if (siteMap.pages.length === 0) {
    return { success: false, suggestions: [], error: 'No pages discovered in sitemap' }
  }

  try {
    const siteMapSummary = summarizeSiteMap(siteMap)

    const prompt = `Generate up to ${maxSuggestions} test suggestions for this web application.

Target URL: ${targetUrl}

Discovered Sitemap:
${siteMapSummary}

Return ONLY a JSON array of test suggestions.`

    const text = await adapters.ai.completeText(
      {
        system: SYSTEM_PROMPT,
        prompt,
        model: model || 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        temperature: 0.4,
      },
      userId ?? null
    )

    const suggestions: TestSuggestion[] = JSON.parse(unwrapJson(text))

    const err = validateSuggestions(suggestions)
    if (err) return { success: false, suggestions: [], error: err }

    return { success: true, suggestions: suggestions.slice(0, maxSuggestions) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error generating test suggestions'
    return { success: false, suggestions: [], error: errorMessage }
  }
}

function summarizeSiteMap(siteMap: ExplorationSiteMap): string {
  const sections: string[] = []

  if (siteMap.pages.length > 0) {
    const pageList = siteMap.pages
      .slice(0, 30)
      .map((p) => `  - ${p.title || '(untitled)'} [${p.url}] (depth: ${p.depth})`)
      .join('\n')
    sections.push(`Pages (${siteMap.pages.length}):\n${pageList}`)
  }

  if (siteMap.forms.length > 0) {
    const formList = siteMap.forms
      .slice(0, 20)
      .map((f) => `  - ${f.method.toUpperCase()} ${f.action} on ${f.url} (inputs: ${f.inputs.join(', ') || 'none'})`)
      .join('\n')
    sections.push(`Forms (${siteMap.forms.length}):\n${formList}`)
  }

  if (siteMap.flows.length > 0) {
    const flowList = siteMap.flows
      .slice(0, 10)
      .map((f) => `  - ${f.name}: ${f.steps.slice(0, 5).join(' → ')}${f.steps.length > 5 ? ' → ...' : ''}`)
      .join('\n')
    sections.push(`Flows (${siteMap.flows.length}):\n${flowList}`)
  }

  if (siteMap.links.length > 0) {
    sections.push(`Links: ${siteMap.links.length} discovered`)
  }

  return sections.join('\n\n')
}

function unwrapJson(text: string): string {
  let jsonText = text.trim()
  const codeBlock = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (codeBlock) jsonText = codeBlock[1].trim()
  return jsonText
}

function validateSuggestions(suggestions: TestSuggestion[]): string | null {
  if (!Array.isArray(suggestions)) return 'AI response is not an array of suggestions'
  for (const s of suggestions) {
    if (!s.name || !s.objective || !s.url) {
      return `Invalid suggestion format: ${JSON.stringify(s)}`
    }
  }
  return null
}
