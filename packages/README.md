# Kagura Packages

This directory contains the open-source packages extracted from Kagura AI.

## Packages

### `@kagura/core`

The core test execution engine. Framework-agnostic, can be used by both the web app and CLI.

**Features:**
- Agentic test runner (AI-driven browser automation)
- Exploration runner (autonomous site discovery)
- DOM extractor (page analysis for AI consumption)
- Test evaluator (pass/fail determination)

**License:** Apache-2.0

### `@kagura/cli`

Command-line interface for running Kagura tests locally or in CI/CD pipelines.

**Usage:**
```bash
# Install globally
npm install -g @kagura/cli

# Run a test
kagura run "Login and check dashboard" --url https://example.com

# Explore a site
kagura explore https://example.com --output ./report
```

**License:** Apache-2.0

## Development

These packages are part of the Kagura AI monorepo. To develop locally:

```bash
# From repo root
npm install

# Build all packages
npm run build -w packages/core -w packages/cli

# Run CLI in dev mode
npm run dev -w packages/cli
```

## Architecture

```
packages/
├── core/           # @kagura/core - Test execution engine
│   ├── src/
│   │   ├── adapters.ts      # Interface definitions
│   │   ├── types.ts         # Shared types
│   │   ├── agentic-runner.ts    # (to be extracted)
│   │   ├── exploration-runner.ts # (to be extracted)
│   │   └── dom-extractor.ts     # (to be extracted)
│   └── ...
│
├── cli/            # @kagura/cli - Command line interface
│   ├── src/
│   │   ├── index.ts         # CLI entry point
│   │   ├── adapters.ts      # CLI-specific adapters
│   │   └── commands/        # CLI commands
│   └── ...
│
└── README.md       # This file
```

## Extraction Status

See `CLI_EXTRACTION_PLAN.md` in the repo root for the detailed extraction roadmap.

| Component | Status |
|-----------|--------|
| Adapter interfaces | ✅ Defined |
| Type definitions | ✅ Defined |
| dom-extractor | 🔲 To extract |
| agentic-runner | 🔲 To extract |
| exploration-runner | 🔲 To extract |
| CLI adapters | 🔲 To implement |
| CLI commands | 🔲 To implement |
