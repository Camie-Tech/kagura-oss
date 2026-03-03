# Kagura Architecture

This document defines the separation between open source and proprietary components in the Kagura codebase.

---

## High-Level Overview

Kagura is structured as a monorepo with clear boundaries between open source packages and proprietary application code.

```
kagura-app/
├── packages/
│   ├── core/          # @kagura-run-run/core   — Open Source (Apache-2.0)
│   └── cli/           # @kagura-run-run/cli    — Open Source (Apache-2.0)
└── apps/
    └── web/           # Kagura Cloud   — Proprietary
```

| Package | License | Description |
|---------|---------|-------------|
| `@kagura-run-run/core` | Apache-2.0 | Test execution engine |
| `@kagura-run-run/cli` | Apache-2.0 | Command-line interface |
| `apps/web` | Proprietary | Cloud platform (SaaS) |

---

## @kagura-run-run/core (OPEN SOURCE)

The core package is a **pure, environment-agnostic test execution engine**. It contains the fundamental logic for running AI-driven browser tests.

### Responsibilities

- **Test Executor Engine**
  - `agentic-runner.ts` — AI agent loop (screenshot → AI → action → repeat)
  - `inline-executor.ts` — Test orchestration and mode selection
- **DOM Extractor**
  - `dom-extractor.ts` — Page analysis for AI consumption (forms, links, buttons, errors)
- **Playwright Wrapper**
  - Browser lifecycle management
  - Screenshot capture
  - Action execution (click, type, navigate)
- **Types & Interfaces**
  - `TestStep`, `TestConfig`, `AgentRunResult`
  - `ExplorationConfig`, `ExplorationSiteMap`
  - Adapter interfaces for dependency injection

### Adapter Pattern

Core uses **dependency injection** via the `CoreAdapters` interface to remain decoupled from external concerns:

```typescript
interface CoreAdapters {
  events: EventEmitter        // Emit progress events
  screenshots: ScreenshotStorage  // Store screenshots
  credentials: CredentialProvider // Fetch saved credentials
  state: StateStorage         // Persist/resume execution state
  interaction: UserInteraction    // Ask user questions
  billing: BillingProvider | null // Check/deduct credits (null in CLI)
  ai: AIProvider              // Get AI client (Anthropic/OpenAI)
}
```

**How it works:**
- Core functions accept `CoreAdapters` as a parameter
- CLI and Web each implement their own adapters
- Core never imports from CLI or Web

### Explicitly Excluded

The core package **must not contain**:

- ❌ API keys or secrets
- ❌ Authentication logic
- ❌ Billing or payment code
- ❌ Usage tracking or analytics
- ❌ Cloud-specific features
- ❌ Database queries or ORM code
- ❌ HTTP server or API routes

---

## @kagura-run-run/cli (OPEN SOURCE)

The CLI is a **thin command-line wrapper** over `@kagura-run-run/core` and the optional remote API.

### Responsibilities

- **Command Interface**
  - Parse user commands (`kagura run`, `kagura explore`)
  - Handle flags and options
  - Display progress and results
- **Local Execution**
  - Instantiate CLI adapters (console output, local file storage)
  - Call `@kagura-run/core` functions directly
- **Remote API (Optional)**
  - Call `api.kagura.run` for cloud features when authenticated
  - Sync results to cloud dashboard
- **Configuration**
  - Load `kagura.config.json` for project-specific settings
  - Support environment variables (`ANTHROPIC_API_KEY`, etc.)

### CLI Adapters

The CLI implements `CoreAdapters` for local execution:

```typescript
const cliAdapters: CoreAdapters = {
  events: consoleEventEmitter,      // Print to stdout
  screenshots: localFileStorage,     // Save to ./screenshots/
  credentials: jsonFileCredentials,  // Read ~/.kagura/credentials.json
  state: localStateStorage,          // Save to ./state.json
  interaction: readlinePrompt,       // Ask via stdin
  billing: null,                     // No billing in CLI
  ai: envKeyProvider,                // Use ANTHROPIC_API_KEY env var
}
```

### Explicitly Excluded

The CLI package **must not contain**:

- ❌ Business logic (belongs in core or web)
- ❌ Direct database access
- ❌ Authentication implementation (only token storage)
- ❌ Billing logic

---

## apps/web (PROPRIETARY)

The web application is the **Kagura Cloud SaaS platform**. It provides the commercial features that fund development of the open source packages.

### Responsibilities

- **Authentication & Accounts**
  - User registration and login
  - OAuth providers
  - Session management
- **Billing & Payments**
  - Stripe integration
  - Credit system
  - Plan management
- **Dashboard UI**
  - Test management interface
  - Real-time execution streaming
  - Exploration mode
- **Test History & Analytics**
  - Result storage and retrieval
  - Trend analysis
  - Failure patterns
- **Team Management**
  - Organizations
  - Role-based access control
  - Shared test suites
- **Usage Tracking & Rate Limiting**
  - Credit consumption
  - API rate limits
  - Abuse prevention

