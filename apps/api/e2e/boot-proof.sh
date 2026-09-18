#!/usr/bin/env bash
# Proves `bun run apps/api/src/main.ts` actually boots — every ROLE the ROLE
# table declares — rather than merely typechecking (playbook rule 1).
#
# M3-CLOSE-002 wrote parts 1-3; M9-002 added parts 4-6; M9-003 (which deleted
# apps/worker) flipped the unhandled-scheduler check in part 4 from "names the
# three missing handlers" to "there are none".
#
#   1. An unknown ROLE fails boot loudly (non-zero exit, named value in the
#      message) — and so does an unknown ENABLED_QUEUES token.
#   2. ROLE=api serves /healthz/live, /healthz/ready and /metrics, runs NO
#      workers/schedulers/consumer, and mounts neither bull-board nor the
#      debug routes.
#   3. SIGTERM shuts the process down within 5s, exit code 0, no orphan left
#      behind.
#   4. ROLE=worker starts all seven BullMQ workers, the cron schedulers and
#      the Kafka ingest consumer; exposes the consuming-role scrape gauges;
#      serves bull-board behind the session guard (401, not 200 and not 404).
#   5. ROLE=all does everything ROLE=worker does AND sets redis
#      keyspace-notify, which ROLE=worker must not.
#   6. The two opt-outs: DISABLE_BULLBOARD unmounts the UI, DISABLE_WORKERS
#      leaves the ops surface up with nothing consuming.
#
# Parts 4-5 need the real backing services, so they source the repo `.env`
# and are ISOLATED from whatever else uses this box:
#
#   * QUEUE_NAMESPACE suffixes every BullMQ key, so the proof cannot consume
#     or prune the live `cron`/`sessions`/... keys. The un-namespaced keys
#     byte-identity is pinned separately by
#     packages/core/src/jobs/naming.test.ts and the controllers queue-keys
#     golden.
#   * KAFKA_CONSUMER_GROUP is a proof-only group, so joining does not
#     rebalance the real `openpanel-events` consumers. The topic is the real
#     one and is only read from `latest`.
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

assert_contains() {
  if printf '%s' "$1" | grep -qF -- "$2"; then
    pass "$3"
  else
    fail "$3 (missing: $2)"
  fi
}

assert_absent() {
  if printf '%s' "$1" | grep -qF -- "$2"; then
    fail "$3 (unexpectedly present: $2)"
  else
    pass "$3"
  fi
}

# A real free port, not a guessed constant — this box runs other processes.
find_free_port() {
  bun -e 'const s = Bun.listen({ port: 0, hostname: "127.0.0.1", socket: { data() {} } }); console.log(s.port); s.stop();'
}

# --- Part 1: an unknown ROLE / ENABLED_QUEUES fails boot loudly ----------

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

QUEUES_LOG="$(mktemp)"
ROLE=worker ENABLED_QUEUES=events_kafka API_PORT=0 bun run "$MAIN_TS" >"$QUEUES_LOG" 2>&1
QUEUES_EXIT=$?

if [ "$QUEUES_EXIT" -ne 0 ] && grep -q 'events_kafka' "$QUEUES_LOG" \
  && grep -q 'was renamed to' "$QUEUES_LOG"; then
  pass "ENABLED_QUEUES=events_kafka exits non-zero and names the rename"
else
  fail "ENABLED_QUEUES=events_kafka should exit non-zero naming the rename (exit $QUEUES_EXIT) — log follows:"
  cat "$QUEUES_LOG"
fi
rm -f "$QUEUES_LOG"

# --- Part 2: ROLE=api boots and serves the ops surface -------------------

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

READY_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/healthz/ready")
if [ "$READY_CODE" = "200" ]; then
  pass "GET /healthz/ready -> 200 (ROLE=api: no consumer, so no heartbeat gate)"
else
  fail "GET /healthz/ready -> $READY_CODE, expected 200"
fi

METRICS_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/metrics")
if [ "$METRICS_CODE" = "200" ]; then
  pass "GET /metrics -> 200"
else
  fail "GET /metrics -> $METRICS_CODE, expected 200"
fi

API_METRICS="$(curl -s "http://127.0.0.1:$PORT/metrics")"
assert_contains "$API_METRICS" 'process_cpu_seconds_total' \
  "ROLE=api /metrics carries the default process metrics"
