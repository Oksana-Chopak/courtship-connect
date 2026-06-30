#!/usr/bin/env bash
# One command that gates every change.
#   Locally:  npm run verify
#   In CI:    .github/workflows/ci.yml runs it on every push + PR.
#
# It catches the two classes of bug that have actually bitten us:
#   1. Type errors            -> tsc --noEmit
#   2. React Hook order bugs  -> eslint react-hooks/rules-of-hooks
#      (tsc can NOT see these; this is the rule that would have caught the
#       /progress "Your season" crash before it ever shipped.)
set -uo pipefail
fail=0

echo "→ Type-check (tsc)…"
# The "vite/client" line is a known false positive from standalone tsc (Vite
# supplies those types at build time), so it is filtered out — everything else fails the build.
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "vite/client" > /tmp/tsc_errors.txt || true
if [ -s /tmp/tsc_errors.txt ]; then
  echo "❌ Type errors:"; cat /tmp/tsc_errors.txt; fail=1
else
  echo "✅ tsc clean"
fi

echo "→ React Hooks rules (the class tsc can't catch)…"
OUT=$(npx eslint "src/**/*.{ts,tsx}" 2>&1 || true)
if echo "$OUT" | grep -q "rules-of-hooks"; then
  echo "❌ React Hook called conditionally / after an early return:"
  echo "$OUT" | grep -B1 "rules-of-hooks"
  fail=1
else
  echo "✅ no hooks violations"
fi

echo "→ Unit tests (core reward / streak / date logic)…"
if npx vitest run >/tmp/vitest_out.txt 2>&1; then
  echo "✅ tests pass"
else
  echo "❌ tests failed:"; tail -30 /tmp/vitest_out.txt; fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo ""; echo "🚫 Checks failed — do not deploy."; exit 1
fi
echo ""; echo "🎾 All checks passed."
