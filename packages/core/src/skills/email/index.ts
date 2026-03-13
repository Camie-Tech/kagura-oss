/**
 * Email Skill — Read, send, and generate email addresses for testing.
 *
 * Capabilities:
 * - Read emails from IMAP inbox (confirmation codes, magic links, OTPs)
 * - Send emails via SMTP (if configured)
 * - Generate infinite email variations using the +N trick
 * - Exponential backoff when email variations are taken
 *
 * OSS: User configures their own SMTP/IMAP during `kagura setup`
 * Cloud: Project Hermes provides dedicated email per account
 */

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { Skill, SkillAction } from '../types.js'
import type {
  EmailSkillConfig,
  Email,
  ReadEmailOptions,
  SendEmailOptions,
  GeneratedAddress,
} from './types.js'
import {
  generateNextAddress,
  generateVariation,
  generatePassword,
  parseBaseEmail,
} from './address-generator.js'

export type { EmailSkillConfig, Email, ReadEmailOptions, SendEmailOptions, GeneratedAddress }
export { generateNextAddress, generateVariation, generatePassword, parseBaseEmail }

// ── Email Reading (IMAP) ─────────────────────────────────────────────────

/**
 * Connects to an IMAP server and reads the latest email matching the criteria.
 * Polls at a configurable interval until timeout.
 */
export async function readLatestEmail(
  config: EmailSkillConfig,
  options: ReadEmailOptions = {}
): Promise<Email | null> {
  const {
    timeoutMs = 30000,
    pollIntervalMs = 3000,
    since = new Date(Date.now() - 5 * 60 * 1000),
  } = options

  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const client = new ImapFlow({
      ...config.imap,
      logger: false,
    })

    try {
      await client.connect()

      const lock = await client.getMailboxLock('INBOX')
      try {
        const messages = client.fetch(
          { seen: false, since },
          { envelope: true, source: true }
        )

        for await (const msg of messages) {
          if (!msg.source) continue
          const parsed = await simpleParser(msg.source)
          const subject = parsed.subject || ''

          // Subject filter
          if (options.matchingSubject && !options.matchingSubject.test(subject)) {
            continue
          }

          // Recipient filter (for +N variations)
          if (options.toAddress) {
            const toAddresses = (parsed.to && 'value' in parsed.to)
              ? parsed.to.value.map((a: { address?: string }) => a.address?.toLowerCase())
              : []
            if (!toAddresses.includes(options.toAddress.toLowerCase())) {
              continue
            }
          }

          return parsed as Email
        }
      } finally {
        lock.release()
      }
    } catch (err) {
      // Log but don't break — allow retry
      console.error('IMAP connection error:', (err as Error).message)
    } finally {
      if (client.usable) {
        await client.logout()
      }
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  return null
}

// ── Email Sending (SMTP) ─────────────────────────────────────────────────

/**
 * Send an email via SMTP using the built-in net/tls modules.
 * We use a minimal SMTP implementation to avoid adding nodemailer as a dependency.
 *
 * For most testing scenarios, the agent doesn't need to SEND email —
 * it just needs to READ confirmation emails. SMTP is optional.
 */
export async function sendEmail(
  config: EmailSkillConfig,
  options: SendEmailOptions
): Promise<boolean> {
  if (!config.smtp) {
    throw new Error('SMTP is not configured. Add smtp config to use sendEmail.')
  }

  // Dynamic import to keep the dependency optional
  const nodemailer = await importNodemailer()
  if (!nodemailer) {
    throw new Error(
      'nodemailer is required for sending email. Install it: npm install nodemailer'
    )
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.auth,
  })

  await transporter.sendMail({
    from: config.baseEmail,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  })

  return true
}

async function importNodemailer(): Promise<any> {
  try {
    return await import('nodemailer')
  } catch {
    return null
  }
}

// ── Extract verification data from emails ────────────────────────────────

/**
 * Extract a verification code or OTP from an email body.
 * Looks for common patterns: 6-digit codes, UUIDs, magic links.
 */
export function extractVerificationCode(email: Email): string | null {
  const body = (typeof email.text === 'string' ? email.text : '') ||
               (typeof email.html === 'string' ? email.html : '')

  if (!body) return null

  // 6-digit OTP (most common)
  const otpMatch = body.match(/\b(\d{6})\b/)
  if (otpMatch) return otpMatch[1]

  // 4-digit PIN
  const pinMatch = body.match(/\b(\d{4})\b/)
  if (pinMatch) return pinMatch[1]

  // Alphanumeric code (8+ chars, common for verification codes)
  const codeMatch = body.match(/(?:code|token|verify)[:\s]+([A-Za-z0-9]{8,})/i)
  if (codeMatch) return codeMatch[1]

  return null
}

/**
 * Extract a verification/magic link URL from an email body.
 */