assert_contains "$API_METRICS" 'http_request_duration_seconds' \
  "ROLE=api /metrics carries the route histogram"
assert_contains "$API_METRICS" 'http_request_summary_seconds' \
  "ROLE=api /metrics carries the route summary"
# One registry: the queue/buffer/session scrape collectors register ONLY where
# the role consumes (TARGET_ARCHITECTURE 18).
assert_absent "$API_METRICS" 'sessions_waiting_count' \
  "ROLE=api does NOT register the queue gauges"
assert_absent "$API_METRICS" 'sessions_active_total' \
  "ROLE=api does NOT register the session scrape gauges"
assert_absent "$API_METRICS" 'buffer_event_count' \
  "ROLE=api does NOT register the buffer gauges"

BOARD_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/bullboard")
if [ "$BOARD_CODE" = "404" ]; then
  pass "ROLE=api does NOT mount bull-board (GET /bullboard -> 404)"
else
  fail "ROLE=api should not mount bull-board, got $BOARD_CODE"
fi

if grep -q '"msg":"worker started"' "$BOOT_LOG"; then
  fail "ROLE=api must not start workers — log follows:"
  cat "$BOOT_LOG"
else
  pass "ROLE=api starts no workers, schedulers or ingest consumer"
fi

# The debug routes lived on the worker in V1; ROLE=api never had them.
DEBUG_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/debug/cron")
if [ "$DEBUG_CODE" = "404" ]; then
  pass "ROLE=api does NOT mount the debug routes (GET /debug/cron -> 404)"
else
  fail "ROLE=api should not mount the debug routes, got $DEBUG_CODE"
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

# --- Parts 4-5: the consuming roles --------------------------------------
#
# These need the real Redis/Kafka/Postgres, so they source `.env`. Isolated
# by QUEUE_NAMESPACE + a proof-only Kafka consumer group (see the header).

if [ ! -f "$REPO_ROOT/.env" ]; then
  fail "$REPO_ROOT/.env is missing — parts 4-5 need REDIS_URL/KAFKA_BROKERS/DATABASE_URL"
  echo
  echo "boot-proof.sh: $FAILURES failure(s)"
  exit 1
fi

PROOF_NAMESPACE="bootproof$$"
PROOF_KAFKA_GROUP="openpanel-events-bootproof-$$"
CONSUMING_READY_TIMEOUT_S=90

# Boots one consuming role, waits for it to listen, and leaves $ROLE_PID and
# $ROLE_LOG set for the caller's assertions.
boot_consuming_role() { boot_consuming_role_with_env "$1"; }

# `boot_consuming_role_with_env <role> [NAME=VALUE ...]`
boot_consuming_role_with_env() {
  local role="$1"
  shift
  ROLE_PORT="$(find_free_port)"
  ROLE_LOG="$(mktemp)"

  (
    set -a
    # shellcheck disable=SC1091
    . "$REPO_ROOT/.env"
    set +a
    export ROLE="$role"
    export API_PORT="$ROLE_PORT"
    export QUEUE_NAMESPACE="$PROOF_NAMESPACE"
    export KAFKA_CONSUMER_GROUP="$PROOF_KAFKA_GROUP"
    for assignment in "$@"; do
      export "${assignment?}"
    done
    exec bun run "$MAIN_TS"
  ) >"$ROLE_LOG" 2>&1 &
  ROLE_PID=$!

  local waited=0
  until curl -s -o /dev/null "http://127.0.0.1:$ROLE_PORT/healthz/live"; do
    if ! kill -0 "$ROLE_PID" 2>/dev/null; then
      fail "ROLE=$role exited before listening — log follows:"
      cat "$ROLE_LOG"
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$CONSUMING_READY_TIMEOUT_S" ]; then
      fail "ROLE=$role did not listen within ${CONSUMING_READY_TIMEOUT_S}s — log follows:"
      cat "$ROLE_LOG"
      kill -9 "$ROLE_PID" 2>/dev/null
      return 1
    fi
  done
  pass "ROLE=$role booted and is listening on :$ROLE_PORT (${waited}s)"
  return 0
}

