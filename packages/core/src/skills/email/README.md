# Email Skill

This skill allows the Kagura agent to interact with an IMAP-enabled email inbox to read confirmation emails, extract OTPs, and click magic links.

## Configuration

The agent requires IMAP credentials. These are provided differently depending on the execution mode:
- **Local OSS Mode:** The user provides their credentials during `kagura setup`.
- **Cloud Mode:** Kagura Cloud provides sandboxed credentials per user/project via Project Hermes.

## Functionality

The primary function exposed to the agent is `readLatestEmail(options)`.

### `readLatestEmail(options)`
- **`options.matchingSubject`** (string, optional): A regex pattern to filter emails by subject line.
- **`options.since`** (Date, optional): Only read emails received after this timestamp.
- **`options.timeout`** (number, optional, default: 30s): How long to poll for a matching email.

Returns the body of the most recent matching email, or `null` if no email is found within the timeout.

## Usage in Agent Prompts

When the agent detects it needs to verify an email, it will invoke this skill:

```
I see a "Verify your email" page. I need to check the inbox for an email with the subject "Confirm your email address".

TOOL: email.readLatestEmail({ matchingSubject: "Confirm your email" })
```

## The Infinite Mailbox Trick

This skill automatically implements the `+` address trick.

- **Base Email:** `user@example.com`
- **Agent Generation:** `user+1@example.com`, `user+2@example.com`, ...

If the agent needs to sign up for a new account and the `user+1` variation is already taken, it will automatically increment and retry with `user+2`, etc., until it finds an available address. This logic is handled by the agent's core planning capabilities when it encounters a "username already exists" error.
