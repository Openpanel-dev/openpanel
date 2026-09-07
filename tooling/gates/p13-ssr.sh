#!/usr/bin/env bash
#
# P13 SSR gate (ADR-014) — does the dashboard still SERVER-RENDER after an
# install?
#
# ADR-014's gate is "apps/start builds AND SSR-renders /login plus one more
# route", and the reason is `.github/smoke/smoke.sh:6-11`: main-8e60 built
# green, pushed green, and every dashboard route returned 500 because a
# dependency re-resolve paired two incompatible copies of seroval. Nothing in
# CI ever started the image. A build that succeeds proves nothing here.
#
# This script is the baseline half of that gate: it is GREEN UNDER PNPM, and
# M13-002 runs it UNCHANGED after the swap. It is therefore deliberately
# installer-agnostic — the only installer-specific thing it does is pick which
# package-manager binary runs the workspace's own `build` script, detected the
# same way verification/full.sh does it (a committed bun.lock means bun
# installed the tree).
#
# What it does, in the Dockerfile's order (apps/start/Dockerfile):
#   1. builds apps/start with NITRO=1 SELF_HOSTED=1 through the package's own
#      `build` script (which goes through `with-env`, i.e. the repo .env);
#   2. reproduces the runner stage's esm-env shim and its BROWSER/NODE/DEV
#      assertion — the standalone Nitro output ships `esm-env-runtime` under
#      the `esm-env` OVERRIDE, and without the shim @number-flow/react's
#      `import "esm-env"` is a hard ERR_MODULE_NOT_FOUND at first render;
#   3. boots apps/api and then `.output/server/index.mjs`, each on a free
#      port, with the `app_env` block from .github/smoke/docker-compose.yml
#      pointed at this box's services and at the api it just started;
#   4. asserts exactly what smoke.sh's assert_ssr_route asserts — HTTP 200, an
#      `<html` in the body, at least 1000 bytes — for /login and /onboarding;
#   5. greps the dashboard's log for the module/runtime resolution errors
#      smoke.sh's assert_no_server_errors greps for, and fails on any hit.
#
# Why /onboarding is the second route: it is the create-an-account page and it
# renders WITHOUT a session by construction — its beforeLoad redirects only
# when a session EXISTS, and its loader is a no-op unless an `inviteId` search
# param is present, so an anonymous request needs no seeded row. It also sits
# under the `_public` layout rather than /login's `_login` one, so the two
# assertions cover two different server-rendered subtrees instead of the same
# layout twice.
#
# DATABASES: the isolated `openpanel_test` Postgres and ClickHouse, never the
# prod-copy `openpanel` ones. Both asserted routes issue exactly one tRPC call
# (auth.session) and read no analytics, so this costs a session lookup.
#
# The two servers it starts are always killed, on success, on failure and on
# an interrupt.
#
#   bash tooling/gates/p13-ssr.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

readonly RUN_DIR="${P13_SSR_RUN_DIR:-/tmp/openpanel-p13-ssr}"
readonly API_LOG="$RUN_DIR/api.log"
readonly DASHBOARD_LOG="$RUN_DIR/dashboard.log"
readonly BUILD_LOG="$RUN_DIR/build.log"
readonly BODY_FILE="$RUN_DIR/ssr-body.html"

readonly SERVER_OUTPUT='apps/start/.output/server'
readonly API_ENTRYPOINT='apps/api/src/main.ts'

# smoke.sh's own thresholds, reproduced rather than referenced.
readonly MIN_SSR_BODY_BYTES=1000
readonly SSR_REQUEST_TIMEOUT_SECONDS=30

readonly API_READY_TIMEOUT_SECONDS=120
readonly DASHBOARD_READY_TIMEOUT_SECONDS=90
readonly READY_POLL_INTERVAL_SECONDS=1
readonly STOP_WAIT_SECONDS=10

# The shapes a broken bundle or a missing dependency takes (smoke.sh:88-90).
readonly RESOLUTION_ERROR_PATTERN='is not a function|Cannot find (module|package)|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED'

API_PID=''
DASHBOARD_PID=''
FAILED=0

# --- process lifecycle -------------------------------------------------------

