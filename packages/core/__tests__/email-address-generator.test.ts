import { describe, expect, it } from 'vitest'
import {
  parseBaseEmail,
  generateVariation,
  generatePassword,
  generateNextAddress,
} from '../src/skills/email/address-generator'

describe('parseBaseEmail', () => {
  it('parses a standard email address', () => {
    const result = parseBaseEmail('daniel@camie.tech')
    expect(result).toEqual({ localPart: 'daniel', domain: 'camie.tech' })
  })

  it('strips existing +suffix from local part', () => {
    const result = parseBaseEmail('daniel+test@camie.tech')
    expect(result).toEqual({ localPart: 'daniel', domain: 'camie.tech' })
  })

  it('strips +N variations from local part', () => {
    const result = parseBaseEmail('daniel+42@camie.tech')
    expect(result).toEqual({ localPart: 'daniel', domain: 'camie.tech' })
  })

  it('throws on invalid email (no @)', () => {
    expect(() => parseBaseEmail('not-an-email')).toThrow('Invalid email address')
  })

  it('handles email with multiple dots in domain', () => {
    const result = parseBaseEmail('user@mail.example.co.uk')
    expect(result).toEqual({ localPart: 'user', domain: 'mail.example.co.uk' })
  })
})

describe('generateVariation', () => {
  it('generates +N variation', () => {
    expect(generateVariation('daniel@camie.tech', 1)).toBe('daniel+1@camie.tech')
    expect(generateVariation('daniel@camie.tech', 42)).toBe('daniel+42@camie.tech')
    expect(generateVariation('daniel@camie.tech', 100)).toBe('daniel+100@camie.tech')
  })

  it('strips existing suffix before generating', () => {
    expect(generateVariation('daniel+old@camie.tech', 5)).toBe('daniel+5@camie.tech')
  })
})

describe('generatePassword', () => {
  it('generates a 16-character password', () => {
    const password = generatePassword()
    expect(password).toHaveLength(16)
  })

  it('generates different passwords each time', () => {
    const p1 = generatePassword()
    const p2 = generatePassword()
    expect(p1).not.toBe(p2)
  })

  it('contains valid characters only', () => {
    const valid = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
    const password = generatePassword()
    for (const char of password) {
      expect(valid).toContain(char)
    }
  })
})

describe('generateNextAddress', () => {
  it('returns first sequential address when no availability check', async () => {
    const result = await generateNextAddress('daniel@camie.tech', 1)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('daniel+1@camie.tech')
    expect(result!.variation).toBe(1)
    expect(result!.password).toHaveLength(16)
  })

  it('respects startFrom parameter', async () => {
    const result = await generateNextAddress('daniel@camie.tech', 10)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('daniel+10@camie.tech')
    expect(result!.variation).toBe(10)
  })

  it('returns first available address with availability check', async () => {
    // +1 is taken, +2 is available
    const isAvailable = async (email: string) => email === 'daniel+2@camie.tech'
    const result = await generateNextAddress('daniel@camie.tech', 1, isAvailable)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('daniel+2@camie.tech')
    expect(result!.variation).toBe(2)
  })

  it('uses exponential backoff after 4 sequential retries', async () => {
    const tried: string[] = []
    const isAvailable = async (email: string) => {
      tried.push(email)
      // Only variation +19 is available (would be reached via exponential backoff)
      return email === 'daniel+19@camie.tech'
    }

    const result = await generateNextAddress('daniel@camie.tech', 1, isAvailable)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('daniel+19@camie.tech')

    // Should have tried: +1, +2, +3, +4, +5, +7, +11, +19
    expect(tried).toEqual([
      'daniel+1@camie.tech',
      'daniel+2@camie.tech',
      'daniel+3@camie.tech',
      'daniel+4@camie.tech',
      'daniel+5@camie.tech',   // retries=4, jump by 2^(4-3)=2 → 5+2=7
      'daniel+7@camie.tech',   // retries=5, jump by 2^(5-3)=4 → 7+4=11
      'daniel+11@camie.tech',  // retries=6, jump by 2^(6-3)=8 → 11+8=19
      'daniel+19@camie.tech',
    ])
  })

  it('returns null when maxRetries exhausted', async () => {
    const isAvailable = async () => false
    const result = await generateNextAddress('daniel@camie.tech', 1, isAvailable, 3)
    expect(result).toBeNull()
  })

  it('treats availability check errors as not available', async () => {
    let calls = 0
    const isAvailable = async (email: string) => {
      calls++
      if (calls === 1) throw new Error('Network error')
      return true // Second call succeeds
    }

    const result = await generateNextAddress('daniel@camie.tech', 1, isAvailable)
    expect(result).not.toBeNull()
    expect(result!.variation).toBe(2) // Skipped +1 (error), landed on +2
  })
})
