/**
 * Credential Generator — Auth Profile Integration for Email Skill
 *
 * When no auth profile is saved for a target URL:
 * - Uses the email skill to generate fresh credentials (+N variation)
 * - Returns them as SavedCredential for the agent to use
 *
 * When an auth profile IS saved:
 * - Falls through to the base credential provider
 * - Reuses stored email/password
 */

import type { CredentialProvider, SavedCredential } from '../../adapters.js'
import type { EmailSkillConfig } from './types.js'
import { generateNextAddress } from './address-generator.js'

/**
 * Wraps a base credential provider to auto-generate credentials via email skill
 * when no saved credentials exist for the target URL.
 */
export function createEmailCredentialProvider(
  baseProvider: CredentialProvider,
  emailConfig: EmailSkillConfig
): CredentialProvider {
  let variationCounter = emailConfig.variationCounter ?? 1

  return {
    async getForUrl(userId: string | null, url: string): Promise<SavedCredential[]> {
      // First, check if there are saved credentials
      const existing = await baseProvider.getForUrl(userId, url)
      if (existing.length > 0) {
        return existing
      }

      // No saved credentials — generate fresh ones using the email skill
      const generated = await generateNextAddress(emailConfig.baseEmail, variationCounter)
      if (!generated) {
        return [] // Exhausted all retries
      }

      // Advance counter for next generation
      variationCounter = generated.variation + 1

      return [
        {
          id: `generated:${generated.variation}`,
          label: 'auto-generated',
          values: {
            email: generated.email,
            password: generated.password,
          },
        },
      ]
    },

    async recordUsage(credentialId: string): Promise<void> {
      // Delegate to base provider for non-generated credentials
      if (!credentialId.startsWith('generated:')) {
        await baseProvider.recordUsage(credentialId)
      }
    },
  }
}