stop_consuming_role() {
  local role="$1"
  kill -TERM "$ROLE_PID" 2>/dev/null
  local waited=0
  while kill -0 "$ROLE_PID" 2>/dev/null; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge 30 ]; then
      break
    fi
  done
  if kill -0 "$ROLE_PID" 2>/dev/null; then
    fail "ROLE=$role still alive 30s after SIGTERM — killing it"
    kill -9 "$ROLE_PID" 2>/dev/null
    wait "$ROLE_PID" 2>/dev/null
  else
    wait "$ROLE_PID" 2>/dev/null
    local exit_code=$?
    if [ "$exit_code" -eq 0 ]; then
      pass "ROLE=$role SIGTERM shutdown exit code 0 (${waited}s)"
    else
      fail "ROLE=$role SIGTERM shutdown exit code $exit_code, expected 0"
    fi
  fi
}

# The seven registry queues (jobs.registry.ts) — the same names as the Redis
# keys, `cohortCompute` included.
REGISTRY_QUEUES="sessions cron notification import insights gsc cohortCompute"

assert_consuming_role() {
  local role="$1" log="$2" port="$3"

  local started
  started=$(grep -c '"msg":"worker started"' "$log")
  if [ "$started" -eq 7 ]; then
    pass "ROLE=$role started all 7 BullMQ workers"
  else
    fail "ROLE=$role started $started workers, expected 7"
  fi

  for queue in $REGISTRY_QUEUES; do
    if grep -q "\"key\":\"${queue}-${PROOF_NAMESPACE}\"" "$log"; then
      pass "ROLE=$role worker on queue key ${queue}-${PROOF_NAMESPACE}"
    else
      fail "ROLE=$role has no worker for queue $queue"
    fi
  done

  if grep -q '"msg":"updating cron jobs"' "$log"; then
    pass "ROLE=$role upserted the cron schedulers"
  else
    fail "ROLE=$role did not run startSchedulers"
  fi

  if grep -q '"msg":"kafka events consumer running"' "$log"; then
    pass "ROLE=$role started the Kafka ingest consumer"
  else
    fail "ROLE=$role did not start the Kafka ingest consumer"
  fi

  # M9-003 landed dataHealth/windDown/flushExports, so every one of the 20
  # scheduler ids now has a handler on the `cron` queue and this line must NOT
  # appear. It is the runtime half of "every job the old worker ran is served
  # by the merged app under ROLE=worker" — the static half is
  # jobs.registry.test.ts's both-ways scheduler/handler match.
  if grep -q 'cron schedulers have no handler' "$log"; then
    fail "ROLE=$role reported cron schedulers with no handler: $(grep -o '"schedulers":\[[^]]*\]' "$log" | head -1)"
  else
    pass "ROLE=$role: every declared cron scheduler has a handler"
  fi

  local ready_code
  ready_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/healthz/ready")
  if [ "$ready_code" = "200" ]; then
    pass "ROLE=$role GET /healthz/ready -> 200 (consumer heartbeat fresh)"
  else
    fail "ROLE=$role GET /healthz/ready -> $ready_code, expected 200"
  fi

  local metrics
  metrics="$(curl -s "http://127.0.0.1:$port/metrics")"
  assert_contains "$metrics" 'process_cpu_seconds_total' \
    "ROLE=$role /metrics carries the default process metrics"
  assert_contains "$metrics" 'http_request_duration_seconds' \
    "ROLE=$role /metrics carries the route histogram"
  assert_contains "$metrics" 'job_duration_ms' \
    "ROLE=$role /metrics carries job_duration_ms"
  assert_contains "$metrics" 'kafka_events_reprocessed_total' \
    "ROLE=$role /metrics carries the kafka counters"
  assert_contains "$metrics" 'sessions_active_total' \
    "ROLE=$role /metrics carries the session scrape gauges"
  assert_contains "$metrics" 'buffer_event_count' \
    "ROLE=$role /metrics carries the buffer gauges"
  for queue in $REGISTRY_QUEUES; do
    assert_contains "$metrics" "${queue}_${PROOF_NAMESPACE}_waiting_count" \
      "ROLE=$role /metrics carries the $queue queue gauges"
  done

  local board_code
  board_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/bullboard")
  if [ "$board_code" = "401" ]; then
    pass "ROLE=$role mounts bull-board BEHIND the session guard (401, not 200)"
  else
    fail "ROLE=$role GET /bullboard -> $board_code, expected 401"
  fi

  local debug_code
  debug_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/debug/cron")
  if [ "$debug_code" = "200" ]; then
    pass "ROLE=$role serves the dev-only debug routes (NODE_ENV is not production)"
  else
    fail "ROLE=$role GET /debug/cron -> $debug_code, expected 200"
  fi
}

