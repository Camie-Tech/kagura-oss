# Core Extraction TODO

Step-by-step guide for extracting test execution logic from `apps/web/lib/` into `packages-run/core/`.

**Goal:** Create a standalone `@kagura-run/core` package that can run tests locally (CLI) or in the cloud (web) by swapping adapters.

---

## Priority 1: Essential for MVP

These files form the core test execution engine. Extract them first.

---

### dom-extractor.ts
- **Path:** `apps/web/lib/services/dom-extractor.ts`
- **Purpose:** Extracts interactive elements (forms, buttons, links, errors) from the current page via Playwright. Returns structured `PageAnalysis` for AI consumption.
- **Dependencies:** 
  - `playwright` (Page type only)
- **DB imports:** ❌ None
- **Extraction notes:** 
  - ✅ **Cleanest file to extract** — no dependencies on web-specific code
  - Copy as-is, only adjust import paths
  - Exports: `extractPageAnalysis()`, `summarizePageAnalysis()`, `PageAnalysis`, `FormInfo`, etc.
- **Effort:** 🟢 Low (1-2 hours)

---

### ai-parser.ts
- **Path:** `apps/web/lib/services/ai-parser.ts`
- **Purpose:** Converts natural language test descriptions into structured Playwright action plans using Claude.
- **Dependencies:**
  - `@anthropic-ai/sdk`
  - `dom-extractor.ts` (PageAnalysis, summarizePageAnalysis)
  - `provider-client.ts` (getAnthropicClientForUser)
- **DB imports:** ❌ None
- **Extraction notes:**
  - Replace `getAnthropicClientForUser()` with `adapters.ai.getClient()`
  - Pass `AIProvider` adapter instead of userId
  - Prompts are self-contained — no cloud dependencies
- **Effort:** 🟢 Low (2-3 hours)

---

### test-runner.ts
- **Path:** `apps/web/lib/services/test-runner.ts`
- **Purpose:** Executes Playwright commands from a parsed action plan. The "dumb" executor that runs click/type/navigate/assert steps.
- **Dependencies:**
  - `playwright` (chromium, firefox, webkit, Browser, Page, BrowserContext)
  - `ai-parser.ts` (PlaywrightAction type)
  - `screenshot-storage.ts` (saveScreenshot)
  - `test-events.ts` (emitTestEvent)
  - `../db` (TestStep type only — can move to types.ts)
  - `uuid`
- **DB imports:** ⚠️ Type imports only (TestStep)
- **Extraction notes:**
  - Move `TestStep` type to `@kagura-run/core/types.ts`
  - Replace `saveScreenshot()` with `adapters.screenshots.save()`
  - Replace `emitTestEvent()` with `adapters.events.emit()`
  - Remove fs/path imports if screenshot adapter handles paths
- **Effort:** 🟡 Medium (3-4 hours)

---

### agentic-runner.ts
- **Path:** `apps/web/lib/services/agentic-runner.ts`
- **Purpose:** The core agent loop — screenshot → AI → action → repeat. This is the heart of Kagura's test execution.
- **Dependencies:**
  - `playwright`
  - `@anthropic-ai/sdk`
  - `dom-extractor.ts`
  - `screenshot-storage.ts`
  - `test-events.ts`
  - `billing.ts` (hasCredits, deductCredits)
  - `test-state.ts` (saveTestState, loadTestState, etc.)
  - `credential-store.ts` (getCredentialsForUrl, decryptCredentials)
  - `provider-client.ts` (getAnthropicClientForUser)
  - `../db` (TestStep, AdaptationLog, UserInteractionLog, getDb)
- **DB imports:** ⚠️ Heavy — types + getDb() for state persistence
- **Extraction notes:**
  - **Largest refactor** — many web dependencies to abstract
  - Replace billing calls with `adapters.billing?.check()` / `adapters.billing?.deduct()`
  - Replace credential store with `adapters.credentials.get(url)`
  - Replace test state persistence with `adapters.state.save()` / `adapters.state.load()`
  - Replace event emission with `adapters.events.emit()`
  - Replace user interaction (ask_user) with `adapters.interaction.prompt()`
  - Replace screenshot storage with `adapters.screenshots.save()`
  - Replace AI client with `adapters.ai.getClient()`
  - Move types to `@kagura-run/core/types.ts`