### Web Adapters

The web app implements `CoreAdapters` for cloud execution:

```typescript
const webAdapters: CoreAdapters = {
  events: sseEventEmitter,           // Stream via Server-Sent Events
  screenshots: s3Storage,            // Upload to S3/CDN
  credentials: postgresCredentials,  // Query from database
  state: postgresStateStorage,       // Persist to database
  interaction: apiPauseResume,       // Pause execution, wait for API call
  billing: stripeBillingProvider,    // Check credits via Stripe
  ai: userProviderConnection,        // Use user's connected provider
}
```

---

## Usage Examples

### CLI Flow (Local Execution)

```bash
$ kagura run "Login and verify dashboard" --url https://myapp.com
```

```
┌──────────────────────────────────────────────────────────────┐
│ User runs CLI command                                        │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ CLI parses args, creates cliAdapters                         │
│ Calls: executeAgenticTest(params, cliAdapters)               │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ @kagura-run/core executes test                                   │
│ Uses adapters for: events → console, screenshots → ./local   │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Results printed to terminal, screenshots saved locally       │
└──────────────────────────────────────────────────────────────┘
```

### Web Flow (Cloud Execution)

```
POST /api/tests/{id}/run
```

```
┌──────────────────────────────────────────────────────────────┐
│ User clicks "Run Test" in browser                            │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Next.js API route receives request                           │
│ Authenticates user, checks credits                           │
│ Creates webAdapters, calls: executeAgenticTest(params, web)  │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ @kagura-run/core executes test                                   │
│ Uses adapters for: events → SSE, screenshots → S3            │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Browser receives live updates via SSE                        │
│ Results stored in Postgres, screenshots in S3                │
└──────────────────────────────────────────────────────────────┘
```

---

## Dependency Rules

These rules ensure clean separation and are enforced by import boundaries.

```
┌─────────────────────────────────────────────────────────────────┐
│                        ALLOWED                                  │
├─────────────────────────────────────────────────────────────────┤
│  core  →  (nothing)              Core is self-contained         │
│  cli   →  core                   CLI uses core                  │
│  web   →  core                   Web uses core                  │
├─────────────────────────────────────────────────────────────────┤
│                       FORBIDDEN                                 │
├─────────────────────────────────────────────────────────────────┤
│  core  →  cli                    No reverse dependency          │
│  core  →  web                    No reverse dependency          │
│  cli   →  web                    CLI doesn't need web           │
└─────────────────────────────────────────────────────────────────┘
```

### Verification

Before any release, verify no forbidden imports exist:

```bash
# Must return empty
grep -r "from.*apps/web" packages-run/core/src/
grep -r "from.*@kagura-run/cli" packages-run/core/src/
grep -r "from.*apps/web" packages-run/cli/src/
```

---

## Architecture Diagram

```
                              LEGEND
                    ┌─────────────────────────┐
                    │  ○ Open Source          │
                    │  ● Proprietary          │
                    │  ═══ Adapter Interface  │
                    └─────────────────────────┘


                        ┌─────────────────┐
                        │      USER       │
                        └────────┬────────┘
                                 │
             ┌───────────────────┼───────────────────┐
             │                   │                   │
             ▼                   │                   ▼
    ┌────────────────┐           │          ┌────────────────┐
    │ ○ @kagura-run/cli  │           │          │ ● apps/web     │
    │                │           │          │                │
    │  CLI Adapters  │           │          │  Web Adapters  │
    └───────┬────────┘           │          └───────┬────────┘
            │                    │                  │
            │ ═══════════════════╪══════════════════│
            │    CoreAdapters    │    CoreAdapters  │
            │ ═══════════════════╪══════════════════│
            │                    │                  │
            └───────────────┬────┴────┬─────────────┘
                            │         │
                            ▼         ▼
            ┌───────────────────────────────────────┐
            │          ○ @kagura-run/core               │
            │                                       │
            │  ┌─────────────┐  ┌─────────────┐    │
            │  │   Agentic   │  │     DOM     │    │
            │  │   Runner    │  │  Extractor  │    │
            │  └─────────────┘  └─────────────┘    │
            │  ┌─────────────┐  ┌─────────────┐    │
            │  │  Playwright │  │    Types    │    │
            │  │   Wrapper   │  │  & Schemas  │    │
            │  └─────────────┘  └─────────────┘    │
            └───────────────────┬───────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │      BROWSER        │
                    │    (Playwright)     │
                    └─────────────────────┘
```

---

## File Ownership by Responsibility

### Test Execution (→ core)

| File | Location | Extraction Status |
|------|----------|-------------------|
| `agentic-runner.ts` | `lib/services/` | 🔲 Pending |
| `inline-executor.ts` | `lib/services/` | 🔲 Pending |
| `dom-extractor.ts` | `lib/services/` | 🔲 Pending |
| `exploration-runner.ts` | `lib/services/` | 🔲 Pending |
| `test-evaluator.ts` | `lib/services/` | 🔲 Pending |
| `test-generator.ts` | `lib/services/` | 🔲 Pending |
| `ai-parser.ts` | `lib/services/` | 🔲 Pending |

