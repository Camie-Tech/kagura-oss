import fs from 'node:fs/promises'

import type { CredentialProvider } from '@kagura-run/core'
import { kaguraCredentialsPath } from '../config/paths'

// Minimal schema:
// {
//   "https://example.com": { "email": "test@example.com", "password": "..." }
// }
export function createFileCredentialProvider(): CredentialProvider {
  return {
    async getForUrl(targetUrl: string) {
      try {
        const raw = await fs.readFile(kaguraCredentialsPath(), 'utf8')
        const obj = JSON.parse(raw)

        if (obj && typeof obj === 'object') {
          // exact match
          if (obj[targetUrl]) return obj[targetUrl]

          // try hostname match
          try {
            const hostname = new URL(targetUrl).hostname
            if (obj[hostname]) return obj[hostname]
          } catch {
            // ignore
          }
        }
        return null
      } catch {
        return null
      }
    },
  }
}
