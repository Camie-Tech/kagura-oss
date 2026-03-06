# Kagura Open Source

This repository contains Kagura’s open source packages:

- **`@kagura-run/core`** — the execution engine (adapters + portable runtime)
- **`@kagura-run/cli`** — the command line interface

> Kagura Cloud (the hosted SaaS) is proprietary and lives in a separate private repository.

## Packages

- `packages/core` — `@kagura-run/core`
- `packages/cli` — `@kagura-run/cli`

## Quick Start (CLI)

The Kagura CLI lets you run AI-driven end-to-end tests directly from your terminal.

### Installation

```bash
npm install -g @kagura-run/cli
```

### Setup

Export your Anthropic API key, which the AI engine uses to navigate and assert:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Usage

Run a test against any URL:

```bash
kagura run --url "https://example.com" --desc "Verify that the homepage loads and the login button is clickable"
```

## Contributing

See:
- `packages/CONTRIBUTING.md`
- `packages/CODE_OF_CONDUCT.md`
- `packages/SECURITY.md`

## License

Apache-2.0 — see `packages/LICENSE`.
