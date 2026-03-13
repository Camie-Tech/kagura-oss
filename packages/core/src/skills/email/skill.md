# Email Skill

> This file is the canonical reference for the Email skill. It is embedded into the AI agent's system prompt when the skill is configured.

## Overview

The Email skill enables the AI agent to handle email-based authentication and verification flows during automated testing. It leverages the "plus addressing" trick (RFC 5233) to generate unlimited email variations from a single inbox.

## Capabilities

### 1. Generate Fresh Credentials (`generate_address`)

When a test requires signing up or creating an account:

- Generates a unique email variation: `user+5@example.com`
- Generates a cryptographically random password
- All `+N` variations route to the SAME inbox
- Includes exponential backoff if a variation is already taken

### 2. Read Emails (`read_email`)

After triggering a confirmation/verification email:

- Polls the IMAP inbox for matching emails
- Filters by subject regex (e.g., `/verify|confirm|welcome/i`)
- Filters by recipient address (for `+N` variation isolation)
- Configurable timeout (default: 30s) and poll interval (default: 3s)

### 3. Extract Verification Data

- `extract_code`: Pulls out 4-6 digit OTPs or verification codes
- `extract_link`: Finds verification/magic link URLs in email body

### 4. Send Emails (`send_email`) — Optional

If SMTP is configured, the agent can send emails. Most testing scenarios only need to READ emails.

## Infinite Mailbox Trick

```
Base email: daniel@camie.tech

Variations:
  daniel+1@camie.tech  → delivers to daniel@camie.tech
  daniel+2@camie.tech  → delivers to daniel@camie.tech
  daniel+99@camie.tech → delivers to daniel@camie.tech
```

This lets the agent create unlimited test accounts without needing multiple email addresses.

## Exponential Backoff

When a `+N` variation is already registered on the target site:

| Retry | Variation | Jump |
|-------|-----------|------|
| 1     | +1        | +1   |
| 2     | +2        | +1   |
| 3     | +3        | +1   |
| 4     | +4        | +1   |
| 5     | +5        | +2   |
| 6     | +7        | +4   |
| 7     | +11       | +8   |
| 8     | +19       | +16  |
| ...   | ...       | 2^n  |

Maximum 20 retries before giving up.

## Auth Profile Integration

1. **Auth profile exists** → Agent reuses stored email/password (no generation needed)
2. **No auth profile** → Agent generates fresh credentials via `generate_address`
3. **After successful auth** → Browser state can be saved as an auth profile for reuse

## Configuration

### OSS (Self-hosted)

Users configure during `kagura setup`:

```json
{
  "email": {
    "baseEmail": "daniel@camie.tech",
    "imap": {
      "host": "imap.gmail.com",
      "port": 993,
      "secure": true,
      "auth": { "user": "daniel@camie.tech", "pass": "app-password" }
    },
    "smtp": {
      "host": "smtp.gmail.com",
      "port": 587,
      "secure": false,
      "auth": { "user": "daniel@camie.tech", "pass": "app-password" }
    }
  }
}
```

### Cloud (Kagura Cloud)

Project Hermes provides a dedicated email per account. The agent uses `+N` variations from the Hermes-assigned address. No user configuration needed.

## Adding New Skills

To create a new skill, follow this pattern:

1. Create `packages/core/src/skills/<name>/`
2. Implement the `Skill` interface (see `types.ts`)
3. Include a `getSkillPrompt()` that returns AI-readable instructions
4. Create a `skill.md` file as documentation
5. Export from `packages/core/src/skills/index.ts`
6. Register in the CLI's `SkillRegistry` during adapter setup
