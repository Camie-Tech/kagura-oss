/**
 * Email Skill Types
 */

// ── Configuration ────────────────────────────────────────────────────────

export interface ImapConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
}

export interface EmailSkillConfig {
  /** Base email address (e.g., daniel@camie.tech). */
  baseEmail: string
  /** IMAP config for reading emails. */
  imap: ImapConfig
  /** SMTP config for sending emails (optional — not all tests need outbound). */
  smtp?: SmtpConfig
  /**
   * Starting counter for +N variations.
   * Defaults to 1. Incremented on each generation.
   */
  variationCounter?: number
}

// ── Email Types ──────────────────────────────────────────────────────────

export interface Email {
  subject?: string
  from?: { value: { address?: string; name?: string }[] }
  to?: string
  text?: string | false
  html?: string | false
  date?: Date
}

export interface ReadEmailOptions {
  /** Regex to match against email subject. */
  matchingSubject?: RegExp
  /** Only consider emails received after this date. */
  since?: Date
  /** How long to poll before giving up (ms). Default: 30000. */
  timeoutMs?: number
  /** Poll interval (ms). Default: 3000. */
  pollIntervalMs?: number
  /** Filter by recipient address (useful with +N variations). */
  toAddress?: string
}

export interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

// ── Address Generation ───────────────────────────────────────────────────

export interface GeneratedAddress {
  /** The full email address (e.g., daniel+5@camie.tech). */
  email: string
  /** The variation number used. */
  variation: number
  /** A generated password for signup flows. */
  password: string
}
