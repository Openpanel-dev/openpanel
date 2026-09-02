#!/usr/bin/env bash
# M3-CLOSE-002 verification: proves `bun run apps/api/src/main.ts` actually
# boots, rather than merely typechecking. Three assertions:
#
#   1. ROLE=api serves healthz 200 and /metrics 200 on a configurable port.
#   2. An unknown ROLE fails boot loudly (non-zero exit, named value in the
#      message) — same doctrine as ENABLED_QUEUES.
#   3. SIGTERM shuts the process down within 5s, exit code 0, no orphan left
#      behind.
#
# Run from anywhere: `bash apps/api/e2e/boot-proof.sh`.

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1

MAIN_TS="apps/api/src/main.ts"
SHUTDOWN_TIMEOUT_S=5
FAILURES=0

pass() { echo "PASS: $1"; }
fail() {
  echo "FAIL: $1"
  FAILURES=$((FAILURES + 1))
}

# A real free port, not a guessed constant — this box runs other processes.
find_free_port() {
  bun -e 'const s = Bun.listen({ port: 0, hostname: "127.0.0.1", socket: { data() {} } }); console.log(s.port); s.stop();'
}

# --- Part 1: unknown ROLE fails boot loudly ------------------------------

UNKNOWN_LOG="$(mktemp)"
ROLE=bogus API_PORT=0 bun run "$MAIN_TS" >"$UNKNOWN_LOG" 2>&1
UNKNOWN_EXIT=$?

if [ "$UNKNOWN_EXIT" -ne 0 ]; then
  pass "unknown ROLE exits non-zero (got $UNKNOWN_EXIT)"
else
  fail "unknown ROLE should exit non-zero, got $UNKNOWN_EXIT"
fi

if grep -qi 'unknown value' "$UNKNOWN_LOG" && grep -q 'bogus' "$UNKNOWN_LOG"; then
  pass "unknown ROLE names the offending value in a clear message"
else
  fail "unknown ROLE message doesn't name the value — log follows:"
  cat "$UNKNOWN_LOG"
fi
rm -f "$UNKNOWN_LOG"

# --- Part 2: ROLE=api boots and serves healthz + /metrics ----------------

PORT="$(find_free_port)"
BOOT_LOG="$(mktemp)"

ROLE=api API_PORT="$PORT" bun run "$MAIN_TS" >"$BOOT_LOG" 2>&1 &
BOOT_PID=$!

READY=0
for _ in $(seq 1 50); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/healthz/live"; then
    READY=1
    break
  fi
  # A dead boot process will never become ready — stop waiting for it.
  if ! kill -0 "$BOOT_PID" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if [ "$READY" -ne 1 ]; then
  fail "server on port $PORT never became ready — log follows:"
  cat "$BOOT_LOG"
  kill -9 "$BOOT_PID" 2>/dev/null
  rm -f "$BOOT_LOG"
  echo "boot-proof.sh: $FAILURES failure(s)"
  exit 1
fi

HEALTHZ_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/healthz/live")
if [ "$HEALTHZ_CODE" = "200" ]; then
  pass "GET /healthz/live -> 200"
else
  fail "GET /healthz/live -> $HEALTHZ_CODE, expected 200"
fi

METRICS_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/metrics")
if [ "$METRICS_CODE" = "200" ]; then
  pass "GET /metrics -> 200"
else
  fail "GET /metrics -> $METRICS_CODE, expected 200"
fi

# --- Part 3: SIGTERM shuts down within 5s, exit 0, no orphan -------------

kill -TERM "$BOOT_PID"

WAITED=0
while kill -0 "$BOOT_PID" 2>/dev/null; do
  sleep 0.1
  WAITED=$((WAITED + 1))
  if [ "$WAITED" -ge $((SHUTDOWN_TIMEOUT_S * 10)) ]; then
    break
  fi
done

if kill -0 "$BOOT_PID" 2>/dev/null; then
  fail "process still alive ${SHUTDOWN_TIMEOUT_S}s after SIGTERM — killing it"
  kill -9 "$BOOT_PID" 2>/dev/null
  wait "$BOOT_PID" 2>/dev/null
else
  wait "$BOOT_PID" 2>/dev/null
  SHUTDOWN_EXIT=$?
  pass "process exited within ${SHUTDOWN_TIMEOUT_S}s of SIGTERM"
  if [ "$SHUTDOWN_EXIT" -eq 0 ]; then
    pass "SIGTERM shutdown exit code 0 (got $SHUTDOWN_EXIT)"
  else
    fail "SIGTERM shutdown exit code $SHUTDOWN_EXIT, expected 0"
  fi
fi

# The process itself is gone by now; confirm nothing it spawned lingers.
sleep 0.3
ORPHANS="$(pgrep -f "$MAIN_TS" || true)"
if [ -z "$ORPHANS" ]; then
  pass "no orphan process left behind"
else
  fail "orphan process(es) still running: $ORPHANS"
  # shellcheck disable=SC2086
  kill -9 $ORPHANS 2>/dev/null
fi

rm -f "$BOOT_LOG"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "boot-proof.sh: all checks passed"
  exit 0
else
  echo "boot-proof.sh: $FAILURES failure(s)"
  exit 1
fi
