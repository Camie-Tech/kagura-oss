#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

fail() {
  echo "[guardrails] ERROR: $1" >&2
  exit 1
}

info() {
  echo "[guardrails] $1"
}

info "Running OSS guardrails checks..."

# 1) Secret patterns (best-effort)
# Note: do NOT include real keys. Only patterns.
SECRET_PATTERNS=(
  "sk-" 
  "kag_live_" 
  "ANTHROPIC_API_KEY" 
  "OPENAI_API_KEY" 
  "WEBHOOK_SECRET_KEY"
)

# 2) Internal domains/strings
INTERNAL_PATTERNS=(
  "camie.tech"
  "kagura-app.camie.tech"
  "app.kagura.run"
)

# 3) Banned imports in OSS core
BANNED_IMPORTS=(
  "from 'next" 
  "from \"next" 
  "from 'stripe" 
  "from \"stripe" 
  "@neondatabase" 
  "bullmq" 
  "nodemailer"
)

# 4) Disallow process.env reads in packages/core
DISALLOW_ENV_PATTERN="process\.env"

scan_dir="packages/core/src"

# Helper: ripgrep if available, else grep
if command -v rg >/dev/null 2>&1; then
  GREP_CMD=(rg -n)
else
  GREP_CMD=(grep -RIn)
fi

# Secrets/internal patterns
for p in "${SECRET_PATTERNS[@]}"; do
  if "${GREP_CMD[@]}" "$p" "$scan_dir" >/dev/null 2>&1; then
    echo "[guardrails] Found secret-like pattern '$p' in $scan_dir" >&2
    "${GREP_CMD[@]}" "$p" "$scan_dir" | head -n 20 >&2 || true
    fail "Remove secret-like pattern '$p' from OSS core."
  fi
done

for p in "${INTERNAL_PATTERNS[@]}"; do
  if "${GREP_CMD[@]}" "$p" "$scan_dir" >/dev/null 2>&1; then
    echo "[guardrails] Found internal reference '$p' in $scan_dir" >&2
    "${GREP_CMD[@]}" "$p" "$scan_dir" | head -n 20 >&2 || true
    fail "Remove internal reference '$p' from OSS core."
  fi
done

for p in "${BANNED_IMPORTS[@]}"; do
  if "${GREP_CMD[@]}" "$p" "$scan_dir" >/dev/null 2>&1; then
    echo "[guardrails] Found banned import pattern '$p' in $scan_dir" >&2
    "${GREP_CMD[@]}" "$p" "$scan_dir" | head -n 20 >&2 || true
    fail "Remove banned dependency usage from OSS core."
  fi
done

# env reads in core
if "${GREP_CMD[@]}" -E "$DISALLOW_ENV_PATTERN" "$scan_dir" >/dev/null 2>&1; then
  echo "[guardrails] Found process.env usage in $scan_dir" >&2
  "${GREP_CMD[@]}" -E "$DISALLOW_ENV_PATTERN" "$scan_dir" | head -n 20 >&2 || true
  fail "Core must not read process.env; inject config via adapters."
fi

info "OK: guardrails passed."