echo
echo "--- Part 4: ROLE=worker ---"
if boot_consuming_role worker; then
  WORKER_LOG="$ROLE_LOG"
  assert_consuming_role worker "$WORKER_LOG" "$ROLE_PORT"

  if grep -q 'keyspace notifications configured' "$WORKER_LOG"; then
    fail "ROLE=worker must NOT set redis keyspace notifications"
  else
    pass "ROLE=worker does NOT set redis keyspace notifications"
  fi

  stop_consuming_role worker
  rm -f "$WORKER_LOG"
fi

echo
echo "--- Part 5: ROLE=all ---"
if boot_consuming_role all; then
  ALL_LOG="$ROLE_LOG"
  assert_consuming_role all "$ALL_LOG" "$ROLE_PORT"

  if grep -q 'keyspace notifications configured' "$ALL_LOG"; then
    pass "ROLE=all sets redis keyspace notifications (ROLE != worker)"
  else
    fail "ROLE=all did not set redis keyspace notifications"
  fi

  stop_consuming_role all
  rm -f "$ALL_LOG"
fi

echo
echo "--- Part 6: the DISABLE_* opt-outs ---"
if boot_consuming_role_with_env worker DISABLE_BULLBOARD=1 DISABLE_WORKERS=1; then
  OPTOUT_LOG="$ROLE_LOG"

  board_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$ROLE_PORT/bullboard")
  if [ "$board_code" = "404" ]; then
    pass "DISABLE_BULLBOARD=1 unmounts bull-board (GET /bullboard -> 404)"
  else
    fail "DISABLE_BULLBOARD=1 should unmount bull-board, got $board_code"
  fi

  if grep -q '"msg":"worker started"' "$OPTOUT_LOG"; then
    fail "DISABLE_WORKERS should start no workers"
  else
    pass "DISABLE_WORKERS starts no workers, schedulers or ingest consumer"
  fi

  if grep -q '"msg":"Workers are disabled"' "$OPTOUT_LOG"; then
    pass "DISABLE_WORKERS says so at boot"
  else
    fail "DISABLE_WORKERS did not log why nothing is consuming"
  fi

  live_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$ROLE_PORT/healthz/live")
  if [ "$live_code" = "200" ]; then
    pass "DISABLE_WORKERS still serves the ops surface"
  else
    fail "DISABLE_WORKERS ops surface -> $live_code, expected 200"
  fi

  stop_consuming_role worker
  rm -f "$OPTOUT_LOG"
fi

# The namespaced BullMQ keys and their job schedulers are this proof's litter;
# an `every` scheduler left in Redis would keep firing forever.
echo
(
  # From apps/api, whose node_modules resolves @openpanel/redis.
  cd "$REPO_ROOT/apps/api" || exit 1
  set -a
  # shellcheck disable=SC1091
  . "$REPO_ROOT/.env"
  set +a
  PROOF_NAMESPACE="$PROOF_NAMESPACE" bun -e '
    const { Redis } = await import("@openpanel/redis");
    const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:23379");
    const pattern = `bull:*-${process.env.PROOF_NAMESPACE}:*`;
    let cursor = "0";
    let removed = 0;
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 1000);
      cursor = next;
      if (keys.length > 0) {
        removed += await redis.del(...keys);
      }
    } while (cursor !== "0");
    console.log(`cleaned ${removed} proof queue keys`);
    await redis.quit();
  '
) && pass "cleaned up the namespaced proof queue keys" \
  || fail "could not clean up the namespaced proof queue keys"

# Nothing this script started may outlive it.
sleep 0.3
LEFTOVER="$(pgrep -f "$MAIN_TS" || true)"
if [ -z "$LEFTOVER" ]; then
  pass "no boot-proof process left behind"
else
  fail "process(es) still running: $LEFTOVER"
  # shellcheck disable=SC2086
  kill -9 $LEFTOVER 2>/dev/null
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "boot-proof.sh: all checks passed"
  exit 0
else
  echo "boot-proof.sh: $FAILURES failure(s)"
  exit 1
fi
