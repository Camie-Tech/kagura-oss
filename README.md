# Kagura Open Source

AI-driven end-to-end testing. Describe what you want to test, and the AI agent navigates your app and verifies behavior.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| `@kagura-run/core` | Execution engine (adapters + runtime) | [![npm](https://img.shields.io/npm/v/@kagura-run/core)](https://www.npmjs.com/package/@kagura-run/core) |
| `@kagura-run/cli` | Command line interface | [![npm](https://img.shields.io/npm/v/@kagura-run/cli)](https://www.npmjs.com/package/@kagura-run/cli) |

> Kagura Cloud (hosted SaaS) is proprietary and lives in a separate private repository.

## Quick Start

### Install

```bash
npm install -g @kagura-run/cli
```

### Setup

```bash
kagura setup
```

Choose **Local** mode and provide your Anthropic API key, or choose **Cloud** mode to use Kagura Cloud.

### Run a Test

```bash
kagura run --url "https://example.com" --desc "Verify homepage loads correctly"
```

### With Custom Instructions

```bash
kagura run \
  --url "https://myapp.com/login" \
  --desc "Test login flow" \
  --prompt "Email: test@example.com, Password: secret123"
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `kagura setup` | Interactive configuration wizard |
| `kagura run --url <url> --desc "<desc>"` | Run ad-hoc test |
| `kagura run ... --no-wait` | Fire and forget (cloud mode) |
| `kagura trigger --test-id <id>` | Trigger saved test (cloud) |
| `kagura trigger --group-id <id>` | Trigger test group (cloud) |
| `kagura trigger ... --no-wait` | Fire and forget |
| `kagura status --run-id <id>` | Check run status |
| `kagura results --run-id <id>` | Get detailed results |
| `kagura tests` | List saved tests |
| `kagura groups` | List test groups |
| `kagura usage` | Check credit balance |
| `kagura mode [local\|cloud]` | Switch execution mode |
| `kagura ui` | Launch local dashboard |

See [`packages/cli/README.md`](./packages/cli/README.md) for full documentation.

## Local vs Cloud Mode

| Feature | Local | Cloud |
|---------|-------|-------|
| API Key | Your Anthropic key | Kagura API key |
| Execution | Your machine | Kagura servers |
| Screenshots | Local filesystem | Cloud storage |
| Dashboard | `kagura ui` | app.kagura.run |
| CI/CD Integration | Manual | Built-in |
| Cost | Pay Anthropic directly | Kagura credits |

## Skills System

The `@kagura-run/core` package includes an extensible skills system:

### Email Skill

Enables automated signup/login flows:
- Generate unlimited email variations (`you+1@example.com`, `you+2@example.com`)
- Read verification emails via IMAP
- Extract OTPs and magic links automatically

Configure via `kagura setup` or in `~/.kagura/config.json`.

## Directory Structure

```
kagura-oss/
├── packages/
│   ├── core/          # @kagura-run/core
│   │   └── src/
│   │       ├── skills/    # Skills system (email, etc.)
│   │       ├── adapters/  # AI, storage, credentials
│   │       └── engine/    # Test execution engine
│   └── cli/           # @kagura-run/cli
│       └── src/
│           ├── commands/  # CLI commands
│           └── adapters/  # CLI-specific adapters
└── docs/
```

## Contributing

See:
- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
- [`SECURITY.md`](./SECURITY.md)

## License

Apache-2.0 — see [`LICENSE`](./LICENSE)
