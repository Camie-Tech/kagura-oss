import type { AIProvider, AICompletionRequest } from '@kagura-run/core'

/**
 * Minimal Anthropic-backed AIProvider for CLI.
 *
 * Requires env:
 * - ANTHROPIC_API_KEY
 */
export function createAnthropicAiProvider(): AIProvider {
  return {
    async completeText(req: AICompletionRequest): Promise<string> {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('Missing ANTHROPIC_API_KEY env var (required for CLI AI)')
      }

      const model = req.model || 'claude-3-5-sonnet-20241022'
      const maxTokens = req.maxTokens ?? 1024
      const temperature = req.temperature ?? 0.2

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: req.system,
          messages: [{ role: 'user', content: req.prompt }],
        }),
      })

      const text = await res.text()
      if (!res.ok) {
        const errMsg = `Anthropic API error (${res.status}): ${text}`
        console.error('[kagura:debug]', errMsg)
        throw new Error(errMsg)
      }

      const json: any = JSON.parse(text)
      const content = json?.content
      const firstText = Array.isArray(content) ? content.find((c) => c?.type === 'text')?.text : null
      if (typeof firstText !== 'string') {
        console.error('[kagura:debug] Unexpected Anthropic response:', JSON.stringify(json))
        throw new Error('Anthropic API: unexpected response shape')
      }
      return firstText
    },
  }
}
