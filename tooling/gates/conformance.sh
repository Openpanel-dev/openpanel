#!/usr/bin/env bash
#
# Conformance gate: does the tree still have the shape the architecture rules describe?
#
#   --report    per-rule counts and every offender as file:line, plus a TOTAL. Always exits 0.
#   --assert    exits 1 if any asserted rule is above its target, printing only those rules.
#   --selftest  runs the gate's own bun:test suite.
#
# The analyzer walks the TypeScript AST instead of grepping: a grep scores a comment about a pattern as a
# compliant use, and misses signatures that span lines. The layer rules (R22) and `frontend-values-only-constants`
# (R12) are delegated to .dependency-cruiser.cjs; this gate only reports their violation counts.
# R1, R2, R4, R9, R11, R13, R16-R19 are review rules: reported as a hint, not asserted.
# The report carries no timestamps and orders by file then line, so two runs diff cleanly.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

readonly ANALYZER='tooling/gates/conformance/cli.ts'
readonly TEST_DIRECTORY='tooling/gates/conformance'
readonly CRUISER_BINARY='node_modules/.bin/depcruise'

usage() {
  echo "usage: $(basename "$0") --report | --assert | --selftest" >&2
}

require_analyzer() {
  [[ -f "$ANALYZER" ]] || {
    echo "FAIL: $ANALYZER is missing." >&2
    exit 2
  }
  command -v bun >/dev/null 2>&1 || {
    echo "FAIL: bun is not on PATH; the analyzer runs under bun (ADR-010)." >&2
    exit 2
  }
  # A delegated check that silently reports zero because its tool is absent is worse than no check.
  [[ -x "$CRUISER_BINARY" ]] || {
    echo "WARN: $CRUISER_BINARY is missing — R12 and R22 will report UNAVAILABLE" >&2
    echo "      and --assert will fail on them. Run \`bun install\`." >&2
  }
}

selftest() {
  echo "== conformance gate self-test ($TEST_DIRECTORY) =="
  bun test "$TEST_DIRECTORY"
}

require_analyzer

case "${1-}" in
  --report) bun "$ANALYZER" --report "$REPO_ROOT" ;;
  --assert) bun "$ANALYZER" --assert "$REPO_ROOT" || exit 1 ;;
  --selftest) selftest || exit 1 ;;
  *)
    usage
    exit 2
    ;;
esac
