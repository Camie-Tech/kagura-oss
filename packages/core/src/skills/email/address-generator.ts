/**
 * Email Address Generator — Infinite Mailbox Trick
 *
 * Leverages the "plus addressing" feature supported by most email providers:
 *   daniel@camie.tech → daniel+1@camie.tech, daniel+2@camie.tech, etc.
 *
 * All variations route to the same inbox, allowing the agent to spin up
 * unlimited accounts from a single email address.
 *
 * Includes exponential backoff: if a variation is already taken on the
 * target site, the agent retries with incrementing numbers.
 */

import crypto from 'node:crypto'
import type { GeneratedAddress } from './types.js'

/**
 * Split a base email into local part and domain.
 * Strips any existing +N suffix from the local part.
 */
export function parseBaseEmail(email: string): { localPart: string; domain: string } {
  const atIndex = email.lastIndexOf('@')
  if (atIndex === -1) throw new Error(`Invalid email address: ${email}`)

  let localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)

  // Strip existing +suffix if present
  const plusIndex = localPart.indexOf('+')
  if (plusIndex !== -1) {
    localPart = localPart.slice(0, plusIndex)
  }

  return { localPart, domain }
}

/**
 * Generate an email variation using the +N trick.
 */
export function generateVariation(baseEmail: string, variation: number): string {
  const { localPart, domain } = parseBaseEmail(baseEmail)
  return `${localPart}+${variation}@${domain}`
}

/**
 * Generate a random password suitable for signup flows.
 * 16 chars, mix of upper/lower/digits/special.
 */
export function generatePassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
  const bytes = crypto.randomBytes(16)
  let password = ''
  for (let i = 0; i < 16; i++) {
    password += chars[bytes[i] % chars.length]
  }
  return password
}

/**
 * Generate the next available address with exponential backoff.
 *
 * @param baseEmail - The base email (e.g., daniel@camie.tech)
 * @param startFrom - The variation number to start from
 * @param isAvailable - Async function that checks if an email is available on the target site.
 *                      Returns true if the address can be used (not taken).
 *                      If not provided, always returns the next sequential address.
 * @param maxRetries - Maximum number of retries before giving up. Default: 20.
 * @returns The generated address, or null if all retries exhausted.
 */
export async function generateNextAddress(
  baseEmail: string,
  startFrom: number = 1,
  isAvailable?: (email: string) => Promise<boolean>,
  maxRetries: number = 20
): Promise<GeneratedAddress | null> {
  let variation = startFrom
  let retries = 0

  while (retries < maxRetries) {
    const email = generateVariation(baseEmail, variation)

    // If no availability check provided, just return the address
    if (!isAvailable) {
      return {
        email,
        variation,
        password: generatePassword(),
      }
    }

    try {
      const available = await isAvailable(email)
      if (available) {
        return {
          email,
          variation,
          password: generatePassword(),
        }
      }
    } catch {
      // Treat errors as "not available", continue retrying
    }

    // Exponential backoff on the variation number
    // First few retries: increment by 1 (1, 2, 3, 4)
    // Then start jumping: (5, 7, 11, 19, 35, ...)
    if (retries < 4) {
      variation++
    } else {
      // Exponential jump: add 2^(retries-3)
      variation += Math.pow(2, retries - 3)
    }
    retries++
  }

  return null
}
