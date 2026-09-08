#!/usr/bin/env bash
# Developer preflight (ADR-016 rule 5) — checks the Bun actually running on
# this machine against the version this repo pins, and fails loudly rather
# than silently drifting the way `bootstrap.sh`'s unversioned install could.
#
# NOT a gate: nothing under verification/ calls this script, and it must stay
# that way (ADR-016 rule 5 asserts the pin at three places — this is one of
# them, not the mechanism that enforces the other two).
#
# Run from anywhere: `bash scripts/doctor.sh`.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

FAILURES=0

pass() { echo "OK: $1"; }
fail() {
  echo "FAIL: $1"
  FAILURES=$((FAILURES + 1))
}

check_bun_version() {
  if [[ ! -f .bun-version ]]; then
    fail ".bun-version is missing — ADR-016 rule 5 requires it as the pin's home"
    return
  fi

  local pinned
  pinned="$(<.bun-version)"
  pinned="${pinned//$'\n'/}"

  if ! command -v bun >/dev/null 2>&1; then
    fail "no bun on PATH — this repo pins bun $pinned (ADR-016)"
    return
  fi

  local actual
  actual="$(bun --version)"
  if [[ "$actual" == "$pinned" ]]; then
    pass "bun $actual matches the pinned version ($pinned)"
  else
    fail "bun $actual does not match the pinned version $pinned (ADR-016) — install $pinned, or bump .bun-version deliberately alongside apps/api/Dockerfile's ARG BUN_VERSION"
  fi
}

check_bun_version

echo
if [[ "$FAILURES" -eq 0 ]]; then
  echo "doctor.sh: all checks passed"
  exit 0
else
  echo "doctor.sh: $FAILURES failure(s)"
  exit 1
fi
