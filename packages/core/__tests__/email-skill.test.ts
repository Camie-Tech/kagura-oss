import { describe, expect, it } from 'vitest'
import {
  createEmailSkill,
  extractVerificationCode,
  extractVerificationLink,
} from '../src/skills/email/index'
import type { EmailSkillConfig } from '../src/skills/email/types'
import type { Email } from '../src/skills/email/types'

const fullConfig: EmailSkillConfig = {
  baseEmail: 'test@example.com',
  imap: { host: 'imap.example.com', port: 993, secure: true, auth: { user: 'test@example.com', pass: 'pass' } },
  smtp: { host: 'smtp.example.com', port: 587, secure: false, auth: { user: 'test@example.com', pass: 'pass' } },
}

const imapOnlyConfig: EmailSkillConfig = {
  baseEmail: 'test@example.com',
  imap: { host: 'imap.example.com', port: 993, secure: true, auth: { user: 'test@example.com', pass: 'pass' } },
}

const unconfiguredConfig: EmailSkillConfig = {
  baseEmail: '',
  imap: { host: '', port: 993, secure: true, auth: { user: '', pass: '' } },
}

describe('createEmailSkill', () => {
  it('creates a skill with correct metadata', () => {
    const skill = createEmailSkill(fullConfig)
    expect(skill.name).toBe('email')
    expect(skill.version).toBe('1.0.0')
    expect(skill.description).toContain('Email skill')
  })

  it('isConfigured returns true when imap and baseEmail are set', () => {
    const skill = createEmailSkill(fullConfig)
    expect(skill.isConfigured()).toBe(true)
  })

  it('isConfigured returns false when baseEmail is empty', () => {
    const skill = createEmailSkill(unconfiguredConfig)
    expect(skill.isConfigured()).toBe(false)
  })

  it('exposes read_email, generate_address, extract_code, extract_link actions', () => {
    const skill = createEmailSkill(imapOnlyConfig)
    const actions = skill.actions()
    const names = actions.map(a => a.name)

    expect(names).toContain('read_email')
    expect(names).toContain('generate_address')
    expect(names).toContain('extract_code')
    expect(names).toContain('extract_link')
  })

  it('includes send_email action when SMTP is configured', () => {
    const skill = createEmailSkill(fullConfig)
    const names = skill.actions().map(a => a.name)
    expect(names).toContain('send_email')
  })

  it('does not include send_email when SMTP is not configured', () => {
    const skill = createEmailSkill(imapOnlyConfig)
    const names = skill.actions().map(a => a.name)
    expect(names).not.toContain('send_email')
  })

  it('returns a skill prompt string', () => {
    const skill = createEmailSkill(fullConfig)
    const prompt = skill.getSkillPrompt()
    expect(prompt).toContain('Email Skill')
    expect(prompt).toContain('generate_address')
    expect(prompt).toContain('read_email')
    expect(prompt).toContain('extract_code')
    expect(prompt).toContain('extract_link')
    expect(prompt).toContain('Infinite Mailbox Trick')
    expect(prompt).toContain('Exponential Backoff')
    expect(prompt).toContain('Auth Profile Integration')
  })

  it('generate_address action produces valid address', async () => {
    const skill = createEmailSkill(imapOnlyConfig)
    const generateAction = skill.actions().find(a => a.name === 'generate_address')!
    const result = await generateAction.execute({})
    expect(result).not.toBeNull()
    expect((result as any).email).toMatch(/^test\+\d+@example\.com$/)
    expect((result as any).password).toHaveLength(16)
  })

  it('generate_address increments variation counter', async () => {
    const skill = createEmailSkill(imapOnlyConfig)
    const generateAction = skill.actions().find(a => a.name === 'generate_address')!

    const r1 = await generateAction.execute({}) as any
    const r2 = await generateAction.execute({}) as any

    expect(r1.variation).toBe(1)
    expect(r2.variation).toBe(2)
  })

  it('extract_code action extracts verification code from email', async () => {
    const skill = createEmailSkill(imapOnlyConfig)
    const extractAction = skill.actions().find(a => a.name === 'extract_code')!

    const email: Email = { text: 'Your verification code is 123456. Please enter it.' }
    const result = await extractAction.execute(email)
    expect(result).toBe('123456')
  })

  it('extract_link action extracts verification link from email', async () => {
    const skill = createEmailSkill(imapOnlyConfig)
    const extractAction = skill.actions().find(a => a.name === 'extract_link')!

    const email: Email = {
      html: '<a href="https://app.example.com/verify?token=abc123">Verify your email</a>',
    }
    const result = await extractAction.execute(email)
    expect(result).toBe('https://app.example.com/verify?token=abc123')
  })
})

describe('extractVerificationCode', () => {
  it('extracts 6-digit OTP', () => {
    const email: Email = { text: 'Your verification code is 123456' }
    expect(extractVerificationCode(email)).toBe('123456')
  })

  it('extracts 4-digit PIN', () => {
    const email: Email = { text: 'Your PIN is 7890' }
    expect(extractVerificationCode(email)).toBe('7890')
  })

  it('prefers 6-digit over 4-digit', () => {
    const email: Email = { text: 'Code: 123456. PIN: 7890' }
    expect(extractVerificationCode(email)).toBe('123456')
  })

  it('extracts alphanumeric code after keyword', () => {
    const email: Email = { text: 'Your verification code: ABCdef123456' }
    expect(extractVerificationCode(email)).toBe('ABCdef123456')
  })

  it('falls back to html when text is empty', () => {
    const email: Email = { text: '', html: 'Your code is 654321' }
    expect(extractVerificationCode(email)).toBe('654321')
  })

  it('returns null when no code found', () => {
    const email: Email = { text: 'Welcome to our service!' }
    expect(extractVerificationCode(email)).toBeNull()
  })

  it('returns null for empty email', () => {
    const email: Email = {}
    expect(extractVerificationCode(email)).toBeNull()
  })
})

describe('extractVerificationLink', () => {
  it('extracts verify link from HTML href', () => {
    const email: Email = {
      html: '<p>Click <a href="https://example.com/verify?token=abc">here</a></p>',
    }
    expect(extractVerificationLink(email)).toBe('https://example.com/verify?token=abc')
  })

  it('extracts confirm link', () => {
    const email: Email = {
      html: '<a href="https://example.com/confirm-email/xyz">Confirm</a>',
    }
    expect(extractVerificationLink(email)).toBe('https://example.com/confirm-email/xyz')
  })

  it('extracts magic link', () => {
    const email: Email = {
      html: '<a href="https://example.com/magic-link?t=123">Sign in</a>',
    }
    expect(extractVerificationLink(email)).toBe('https://example.com/magic-link?t=123')
  })

  it('extracts activate link', () => {
    const email: Email = {
      html: '<a href="https://example.com/activate/user123">Activate</a>',
    }
    expect(extractVerificationLink(email)).toBe('https://example.com/activate/user123')
  })

  it('falls back to text when html is empty', () => {
    const email: Email = {
      text: 'Click here to verify: https://example.com/verify?code=xyz',
    }
    expect(extractVerificationLink(email)).toBe('https://example.com/verify?code=xyz')
  })

  it('returns null when no verification link found', () => {
    const email: Email = {
      html: '<a href="https://example.com/homepage">Visit us</a>',
    }
    expect(extractVerificationLink(email)).toBeNull()
  })

  it('returns null for empty email', () => {
    const email: Email = {}
    expect(extractVerificationLink(email)).toBeNull()
  })
})
