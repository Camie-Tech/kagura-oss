import fs from 'node:fs/promises'

import type { CredentialProvider, SavedCredential } from '@kagura-run/core'
import { kaguraCredentialsPath } from '../config/paths.js'

// Minimal schema:
// {
//   "https://example.com": { "email": "test@example.com", "password": "..." }
// }
export function createFileCredentialProvider(): CredentialProvider {
  return {
    async getForUrl(_userId: string | null, targetUrl: string): Promise<SavedCredential[]> {
      try {
        const raw = await fs.readFile(kaguraCredentialsPath(), 'utf8')
        const obj = JSON.parse(raw)

        let values: any = null
        if (obj && typeof obj === 'object') {
          // exact match
          if (obj[targetUrl]) values = obj[targetUrl]

          // try hostname match
          if (!values) {
            try {
              const hostname = new URL(targetUrl).hostname
              if (obj[hostname]) values = obj[hostname]
            } catch {
              // ignore
            }
          }
        }

        if (!values || typeof values !== 'object') return []

        return [
          {
            id: `file:${targetUrl}`,
            label: 'file',
            values: values as Record<string, string>,
          },
        ]
      } catch {
        return []
      }
    },

    async recordUsage() {
      // no-op for file provider
    },
  }
}
