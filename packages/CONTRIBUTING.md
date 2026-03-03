# Contributing to Kagura Packages

Thanks for your interest in contributing to Kagura’s open source packages:

- `@kagura-run-run/core` — the execution engine
- `@kagura-run-run/cli` — the command-line interface

This guide covers local setup, development workflow, and PR expectations.

---

## Scope & Boundaries

These docs apply to the **open source** packages under `packages/`.

- ✅ Allowed: changes in `packages-run/core/**` and `packages-run/cli/**`
- ❌ Not in scope: `apps/web/**` (proprietary Kagura Cloud code)

If you’re unsure whether something belongs in core-run/cli, open a discussion first.

---

## Prerequisites

- Node.js **18+** (recommended: latest LTS)
- npm **9+** (or your preferred package manager; commands below use npm)
- Git

---

## Repo Layout

```
packages/
  core/          # @kagura-run/core
  cli/           # @kagura-run/cli
  ARCHITECTURE.md
  EXTRACTION_TODO.md
  LICENSE
```

---

## Local Setup

### 1) Clone

```bash
git clone https://github.com/Camie-Tech/kagura-app.git
cd kagura-app
```

### 2) Install dependencies

```bash
npm install
```

If you only want to work on packages:

```bash
cd packages
npm install
```

---

## Build

### Build all packages

```bash
cd packages
npm run build
```

### Build a single package

```bash
cd packages-run/core
npm run build

cd ..-run/cli
npm run build
```

---

## Dev Mode

### Core

```bash
cd packages-run/core
npm run dev
```

### CLI

```bash
cd packages-run/cli
npm run dev
```

You can also link the CLI locally (example):

```bash
cd packages-run/cli
npm link

# In another folder (or repo root)
kagura --help
```

---

## Tests

Run all package tests:

```bash
cd packages
npm test
```

Run tests for one package:

```bash
cd packages-run/core
npm test

cd ..-run/cli
npm test
```

If a package doesn’t have tests yet, add at least:
- a minimal unit test for new logic, or
- a small integration test for CLI flows

---

## Linting & Formatting

### Lint

```bash
cd packages
npm run lint
```

### Format

```bash
cd packages
npm run format
```

**Rules:**
- Keep formatting changes separate from logic changes when possible
- Do not bypass lint rules; fix or justify with a comment

---

## TypeScript Standards

- Prefer **explicit types** on exported functions and public interfaces
- Avoid `any`; use `unknown` + narrowing when required
- Keep types portable (no imports from `apps/web/**`)
- Use small, well-named interfaces over large nested objects

---

## Code Style Guidelines

- Keep functions small and composable
- Prefer dependency injection (adapters) over direct imports
- Avoid reading environment variables directly in core
  - Use injected config/adapters instead
- Write clear error messages (actionable, user-friendly)

---

## Branch Naming

Use a descriptive branch name:

- `feat/<short-description>`
- `fix/<short-description>`
- `docs/<short-description>`
- `chore/<short-description>`

Examples:
- `feat/add-openai-provider`
- `fix-run/cli-config-parsing`

---

## Commit Messages

Use conventional, readable commits:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `refactor: ...`

Examples:
- `feat: add adapter interface for screenshot storage`
- `fix: handle empty config file gracefully`

---

## Submitting a Pull Request

1. **Open an issue** (recommended) for non-trivial changes
2. Create a branch from the default branch
3. Ensure:
   - `npm run build` passes
   - `npm test` passes
   - `npm run lint` passes
4. Open a PR with:
   - clear summary
   - screenshots/logs if relevant
   - testing steps
   - any breaking changes called out explicitly

---

## Review Process

- Maintainers will review for:
  - architecture boundaries (core must stay independent)
  - correctness and safety
  - clarity and maintainability
  - tests (where applicable)
- Expect at least **one maintainer approval** before merge

---

## Where to Ask Questions

- **GitHub Issues**: bugs, feature requests
- **GitHub Discussions**: design questions, proposals
- **Community**: ask in the Kagura community channel (see repo README for links)

If you’re unsure where to post, start with Discussions.
