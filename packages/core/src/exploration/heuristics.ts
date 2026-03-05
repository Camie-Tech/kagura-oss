import type { PageAnalysis } from '../dom-extractor.js'

export function looksLikeAuthWall(analysis: PageAnalysis): boolean {
  const title = `${analysis.title || ''} ${analysis.url || ''}`.toLowerCase()
  const headings = (analysis.headings || []).join(' ').toLowerCase()
  const buttonText = (analysis.buttons || [])
    .map((b) => `${b.text || ''} ${(b as any).ariaLabel || ''}`)
    .join(' ')
    .toLowerCase()

  const hasPassword = (analysis.forms || []).some((f) =>
    (f.inputs || []).some((i: any) => String(i.type || '').toLowerCase() === 'password'),
  )

  const authWords = /login|log in|sign in|sign-in|signup|sign up|register|authenticate/
  return hasPassword || authWords.test(title) || authWords.test(headings) || authWords.test(buttonText)
}
