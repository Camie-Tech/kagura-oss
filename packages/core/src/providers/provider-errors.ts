export type DeploymentMode = 'cloud' | 'self_hosted'

export type NormalizedProviderError = {
  status: number
  code: 'PROVIDER_CREDITS_EXHAUSTED' | 'PROVIDER_RATE_LIMITED' | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_ERROR'
  message: string
  provider?: 'anthropic' | 'openai' | 'unknown'
  retryable?: boolean
}

/**
 * Parse deployment mode from a raw string.
 *
 * NOTE: This function is pure and does NOT read environment variables.
 * Cloud apps may parse a deployment mode string and pass it into core.
 */
export function parseDeploymentMode(raw?: string | null): DeploymentMode {
  const v = String(raw ?? 'cloud').toLowerCase().trim()
  if (v === 'self_hosted' || v === 'self-hosted' || v === 'selfhosted') return 'self_hosted'
  return 'cloud'
}

function inferProvider(err: any): NormalizedProviderError['provider'] {
  const msg = String(err?.message || '').toLowerCase()
  const name = String(err?.name || '').toLowerCase()
  if (name.includes('anthropic') || msg.includes('anthropic') || msg.includes('claude')) return 'anthropic'
  if (name.includes('openai') || msg.includes('openai') || msg.includes('gpt')) return 'openai'
  return 'unknown'
}

function extractStatus(err: any): number | null {
  const candidates = [err?.status, err?.response?.status, err?.error?.status]
  for (const c of candidates) {
    const n = typeof c === 'number' ? c : Number(c)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function extractMessage(err: any): string {
  // Anthropic SDK often nests: { error: { error: { message } } }
  const nested = err?.error?.error?.message || err?.error?.message || err?.message
  return String(nested || 'Unknown provider error')
}

export function normalizeProviderError(
  err: unknown,
  opts?: { deploymentMode?: DeploymentMode }
): NormalizedProviderError {
  const deploymentMode = opts?.deploymentMode ?? 'cloud'

  const status = extractStatus(err) ?? 500
  const message = extractMessage(err)
  const provider = inferProvider(err)

  const lower = message.toLowerCase()

  // Common patterns
  const isRateLimit = status === 429 || lower.includes('rate limit') || lower.includes('too many requests')
  const isAuth = status === 401 || status === 403 || lower.includes('invalid api key') || lower.includes('authentication')
  const isCredits = lower.includes('credit') || lower.includes('insufficient') || lower.includes('balance too low')

  if (isCredits) {
    return {
      status,
      provider,
      code: 'PROVIDER_CREDITS_EXHAUSTED',
      retryable: false,
      message:
        deploymentMode === 'cloud'
          ? 'AI provider temporarily unavailable. Please try again later.'
          : 'Your AI provider credits are exhausted. Please top up or update your provider connection.',
    }
  }

  if (isRateLimit) {
    return {
      status,
      provider,
      code: 'PROVIDER_RATE_LIMITED',
      retryable: true,
      message:
        deploymentMode === 'cloud'
          ? 'AI provider is rate limited. Please try again shortly.'
          : 'Your AI provider is rate limited. Please try again shortly or adjust your limits.',
    }
  }

  if (isAuth) {
    return {
      status,
      provider,
      code: 'PROVIDER_AUTH_FAILED',
      retryable: false,
      message:
        deploymentMode === 'cloud'
          ? 'AI provider authentication failed. Please try again later.'
          : 'Your AI provider authentication failed. Please check your connected provider API key.',
    }
  }

  return {
    status,
    provider,
    code: 'PROVIDER_ERROR',
    retryable: status >= 500,
    message:
      provider === 'unknown' && message !== 'Unknown provider error'
        ? message
        : deploymentMode === 'cloud'
          ? 'AI provider error. Please try again later.'
          : 'AI provider error. Please check your provider status and try again.',
  }
}
