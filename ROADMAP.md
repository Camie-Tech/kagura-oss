# Kagura OSS Roadmap

This roadmap describes the step-by-step plan to extract Kagura’s portable execution engine into the public **kagura-oss** repository, enforce open source boundaries, and refactor Kagura Cloud to consume the OSS engine safely.

**Repos**
- **OSS (public):** https://github.com/Camie-Tech/kagura-oss
- **Cloud (proprietary):** https://github.com/Camie-Tech/kagura-app

**Packages (npm scope):**
- `@kagura-run/core`
- `@kagura-run/cli`

---

## Success Criteria (End State)

We consider this effort successful when:

1) **OSS engine is self-contained**
- `@kagura-run/core` contains portable execution logic and types
- No imports from Cloud code (`apps/web/**`)
- No DB, auth, billing, or hosted-only logic in core

2) **Cloud consumes OSS**
- Kagura Cloud uses `@kagura-run/core` (via git dependency first, then npm)
- Cloud-specific concerns are implemented via adapters only

3) **Validation completed**
- Cloud app passes regression tests after the refactor
- `kagura-oss` can be self-hosted (CLI + core) and confirmed working

---

## Phase 1 — OSS Guardrails (Safety First)

**Goal:** make it difficult to accidentally leak sensitive/internal/cloud code into OSS.

### Deliverables
- Add automated checks in OSS CI to fail on:
  - hardcoded secret patterns (`sk-`, `kag_live_`, etc.)
  - internal domains (`camie.tech`, etc.)
  - imports from cloud-only packages (`next`, DB clients, `stripe`, etc.)
  - `process.env` usage inside `packages/core` (prefer injected config)

### Acceptance
- CI blocks PRs that violate OSS boundary rules.

---

## Phase 2 — Extract “Clean” Building Blocks

**Goal:** build momentum by extracting low-risk modules with minimal coupling.

### Candidate extractions (recommended order)
1) `dom-extractor.ts`
2) URL utilities (`normalize-url.ts`)
3) Provider error normalization (`provider-errors.ts`) — refactor env reads out

### Acceptance
- Code compiles inside `@kagura-run/core`
- No cloud imports introduced
- Types live in `packages/core/src/types.ts`

---

## Phase 3 — Adapters + Core Engine Refactor

**Goal:** migrate the real engine to depend only on adapters and portable types.

### Adapter interfaces (core)
- `AIProvider` (no Anthropic hardcode)
- `ScreenshotStorage`
- `EventEmitter`
- `StateStorage`
- `CredentialProvider`
- `UserInteraction`
- `BillingProvider` **interface only** (Cloud implements; CLI may set `null`/disabled)

### Engine modules to refactor/extract
- `ai-parser.ts`
- `test-evaluator.ts`
- `test-runner.ts`
- `agentic-runner.ts` (largest refactor)
- `test-state.ts` (move persistence behind `StateStorage` adapter)

### Acceptance
- Core engine can run with only adapters (no DB, no Stripe, no Next.js)
- Anthropic usage is behind an adapter (core does not instantiate provider clients)

---

## Phase 4 — Cloud Consumption via Git Dependency (Incremental Integration)

**Goal:** keep Cloud shipping while gradually swapping internal modules to OSS.

### Deliverables
- In `kagura-app`, add dependency:
  - `@kagura-run/core` from GitHub (temporary)
- Replace imports module-by-module:
  - Start with the extracted utilities (dom extractor, url utils)
  - Progress to runners/executors

### Acceptance
- Cloud build passes
- Core functions used in Cloud behave identically

---

## Phase 5 — Stabilize, Version, and Publish

**Goal:** move from git dependency → versioned releases.

### Deliverables
- Create versioning + release policy:
  - publish core first, then CLI
  - semantic versioning
- Set up publish pipeline (GitHub Actions) to npm:
  - `@kagura-run/core`
  - `@kagura-run/cli`
- Switch Cloud dependency from git → npm.

### Acceptance
- Tagged releases are published and installable
- Cloud pins versions and upgrades via PRs

---

## Phase 6 — Validation / Acceptance Testing

**Goal:** confirm real-world usability.

### Deliverables
1) **Cloud regression test**
- Create a short checklist and run it on dev:
  - run single test
  - run test group
  - exploration run
  - CI trigger + status + results
  - webhook delivery + signature verification

2) **Self-host OSS validation**
- Run CLI locally using self-provided provider key
- Confirm core execution works without Cloud

3) **Documentation**
- Document:
  - how to run `@kagura-run/cli` locally
  - required environment variables
  - how to verify webhook signatures

### Acceptance
- Cloud works end-to-end
- Self-hosted OSS works end-to-end

---

## Operating Rules

- OSS work happens in `kagura-oss` on `feature/core-extraction` (or child branches).
- Do not commit Cloud code into OSS.
- Core must not depend on DB/auth/billing/web framework.

---

*Last updated: 2026-03-03*