export function extractVerificationLink(email: Email): string | null {
  const body = (typeof email.html === 'string' ? email.html : '') ||
               (typeof email.text === 'string' ? email.text : '')

  if (!body) return null

  // Look for common verification link patterns
  const patterns = [
    /href=["']?(https?:\/\/[^\s"'<>]*(?:verify|confirm|activate|magic|auth|token)[^\s"'<>]*)["']?/i,
    /(?:verify|confirm|activate|magic|auth)[^\s]*?(https?:\/\/[^\s"'<>]+)/i,
    /(https?:\/\/[^\s"'<>]*(?:verify|confirm|activate|magic|auth|token)[^\s"'<>]*)/i,
  ]

  for (const pattern of patterns) {
    const match = body.match(pattern)
    if (match) return match[1]
  }

  return null
}

// ── Skill Implementation ─────────────────────────────────────────────────

export function createEmailSkill(config: EmailSkillConfig): Skill {
  let variationCounter = config.variationCounter ?? 1

  const readAction: SkillAction<ReadEmailOptions, Email | null> = {
    name: 'read_email',
    description: 'Read the latest email from the inbox, optionally filtering by subject or recipient.',
    async execute(input) {
      return readLatestEmail(config, input)
    },
  }

  const generateAddressAction: SkillAction<
    { isAvailable?: (email: string) => Promise<boolean> },
    GeneratedAddress | null
  > = {
    name: 'generate_address',
    description: 'Generate a fresh email+password combo using the +N variation trick. Includes exponential backoff if variations are taken.',
    async execute(input) {
      const result = await generateNextAddress(
        config.baseEmail,
        variationCounter,
        input.isAvailable
      )
      if (result) {
        // Advance the counter past the used variation
        variationCounter = result.variation + 1
      }
      return result
    },
  }

  const extractCodeAction: SkillAction<Email, string | null> = {
    name: 'extract_code',
    description: 'Extract a verification code or OTP from an email body.',
    execute: async (input) => extractVerificationCode(input),
  }

  const extractLinkAction: SkillAction<Email, string | null> = {
    name: 'extract_link',
    description: 'Extract a verification or magic link URL from an email body.',
    execute: async (input) => extractVerificationLink(input),
  }

  const skillActions: SkillAction[] = [
    readAction,
    generateAddressAction,
    extractCodeAction,
    extractLinkAction,
  ]

  // Add send action only if SMTP is configured
  if (config.smtp) {
    const sendAction: SkillAction<SendEmailOptions, boolean> = {
      name: 'send_email',
      description: 'Send an email via SMTP.',
      async execute(input) {
        return sendEmail(config, input)
      },
    }
    skillActions.push(sendAction)
  }

  return {
    name: 'email',
    description: 'Email skill for reading verification emails, generating +N address variations, and extracting OTPs/magic links.',
    version: '1.0.0',

    isConfigured(): boolean {
      return Boolean(config.imap?.host && config.baseEmail)
    },

    actions(): SkillAction[] {
      return skillActions
    },

    getSkillPrompt(): string {
      return SKILL_PROMPT
    },
  }
}

// ── Skill Prompt (skill.md content) ──────────────────────────────────────

const SKILL_PROMPT = `# Email Skill

You have access to an email skill that lets you handle email-based authentication flows during testing.

## Capabilities

### 1. Generate Fresh Credentials
When a test requires signing up or creating an account, you can generate a fresh email+password:
- Call \`generate_address\` to get a unique email variation (e.g., user+5@example.com) and a random password
- All +N variations route to the SAME inbox, so you can read verification emails
- If a variation is already taken on the target site, the system automatically tries the next one with exponential backoff

### 2. Read Emails
After triggering an email (signup confirmation, password reset, OTP, magic link):
- Call \`read_email\` to poll the inbox for the latest matching email
- Filter by subject line regex (e.g., /verify|confirm|welcome/i)
- Filter by recipient address (useful when using +N variations)
- The system polls every 3 seconds for up to 30 seconds by default

### 3. Extract Verification Data
Once you have an email:
- Call \`extract_code\` to pull out a 4-6 digit OTP or verification code
- Call \`extract_link\` to find a verification/magic link URL

## Auth Profile Integration
- If an auth profile is already saved for the test target, use those credentials instead of generating new ones
- Only generate fresh credentials when no auth profile exists
- After successful authentication, the system can save the browser state as an auth profile for future reuse

## Infinite Mailbox Trick
The email system uses "plus addressing" (RFC 5233):
- Base email: daniel@camie.tech
- Variations: daniel+1@camie.tech, daniel+2@camie.tech, daniel+3@camie.tech ...
- ALL variations deliver to the same inbox
- This lets you create unlimited test accounts from one email

## Exponential Backoff
If an email variation is rejected (already registered on the target site):
1. First 4 attempts: try +1, +2, +3, +4 (sequential)
2. After that: jump exponentially (+5, +7, +11, +19, +35, ...)
3. Maximum 20 retries before giving up

## Example Flow: Sign Up Test

1. Agent needs to test "Sign up for new account"
2. No auth profile saved → generate fresh credentials:
   - generate_address → { email: "user+12@example.com", password: "kX9#mP2..." }
3. Fill in signup form with generated email + password
4. Submit form → site sends verification email
5. read_email with toAddress filter → gets the confirmation email
6. extract_code or extract_link → gets the verification data
7. Complete verification step
8. Test passes → browser state saved as auth profile for next time

## Important Notes
- Always check for an existing auth profile BEFORE generating new credentials
- When reading emails, set the \`since\` date to just before you triggered the email send
- Use the \`toAddress\` filter when using +N variations to avoid reading emails for other variations
- Verification codes expire — read emails promptly after triggering them
`
