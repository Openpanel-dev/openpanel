#!/usr/bin/env bash
#
# ADR-022 conformance gate — does the tree still have the SHAPE the standard
# describes?
#
#   --report    per-rule counts and every offender as file:line, one block per
#               rule ending in a TOTAL, plus one overall TOTAL. Always exits 0.
#   --assert    exits 1 if any ASSERTED rule is above its target, printing only
#               those rules and their offenders. Exits 0 when the tree is
#               conformant. `--assert` exiting 0 is the M14 gate.
#   --selftest  runs the gate's own bun:test suite — the two miscount traps and
#               the R6 asset-loader allowlist. Exits 1 if a test fails.
#
# WHY THIS GATE EXISTS
#
# Every other gate in this plan proves BEHAVIOUR: goldens 137/137, the routing
# golden 217/217, the session e2e 29/29, the wire contracts 67/67, the P13 drift
# gate 0/416. Not one of them proves shape. Each of ADR-022's rules can be broken
# while all of that stays green, which is exactly how the tree arrived at 36
# factories with no composition root, 172 process.env reads in a package whose
# app calls itself "the sole reader", and a 2,104-line v1-compat.ts. A rule with
# no check is advice.
#
# WHY IT WALKS THE AST INSTEAD OF GREPPING
#
# Both of these were measured on 2026-09-08 against packages/core/src, and both
# make a naive gate lie:
#
#   1. `rg 'export function create[A-Za-z]+Service\(deps'` finds 28 factories.
#      There are 36 — eight signatures span lines, so the argument list is not on
#      the `export function` line. A gate that greps for the opening paren and
#      the first parameter together silently passes the eight it cannot see.
#
#   2. `rg -o 'ReturnType<typeof create' packages/core/src/services.ts` matches
#      once, and the match is a COMMENT at services.ts:154 explaining why
#      `ReturnType<typeof createServices>` is circular. The pattern is applied in
#      code ZERO times. A grep scores that comment as one compliant member.
#
# A third turned up while building the gate, in the same family: R7's baseline
# was measured with `rg 'process\.env\.'`, which counts a comment at
# rpc/base.ts:246 saying core reads no process.env, and misses a real read at
# shared/get-client-ip.ts:83 written `process.env?.`. The two errors cancel in
# the occurrence count (172 either way) and do not in the file count. The report
# prints the reconciliation rather than quietly picking one.
#
# A check that cannot tell code from a comment about code is not a check, so
# every count used as evidence walks the TypeScript AST. `typescript` is already
# a declared dependency.
#
# WHAT IS DELEGATED
#
#   R22  the layer rules M14-002 landed in .dependency-cruiser.cjs. This gate
#        reports their violation counts; it does not reimplement them. ADR-022's
#        grep fallback is not in play — M14-002's peer-resolution verification
#        passed. A bare `../` depth grep is forbidden either way: a module
#        importing `defineJob` at `../../jobs/define` is importing DOWNWARD, and
#        a depth check flags every well-formed module in the tree.
#   R12  the existing `frontend-values-only-constants` cruiser rule.
#
# WHAT IS REPORTED BUT NOT ASSERTED
#
# R1, R2, R4, R9, R11, R13, R16, R17, R18, R19. They are review rules: passing
# them is a judgement a document makes, not a number. `--report` prints whatever
# is measurable as a hint for the reviewer. R20 is deferred by Carl (2026-09-08)
# and is absent from this gate entirely — do not add it.
#
# The report body carries no timestamps and orders everything by file then line,
# so two runs diff cleanly. That is the property the fix wave needs to prove a
# rule reached zero.

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
  # R12 and R22 are delegated. A delegated check that silently reports zero
  # because its tool is absent is worse than no check, so say so up front.
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