# Both servers are started so that $! is the server process itself (`env`
# execs the runtime, and the dashboard's subshell uses an explicit `exec`), so
# the pid is the thing holding the port. Any child bash left in between is
# swept first, because a wrapper that outlives its parent keeps the port.
stop_server() {
  local name="$1" pid="$2" child
  [[ -n "$pid" ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill -TERM "$child" 2>/dev/null || true
  done
  kill -TERM "$pid" 2>/dev/null || true

  for _ in $(seq "$STOP_WAIT_SECONDS"); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
  echo "  stopped $name"
}

cleanup() {
  stop_server dashboard "$DASHBOARD_PID"
  stop_server api "$API_PID"
}
trap cleanup EXIT INT TERM

fail() {
  echo "FAIL: $*" >&2
  FAILED=1
}

die() {
  fail "$@"
  echo "--- api log (last 60) ---" >&2
  tail -60 "$API_LOG" 2>/dev/null >&2
  echo "--- dashboard log (last 60) ---" >&2
  tail -60 "$DASHBOARD_LOG" 2>/dev/null >&2
  exit 1
}

free_port() {
  bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop(true);'
}

wait_ready() {
  local name="$1" url="$2" timeout="$3" waited=0 pid="$4"
  until curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; do
    if ! kill -0 "$pid" 2>/dev/null; then
      die "$name exited before it became ready"
    fi
    sleep "$READY_POLL_INTERVAL_SECONDS"
    waited=$((waited + READY_POLL_INTERVAL_SECONDS))
    if ((waited >= timeout)); then
      die "$name never became ready at $url within ${timeout}s"
    fi
  done
  echo "  $name ready at $url (${waited}s)"
}

# --- the assertions ----------------------------------------------------------

# smoke.sh's assert_ssr_route, verbatim in intent: a 200, a real HTML document,
# and enough of it that a degraded-but-200 render still fails.
assert_ssr_route() {
  local path="$1" status bytes
  echo "asserting SSR route $path"

  status=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
    --max-time "$SSR_REQUEST_TIMEOUT_SECONDS" "$DASHBOARD_URL$path" || echo '000')
  bytes=$(wc -c <"$BODY_FILE" 2>/dev/null | tr -d ' ')
  bytes=${bytes:-0}

  if [[ "$status" != '200' ]]; then
    { head -60 "$BODY_FILE" 2>/dev/null; echo; } >&2
    fail "$path returned HTTP $status (expected 200)"
    return 1
  fi
  if ! grep -q '<html' "$BODY_FILE"; then
    { head -40 "$BODY_FILE"; echo; } >&2
    fail "$path returned 200 but no <html> — SSR did not render"
    return 1
  fi
  if ((bytes < MIN_SSR_BODY_BYTES)); then
    { cat "$BODY_FILE"; echo; } >&2
    fail "$path rendered only ${bytes} bytes — suspiciously empty for an SSR page"
    return 1
  fi

  echo "  $path OK (HTTP 200, ${bytes} bytes)"
}

assert_no_server_errors() {
  local name="$1" log="$2"
  if grep -qE "$RESOLUTION_ERROR_PATTERN" "$log" 2>/dev/null; then
    echo "--- matching lines ---" >&2
    grep -nE "$RESOLUTION_ERROR_PATTERN" "$log" | head -20 >&2
    fail "$name logged a module/runtime resolution error"
    return 1
  fi
  echo "  $name log clean"
}

# --- build -------------------------------------------------------------------

detect_package_manager() {
  if [[ -f bun.lock ]]; then echo bun; else echo pnpm; fi
}

build_dashboard() {
  local package_manager="$1"
  echo "==> building apps/start (NITRO=1 SELF_HOSTED=1, via $package_manager)"
  if ! (
    cd apps/start &&
      NITRO=1 SELF_HOSTED=1 "$package_manager" run build
  ) >"$BUILD_LOG" 2>&1; then
    tail -60 "$BUILD_LOG" >&2
    die "apps/start build failed — see $BUILD_LOG"
  fi
  [[ -f "$SERVER_OUTPUT/index.mjs" ]] ||
    die "the build produced no $SERVER_OUTPUT/index.mjs"
  echo "  built $SERVER_OUTPUT/index.mjs"
}

# apps/start/Dockerfile's runner stage, ported. The standalone Nitro output
# preserves the target package name for the esm-env -> esm-env-runtime
# override, so `esm-env` has to be made resolvable inside the SSR bundle.
apply_esm_env_shim() {
  local modules="$SERVER_OUTPUT/node_modules"
  [[ -d "$modules/esm-env-runtime" ]] ||
    die "$modules/esm-env-runtime is missing — the esm-env override did not survive the build"

  if [[ ! -d "$modules/esm-env" ]]; then
    mkdir -p "$modules/esm-env"
    cp "$modules/esm-env-runtime/node.js" "$modules/esm-env/index.js"
    printf '%s\n' \
      '{' \
      '  "name": "esm-env",' \
      '  "version": "1.1.4",' \
      '  "type": "module",' \
      '  "exports": "./index.js"' \
      '}' \
      >"$modules/esm-env/package.json"
  fi

  ( cd "$SERVER_OUTPUT" && node --input-type=module -e '
      const assert = await import("node:assert/strict");
      const env = await import("esm-env");
      assert.equal(env.BROWSER, false, "esm-env BROWSER should be false in the Node SSR runtime");
      assert.equal(env.NODE, true, "esm-env NODE should be true in the Node SSR runtime");
      assert.equal(env.DEV, false, "esm-env DEV should be false in the production runtime");
    ' ) || die 'the esm-env shim does not resolve to the Node runtime build'
  echo "  esm-env resolves (BROWSER=false, NODE=true, DEV=false)"
}

# --- environment -------------------------------------------------------------

# The `app_env` block from .github/smoke/docker-compose.yml, with the compose
# service names replaced by this box's already-running services and the two
# URLs pointed at the ports this script just picked. The DATABASE/CLICKHOUSE
# values are the ISOLATED test databases, never the prod-copy `openpanel` ones.
export_smoke_app_env() {
  export NODE_ENV=production
  export SELF_HOSTED=true
  export BATCH_SIZE=5000
  export BATCH_INTERVAL=10000
  export ALLOW_REGISTRATION=true
  export ALLOW_INVITATION=true
  export REDIS_URL=redis://localhost:6379
  export CLICKHOUSE_URL=http://localhost:8123/openpanel_test
  export DATABASE_URL='postgresql://postgres:postgres@localhost:5432/openpanel_test?schema=public'
  export DATABASE_URL_DIRECT="$DATABASE_URL"
  export DASHBOARD_URL="http://localhost:$DASHBOARD_PORT"
  export API_URL="http://localhost:$API_PORT"
  export COOKIE_SECRET=p13-ssr-gate-cookie-secret-not-a-real-secret
  export EMAIL_SENDER=p13-ssr-gate@example.com
  export RESEND_API_KEY=re_p13_ssr_gate_key
  export KAFKA_BROKERS=127.0.0.1:19092
  export KAFKA_EVENTS_TOPIC_PARTITIONS=24
}

# --- run ---------------------------------------------------------------------

mkdir -p "$RUN_DIR"
: >"$API_LOG"
: >"$DASHBOARD_LOG"

PACKAGE_MANAGER="$(detect_package_manager)"
build_dashboard "$PACKAGE_MANAGER"
apply_esm_env_shim

# .env supplies the vars the smoke block does not name (LOG_LEVEL, secrets,
# feature flags). It is sourced FIRST so that the smoke block and the two
# freshly-picked ports both override it — .env pins API_PORT=3333, and a gate
# that quietly used the developer's own api port would pass against a stack it
# did not start.
set -a
# shellcheck disable=SC1091
[[ -f .env ]] && source .env
set +a

API_PORT="$(free_port)"
DASHBOARD_PORT="$(free_port)"
[[ -n "$API_PORT" && -n "$DASHBOARD_PORT" ]] || die 'could not pick free ports'
export_smoke_app_env

echo "==> starting apps/api (ROLE=api) on :$API_PORT"
env ROLE=api API_PORT="$API_PORT" bun run "$API_ENTRYPOINT" >"$API_LOG" 2>&1 &
API_PID=$!
wait_ready api "http://localhost:$API_PORT/healthz/ready" \
  "$API_READY_TIMEOUT_SECONDS" "$API_PID"

echo "==> starting the dashboard SSR server on :$DASHBOARD_PORT"
# Nitro's node-server preset listens on PORT.
( cd apps/start && exec env PORT="$DASHBOARD_PORT" node .output/server/index.mjs ) \
  >"$DASHBOARD_LOG" 2>&1 &
DASHBOARD_PID=$!
wait_ready dashboard "$DASHBOARD_URL/api/healthcheck" \
  "$DASHBOARD_READY_TIMEOUT_SECONDS" "$DASHBOARD_PID"

echo "==> SSR rendering"
assert_ssr_route '/login'
assert_ssr_route '/onboarding'

echo "==> server logs"
assert_no_server_errors dashboard "$DASHBOARD_LOG"

if ((FAILED != 0)); then
  echo "p13-ssr: FAILED (logs in $RUN_DIR)" >&2
  exit 1
fi

echo "p13-ssr: PASSED (/login and /onboarding rendered; dashboard log clean)"