- **Effort:** 🔴 High (8-12 hours)

---

### test-evaluator.ts
- **Path:** `apps/web/lib/services/test-evaluator.ts`
- **Purpose:** AI-powered pass/fail verdict after test execution. Separate call that reviews transcript and screenshots.
- **Dependencies:**
  - `@anthropic-ai/sdk`
  - `provider-client.ts` (getAnthropicClientForUser)
  - `../db` (TestStep type only)
- **DB imports:** ⚠️ Type imports only
- **Extraction notes:**
  - Move `TestStep` to shared types
  - Replace `getAnthropicClientForUser()` with `adapters.ai.getClient()`
  - Self-contained evaluation logic — clean extraction
- **Effort:** 🟢 Low (2-3 hours)

---

### provider-errors.ts
- **Path:** `apps/web/lib/services/provider-errors.ts`
- **Purpose:** Normalizes provider SDK errors (Anthropic, OpenAI) into consistent error codes. Also provides `getDeploymentMode()`.
- **Dependencies:**
  - ❌ None (pure utility)
- **DB imports:** ❌ None
- **Extraction notes:**
  - ✅ **Copy as-is** — completely standalone
  - May want to split `getDeploymentMode()` since it reads process.env (inject via config instead)
- **Effort:** 🟢 Low (1 hour)

---

