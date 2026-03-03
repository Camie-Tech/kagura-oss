/**
 * Normalize a URL input: trims whitespace, and if no scheme is present,
 * prepends https://. Returns the normalized string.
 *
 * Handles bare domains like "example.com" → "https://example.com"
 * Leaves fully-qualified URLs untouched.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
