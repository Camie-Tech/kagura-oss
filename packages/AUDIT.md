# Open Source Audit – @kagura-run/core Extraction

## Summary

This audit reviews files in **`kagura-app/apps/web/lib/`** that are planned for extraction into **`@kagura-run/core`** (see `packages/EXTRACTION_TODO.md`).

Goal: ensure **no sensitive/internal/private or cloud-only logic** leaks into the open source package.

Scope focus:
- Secrets/API keys
- Internal comments / private roadmap notes
- Hardcoded URLs/domains
- Debug/temporary code
- Company/internal references
- Cloud-only logic (auth, billing, DB, Stripe, email, hosted infra)

> Note: Some files listed below are **web-only** and should not be extracted at all. They are mentioned only when they influence extraction safety (e.g., a file depends on them).

---

## Critical Issues (Must Fix Before Open Source)

### 1) Provider client is cloud/self-host aware + reads server env secrets
- **File:** `provider-client.ts`
- **Full path:** `kagura-app/apps/web/lib/services/provider-client.ts`
- **Issue:** Reads `process.env.ANTHROPIC_API_KEY` and depends on deployment mode (cloud vs self_hosted). Also couples `@kagura-run/core` AI calls to Anthropic-specific client instantiation.
- **Why risky:**
  - Introduces cloud-only assumptions into OSS core
  - Encourages embedding provider secrets into server env in a way that doesn’t generalize for CLI/other runtimes
  - Makes future provider support harder (OpenAI/Gemini/etc.)
- **Fix:**
  - Do **not** extract this into core.
  - Replace with an adapter interface in core (e.g., `AIProvider.getClient()` or `AIProvider.complete()`), implemented by:
    - CLI (reads local env/config)
    - Cloud (uses stored provider connection / server env)

### 2) Webhook signing secret storage in DB must stay proprietary
- **File(s):** `webhooks.ts`, `ci-run-service.ts`, `api-key-auth.ts`
- **Full path(s):**
  - `kagura-app/apps/web/lib/services/webhooks.ts`
  - `kagura-app/apps/web/lib/services/ci-run-service.ts`
  - `kagura-app/apps/web/lib/api-key-auth.ts`
- **Issue:** Implements encryption at rest for API-key-backed webhook signing secrets + DB columns.
- **Why risky:**
  - Cloud-only operational logic (DB schema + encryption key management)
  - Not part of core engine responsibilities
- **Fix:**
  - Keep in cloud repo only.
  - Core should only define *interfaces* that allow the cloud to add webhook behavior externally.

---

## Moderate Issues

### 1) `provider-errors.ts` reads environment (`DEPLOYMENT_MODE`)
- **File:** `provider-errors.ts`
- **Full path:** `kagura-app/apps/web/lib/services/provider-errors.ts`
- **Issue:** `getDeploymentMode()` reads `process.env.DEPLOYMENT_MODE`.
- **Why risky:**
  - Pulls runtime configuration from environment directly inside core utilities
  - Makes behavior implicit and environment-dependent
- **Fix:**
  - When extracting, either:
    - Move `getDeploymentMode()` out of core (cloud concern), **or**
    - Refactor to accept config explicitly (e.g., `normalizeProviderError(err, { deploymentMode })`).

---

## Low Priority Cleanups

### 1) `normalize-url.ts` comment references a Camie domain
- **File:** `normalize-url.ts`
- **Full path:** `kagura-app/apps/web/lib/normalize-url.ts`
- **Issue:** Inline comment example includes `app.camie.ai`.
- **Why risky:**
  - Not a secret, but leaks internal branding/domain into OSS docs/comments
- **Fix:**
  - Replace with neutral examples (e.g., `example.com`).

### 2) Avoid leaking internal email defaults
- **File:** `email.ts`
- **Full path:** `kagura-app/apps/web/lib/email.ts`
- **Issue:** Default `FROM_EMAIL` includes `ping@camie.tech`.
- **Why risky:**
  - Internal/company reference
  - Not intended for OSS core (also email is cloud-only)
- **Fix:**
  - Keep `email.ts` out of core entirely.
  - If OSS ever needs email templates, use placeholders and require explicit config.

---

## Cleared Files

The following files were reviewed and did **not** contain hardcoded secrets, internal-only references, or obvious cloud-only leakage (within their current content). Some still require refactoring for adapters/types when extracted, but they are **safe from a disclosure perspective**.

### Clean / safe to extract (content-wise)
- **`dom-extractor.ts`**
  - Path: `kagura-app/apps/web/lib/services/dom-extractor.ts`
  - Notes: No env access, no URLs, no company references.

- **`ai-parser.ts`**
  - Path: `kagura-app/apps/web/lib/services/ai-parser.ts`
  - Notes: No hardcoded keys. Must replace provider-client dependency with AI adapter.

- **`test-evaluator.ts`**
  - Path: `kagura-app/apps/web/lib/services/test-evaluator.ts`
  - Notes: No secrets. Must replace provider-client dependency with AI adapter.

- **`test-decomposer.ts`**
  - Path: `kagura-app/apps/web/lib/services/test-decomposer.ts`
  - Notes: No secrets. Must replace provider-client dependency with AI adapter.

- **`group-decomposer.ts`**
  - Path: `kagura-app/apps/web/lib/services/group-decomposer.ts`
  - Notes: No secrets. Must replace provider-client dependency with AI adapter.

- **`user-input-parser.ts`**
  - Path: `kagura-app/apps/web/lib/services/user-input-parser.ts`
  - Notes: No secrets. Must replace provider-client dependency with AI adapter.

- **`test-runner.ts`**
  - Path: `kagura-app/apps/web/lib/services/test-runner.ts`
  - Notes: No keys/URLs. Needs adapter refactor (events, screenshots, types).

- **`code-generator.ts`**
  - Path: `kagura-app/apps/web/lib/code-generator.ts`
  - Notes: No secrets/URLs.

### Not for core (but reviewed for leakage)
- **`agentic-runner.ts`**
  - Path: `kagura-app/apps/web/lib/services/agentic-runner.ts`
  - Notes: No hardcoded secrets/URLs found via scan, but heavily coupled to DB/billing/credentials/event emitters. Requires large adapter refactor before extraction.

---

## Notes / Recommendations

1) **Enforce a “no env reads in core” rule**
   - Core should accept configuration and dependencies via adapters.

2) **Ban imports from cloud code**
   - Ensure `@kagura-run/core` has zero imports from `apps/web/**`.

3) **Add automated checks before publishing**
   - Secret scanning (e.g., GitHub secret scanning, gitleaks)
   - Grep rules for `sk-`, `ANTHROPIC_API_KEY`, `camie.tech`, etc.

4) **Create a public-safe prompt policy**
   - Prompts are usually OK to open source, but avoid internal product strategy wording.

---

*Last updated: 2026-03-03*