### normalize-url.ts
- **Path:** `apps/web/lib/normalize-url.ts`
- **Purpose:** Utility to normalize URL input (add https:// if missing).
- **Dependencies:** ❌ None
- **DB imports:** ❌ None
- **Extraction notes:**
  - ✅ **Copy as-is** — pure utility function
- **Effort:** 🟢 Low (30 min)

---

## Priority 2: Important but Not Blocking MVP

These enhance functionality but aren't required for basic test execution.

---

### test-decomposer.ts
- **Path:** `apps/web/lib/services/test-decomposer.ts`
- **Purpose:** Uses AI to break complex tests into focused sub-tests.
- **Dependencies:**
  - `provider-client.ts` (getAnthropicClientForUser)
- **DB imports:** ❌ None
- **Extraction notes:**
  - Replace AI client with adapter
  - Self-contained prompting logic
- **Effort:** 🟢 Low (2 hours)

---

### group-decomposer.ts
- **Path:** `apps/web/lib/services/group-decomposer.ts`
- **Purpose:** Similar to test-decomposer but for test groups. Pre-check for simple objectives.
- **Dependencies:**
  - `provider-client.ts` (getAnthropicClientForUser)
- **DB imports:** ❌ None
- **Extraction notes:**
  - Replace AI client with adapter
  - `isSimpleObjective()` is pure logic — extract directly
- **Effort:** 🟢 Low (2 hours)

---

### user-input-parser.ts
- **Path:** `apps/web/lib/services/user-input-parser.ts`
- **Purpose:** Parses natural language user responses during test execution (e.g., "use test@test.com for email").
- **Dependencies:**
  - `provider-client.ts` (getAnthropicClientForUser)
- **DB imports:** ❌ None
- **Extraction notes:**
  - Replace AI client with adapter
  - Clean extraction
- **Effort:** 🟢 Low (2 hours)

---

### code-generator.ts
- **Path:** `apps/web/lib/code-generator.ts`
- **Purpose:** Generates Playwright test code from action plans/steps. Used for "Export to Code" feature.
- **Dependencies:**
  - `../db` (PlaywrightAction, TestStep types only)
- **DB imports:** ⚠️ Type imports only
- **Extraction notes:**
  - Move types to shared location
  - Pure code generation — no side effects
- **Effort:** 🟢 Low (1-2 hours)

---

### test-state.ts
- **Path:** `apps/web/lib/services/test-state.ts`
- **Purpose:** Saves and restores test execution state for pause/resume. Includes AI conversation history, browser state, etc.
- **Dependencies:**
  - `../db` (getDb, PausedTestState, TestStep)
  - `screenshot-storage.ts`
  - `@anthropic-ai/sdk` (types only)
  - `playwright` (BrowserContext type)
- **DB imports:** ⚠️ Heavy — reads/writes to database
- **Extraction notes:**
  - Replace DB calls with `adapters.state.save()` / `adapters.state.load()`
  - Define `TestExecutionState` interface in core
  - Adapters implement persistence (CLI = JSON file, web = Postgres)
- **Effort:** 🟡 Medium (4-5 hours)

---

### screenshot-storage.ts
- **Path:** `apps/web/lib/services/screenshot-storage.ts`
- **Purpose:** Saves and retrieves test screenshots. Uses storage abstraction (local or S3).
- **Dependencies:**
  - `fs/promises`, `path`
  - `storage.ts` (getStorage)
- **DB imports:** ❌ None
- **Extraction notes:**
  - This IS an adapter — becomes `ScreenshotStorage` interface in core
  - Core calls `adapters.screenshots.save(buffer, id, index)`
  - CLI implements with local fs, web implements with S3
- **Effort:** 🟡 Medium (3-4 hours)

---

### storage.ts
- **Path:** `apps/web/lib/services/storage.ts`
- **Purpose:** Storage abstraction layer — supports local filesystem and S3-compatible services.
- **Dependencies:**
  - `fs/promises`, `path`
  - `@aws-sdk-run/client-s3`
- **DB imports:** ❌ None
- **Extraction notes:**
  - May not need to extract — screenshot-storage.ts wraps this
  - If extracted, becomes a concrete adapter implementation
- **Effort:** 🟡 Medium (3-4 hours)

---

### test-events.ts
- **Path:** `apps/web/lib/services/test-events.ts`
- **Purpose:** In-process event system for real-time test execution updates. Emits step progress, screenshots, completion.
- **Dependencies:**
  - `events` (Node.js EventEmitter)
  - `../db` (TestStep type)
  - `screenshot-storage.ts` (ScreenshotResult type)
- **DB imports:** ⚠️ Type imports only
- **Extraction notes:**
  - Core defines `EventEmitter` adapter interface
  - Web implements with SSE streaming
  - CLI implements with console output
  - Move event types to core
- **Effort:** 🟡 Medium (3-4 hours)

---

## Priority 3: Nice to Have / Refactor Later

These are either exploration-specific or tightly coupled to web.

---

### exploration-runner.ts
- **Path:** `apps/web/lib/services/exploration-runner.ts`
- **Purpose:** Autonomous site exploration — discovers pages, forms, flows. Generates test suggestions.
- **Dependencies:**
  - `playwright`
  - `@anthropic-ai/sdk`
  - `dom-extractor.ts`
  - `screenshot-storage.ts`
  - `exploration-events.ts`
  - `test-generator.ts`
  - `credential-store.ts`
  - `exploration-group-runner.ts`
  - `provider-client.ts`
  - `../db` (heavy — ExplorationConfig, ExplorationForm, etc.)
- **DB imports:** ⚠️ Heavy
- **Extraction notes:**
  - Large file with many dependencies
  - Consider extracting AFTER core test execution is stable
  - May need exploration-specific adapters
- **Effort:** 🔴 High (10-15 hours)

---

### test-generator.ts
- **Path:** `apps/web/lib/services/test-generator.ts`
- **Purpose:** Generates test suggestions from exploration sitemap using AI.
- **Dependencies:**
  - `provider-client.ts`
  - `../db` (ExplorationSiteMap, ExplorationSuggestionCategory, etc.)
- **DB imports:** ⚠️ Type imports
- **Extraction notes:**
  - Depends on exploration types
  - Extract after exploration-runner
- **Effort:** 🟡 Medium (4-5 hours)

---

### exploration-events.ts
- **Path:** `apps/web/lib/services/exploration-events.ts`
- **Purpose:** Event emitter for exploration progress updates.
- **Dependencies:**
  - `events` (Node.js EventEmitter)
  - `../db` (ExplorationSiteMap type)
- **DB imports:** ⚠️ Type imports
- **Extraction notes:**
  - Similar pattern to test-events.ts
  - Extract with exploration-runner
- **Effort:** 🟢 Low (2 hours)

---

## ❌ DO NOT EXTRACT (Web-Only)

These files contain billing, auth, database, or cloud-specific logic.

| File | Reason |
|------|--------|
| `billing.ts` | Stripe integration, credit system |
| `credential-store.ts` | Database queries, encryption |
| `provider-connection-store.ts` | Database queries, OAuth tokens |
| `provider-oauth.ts` | OAuth flow, database |
| `api-key-store.ts` | API key management, database |
| `ci-run-service.ts` | CI/CD batch runs, database |
| `group-executor.ts` | Test group runs, database |
| `inline-executor.ts` | Orchestration layer, database |
| `exploration-group-runner.ts` | Database-heavy orchestration |
| `../db.ts` | Database connection + all types |
| `../auth.ts` | Session management |
| `../email.ts` | Email sending |
| `../queue/*` | Job queue system |

---

## Extraction Order (Recommended)

1. **Week 1: Foundation**
   - [ ] `dom-extractor.ts` — cleanest, no deps
   - [ ] `normalize-url.ts` — pure utility
   - [ ] `provider-errors.ts` — pure utility
   - [ ] Move core types to `packages-run/core/src/types.ts`

2. **Week 2: AI Layer**
   - [ ] `ai-parser.ts` — needs AIProvider adapter
   - [ ] `test-evaluator.ts` — needs AIProvider adapter
   - [ ] `test-decomposer.ts` — needs AIProvider adapter
   - [ ] `group-decomposer.ts` — needs AIProvider adapter

3. **Week 3: Execution Engine**
   - [ ] `test-runner.ts` — needs screenshot + event adapters
   - [ ] `test-events.ts` — define EventEmitter adapter
   - [ ] `screenshot-storage.ts` — define ScreenshotStorage adapter

4. **Week 4: Agent Core**
   - [ ] `agentic-runner.ts` — heaviest lift, needs all adapters
   - [ ] `test-state.ts` — needs StateStorage adapter
   - [ ] `user-input-parser.ts` — needs AIProvider adapter

5. **Week 5+: Exploration (Optional)**
   - [ ] `exploration-runner.ts`
   - [ ] `exploration-events.ts`
   - [ ] `test-generator.ts`

---

## Potential Blockers

### 1. Type Coupling with `../db.ts`
Many files import types from `../db.ts`. Need to:
- Duplicate essential types in `packages-run/core/src/types.ts`
- Or re-export from a shared location

### 2. AI Provider Abstraction
Current code is tightly coupled to Anthropic SDK. Need to:
- Define `AIProvider` adapter interface
- Allow plugging in OpenAI, Gemini, local models

### 3. Event System Architecture
`test-events.ts` uses Node.js EventEmitter with test result IDs. Need to:
- Define abstract EventEmitter interface
- Handle async event delivery (CLI prints immediately, web buffers for SSE)

### 4. State Persistence Complexity
`test-state.ts` serializes complex state (browser context, conversation history). Need to:
- Define portable serialization format
- Handle browser state restoration across restarts

### 5. Credential Handling
`agentic-runner.ts` fetches credentials from DB. Need to:
- Define `CredentialProvider` adapter
- CLI reads from config file, web reads from encrypted DB

---

## Success Criteria

Extraction is complete when:

1. `@kagura-run/core` can execute a test given only:
   - Test description
   - Target URL
   - Injected `CoreAdapters`

2. No imports from `apps/web/` in `packages-run/core/`

3. CLI can run tests locally without any web dependencies

4. Web app can use core by injecting web-specific adapters

---

*Last updated: March 2026*