### Adapters

| Adapter | CLI Implementation | Web Implementation |
|---------|-------------------|-------------------|
| `EventEmitter` | Console output | SSE streaming |
| `ScreenshotStorage` | Local filesystem | S3/CDN upload |
| `CredentialProvider` | JSON config file | Postgres query |
| `StateStorage` | Local JSON file | Postgres + Redis |
| `UserInteraction` | Readline prompt | API pause/resume |
| `BillingProvider` | `null` (disabled) | Stripe integration |
| `AIProvider` | Env var API key | User provider connection |

### Auth & Billing (→ web only)

| File | Location | Notes |
|------|----------|-------|
| `lib/auth.ts` | `apps/web/` | Proprietary — session management |
| `lib/services/billing.ts` | `apps/web/` | Proprietary — Stripe integration |
| `lib/services/credential-store.ts` | `apps/web/` | Proprietary — encrypted DB storage |
| `app/api/*` | `apps/web/` | Proprietary — all API routes |
| `components/*` | `apps/web/` | Proprietary — React components |

### Types & Interfaces (→ core)

| File | Location | Extraction Status |
|------|----------|-------------------|
| `adapters.ts` | `packages-run/core/src/` | ✅ Done |
| `types.ts` | `packages-run/core/src/` | ✅ Done |
| `index.ts` | `packages-run/core/src/` | ✅ Done |

---

## Extraction Progress Tracker

| Component | Status | Assignee | Notes |
|-----------|--------|----------|-------|
| Package structure | ✅ Done | — | `packages-run/core/`, `packages-run/cli/` |
| Adapter interfaces | ✅ Done | — | `CoreAdapters` defined |
| Type definitions | ✅ Done | — | `TestStep`, `AgentRunResult`, etc. |
| `dom-extractor.ts` | 🔲 Pending | — | 100% portable, copy as-is |
| `agentic-runner.ts` | 🔲 Pending | — | Needs adapter refactor |
| `exploration-runner.ts` | 🔲 Pending | — | Needs adapter refactor |
| `inline-executor.ts` | 🔲 Pending | — | Needs adapter refactor |
| `test-evaluator.ts` | 🔲 Pending | — | Mostly portable |
| `ai-parser.ts` | 🔲 Pending | — | Mostly portable |
| CLI adapters | 🔲 Pending | — | Implement `CoreAdapters` for CLI |
| CLI commands | 🔲 Pending | — | `run`, `explore` commands |
| Web adapters | 🔲 Pending | — | Refactor web to use core |

**Status Legend:**
- ✅ Done — Complete and merged
- 🔄 In Progress — Currently being worked on
- 🔲 Pending — Not yet started

---

## Versioning

### Semantic Versioning

Both `@kagura-run/core` and `@kagura-run/cli` follow [Semantic Versioning](https://semver.org/):

- **MAJOR** — Breaking API changes
- **MINOR** — New features, backward compatible
- **PATCH** — Bug fixes, backward compatible

### Version Synchronization

Since `@kagura-run/cli` depends on `@kagura-run/core`:

1. **Core changes first** — Always update and release core before CLI
2. **Pin major versions** — CLI should pin `@kagura-run/core` to a major version range
3. **Test compatibility** — Run CLI tests against new core versions before release

```json
// packages-run/cli/package.json
{
  "dependencies": {
    "@kagura-run/core": "^0.1.0"  // Accept minor/patch updates
  }
}
```

### Breaking Changes

When core introduces breaking changes:

1. Bump core to next major version (e.g., `0.x.x` → `1.0.0`)
2. Update CLI to use new core version
3. Update CLI to next major version
4. Document migration path in CHANGELOG

### Release Checklist

```bash
# 1. Update core version
cd packages-run/core
npm version minor  # or major/patch

# 2. Build and test core
npm run build && npm test

# 3. Update CLI dependency
cd ..-run/cli
npm install @kagura-run/core@latest

# 4. Update CLI version
npm version minor

# 5. Build and test CLI
npm run build && npm test

# 6. Publish both
cd ..-run/core && npm publish
cd ..-run/cli && npm publish
```

---

## Contributing

When contributing to this codebase:

1. **Core changes** — Must not introduce dependencies on web or cli
2. **CLI changes** — May depend on core; must not depend on web
3. **Web changes** — May depend on core; no restrictions otherwise
4. **New features** — Consider: does this belong in core (open source) or web (proprietary)?

### Decision Framework

Ask these questions:

| Question | If YES → | If NO → |
|----------|----------|---------|
| Does it require authentication? | web | core-run/cli |
| Does it involve billing? | web | core-run/cli |
| Does it need a database? | web | core-run/cli |
| Is it test execution logic? | core | web-run/cli |
| Is it UI/dashboard? | web | — |
| Is it CLI-specific UX? | cli | — |

---

*Last updated: March 2026*
