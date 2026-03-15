# @kagura-run/cli

Command line interface for Kagura AI. Run agentic end-to-end tests from your terminal.

## Installation

```bash
npm install -g @kagura-run/cli
```

## Setup

```bash
kagura setup
```

This launches an interactive wizard to configure:
- **Mode**: Local (uses your Anthropic key) or Cloud (uses Kagura Cloud)
- **API Keys**: Anthropic API key for local mode, Kagura API key for cloud mode
- **Email Skill** (optional): Configure IMAP for automated signup/verification flows

## Commands

### Ad-hoc Testing

Run a one-off test against any URL:

```bash
# Basic test
kagura run --url "https://example.com" --desc "Verify homepage loads"

# With detailed instructions
kagura run --url "https://myapp.com/login" \
  --desc "Test login flow" \
  --prompt "Use email: test@example.com, password: Test123!"

# Cloud mode: don't wait for completion (fire and forget)
kagura run --url "https://example.com" --desc "Test site" --no-wait
```

**Options:**
| Flag | Description |
|------|-------------|
| `--url <url>` | Target URL to test (required) |
| `--desc "<description>"` | Test objective (required) |
| `--prompt "<instructions>"` | Detailed instructions for the AI |
| `--no-wait` | Return immediately without waiting for results (cloud mode) |

### Trigger Saved Tests (Cloud Mode)

Trigger published tests from your Kagura Cloud dashboard:

```bash
# Trigger a single test
kagura trigger --test-id <uuid>

# Trigger multiple tests
kagura trigger --test-id <id1>,<id2>,<id3>

# Trigger a test group
kagura trigger --group-id <uuid>

# Fire and forget (don't wait for completion)
kagura trigger --test-id <uuid> --no-wait
```

**Options:**
| Flag | Description |
|------|-------------|
| `--test-id <id>` | Test ID(s) to trigger (comma-separated for multiple) |
| `--group-id <id>` | Test group ID to trigger |
| `--no-wait` | Return immediately without waiting for results |

### Check Status & Results

```bash
# Check run status
kagura status --run-id <uuid>

# Get detailed results
kagura results --run-id <uuid>

# List recent runs
kagura runs
kagura runs --status passed
kagura runs --limit 10
```

### Manage Tests (Cloud Mode)

```bash
# List all tests
kagura tests
kagura tests --published
kagura tests --passing
kagura tests --search "login"

# Get test details
kagura tests get --test-id <uuid>

# List test groups
kagura groups
kagura groups --limit 10
```

### Usage & Billing

```bash
# Check credit balance
kagura usage
```

### Mode Switching

```bash
# Show current mode
kagura mode

# Switch to local mode
kagura mode local

# Switch to cloud mode
kagura mode cloud
```

### Local Dashboard

```bash
# Launch local visualization UI
kagura ui
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (local mode) |
| `KAGURA_API_KEY` | Kagura Cloud API key |
| `KAGURA_APP_URL` | Override app URL (default: https://app.kagura.run) |
| `KAGURA_API_URL` | Override API URL (default: https://api.kagura.run) |

Environment variables take precedence over config file values.

## Config File

Configuration is stored in `~/.kagura/config.json`:

```json
{
  "mode": "cloud",
  "apiKey": "kag_live_...",
  "appUrl": "https://app.kagura.run",
  "apiUrl": "https://api.kagura.run",
  "anthropicApiKey": "sk-ant-...",
  "email": {
    "baseEmail": "you@example.com",
    "imap": {
      "host": "imap.gmail.com",
      "port": 993,
      "secure": true,
      "auth": {
        "user": "you@example.com",
        "pass": "app-password"
      }
    }
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success / test passed |
| 1 | Error / test failed |
| 2 | Test paused (waiting for user input) |

## License

Apache-2.0
