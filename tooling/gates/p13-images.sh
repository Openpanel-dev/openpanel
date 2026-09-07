#!/usr/bin/env bash
#
# P13 image gate (ADR-014, M13-003) — do BOTH images build on `bun install`,
# and does what they build actually BOOT?
#
# ADR-014's own gate line is "all Dockerfiles build", and `.github/smoke/smoke.sh:6-11`
# is the repo's record of why that is not enough: main-8e60 built green, pushed
# green, and every dashboard route returned 500. So this gate does the same two
# things that script does — start the image and assert a real server-rendered
# page — rather than stopping at a successful build.
#
# What it does:
#   1. builds apps/api/Dockerfile (with a dummy DATABASE_URL build arg — the
#      build stage's `bun run codegen` only needs the variable to exist, it
#      never connects) and apps/start/Dockerfile;
#   2. runs the api image with `--network host` against this box's already
#      running Postgres/ClickHouse/Redis/Redpanda and asserts /healthz/ready = 200;
#   3. runs the dashboard image the same way and asserts smoke.sh's
#      assert_ssr_route conditions for /login — HTTP 200, an `<html`, at least
#      1000 bytes — plus assert_no_server_errors on the container log;
#   4. stops and removes both containers, always;
#   5. prunes the build cache.
#
# The prune also runs BETWEEN the two builds. Measured on this box on
# 2026-09-07: one from-scratch build leaves ~6GB of cache and the box had 12GB
# free, so building both without an intermediate prune fills the disk. The two
# builds share no cache anyway — they start from different base layers.
#
# DATABASES: the isolated `openpanel_test` Postgres and ClickHouse, never the
# prod-copy `openpanel` ones — both containers are read-only against them in
# practice (a session lookup and a readiness probe), but the rule is the rule.
#
# ENVIRONMENT: the repo `.env` is sourced into this shell for the two values a
# gate must not invent — ENCRYPTION_KEY and COOKIE_SECRET — and every other
# variable the containers get is written out explicitly below, so the api's
# database URLs and ports cannot be inherited from a developer's `.env`
# (which pins API_PORT=3333 and points CLICKHOUSE_URL at the prod copy).
# `--env-file` is deliberately not used: `.env` contains
# `DATABASE_URL_DIRECT="$DATABASE_URL"`, a shell expansion docker does not
# perform.
#
# DISK is the operational risk here: two from-scratch workspace installs
# produce several GB of build cache on a box that has ~15G free, so the prune
# runs on success, on failure and on an interrupt. It is a
# `docker builder prune -f --all` — build cache only; it does not touch images
# or the containers already running on this box.
#
# `--all` is not decoration. Measured on this box on 2026-09-07, immediately
# after a full gate run: a plain `docker builder prune -f` reclaimed **0B** and
# left **22.91GB** of cache (buildkit's default policy keeps recent records);
# `docker builder prune -af` on the same state reclaimed **20.89GB** and took
# the disk from 3.4G to 23G free. Without `--all` this gate fills the box in
# two or three runs, which is the exact failure it is supposed to prevent.
# Nothing else on this box builds images, so discarding all cache costs only
# rebuild time — one from-scratch build of either image is ~1.5-3 min.
#
#   bash tooling/gates/p13-images.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

readonly RUN_DIR="${P13_IMAGES_RUN_DIR:-/tmp/openpanel-p13-images}"
readonly API_BUILD_LOG="$RUN_DIR/api-build.log"
readonly DASHBOARD_BUILD_LOG="$RUN_DIR/dashboard-build.log"
readonly API_LOG="$RUN_DIR/api.log"
readonly DASHBOARD_LOG="$RUN_DIR/dashboard.log"
readonly BODY_FILE="$RUN_DIR/ssr-body.html"

readonly API_IMAGE='openpanel-api:p13-gate'
readonly DASHBOARD_IMAGE='openpanel-dashboard:p13-gate'
readonly API_CONTAINER='op-p13-gate-api'
readonly DASHBOARD_CONTAINER='op-p13-gate-dashboard'

# The build stage exports DATABASE_URL so `prisma generate` has one; it is
# never dialled. Deliberately not a reachable host.
readonly DUMMY_DATABASE_URL='postgresql://p13-gate:p13-gate@127.0.0.1:1/p13-gate'

# smoke.sh's own thresholds, reproduced rather than referenced.
readonly MIN_SSR_BODY_BYTES=1000
readonly SSR_REQUEST_TIMEOUT_SECONDS=30
readonly RESOLUTION_ERROR_PATTERN='is not a function|Cannot find (module|package)|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED'

readonly API_READY_TIMEOUT_SECONDS=180
readonly DASHBOARD_READY_TIMEOUT_SECONDS=120
readonly READY_POLL_INTERVAL_SECONDS=2

FAILED=0

# --- lifecycle ---------------------------------------------------------------

remove_container() {
  local name="$1"
  docker rm -f "$name" >/dev/null 2>&1 || true
}

cleanup() {
  docker logs "$DASHBOARD_CONTAINER" >"$DASHBOARD_LOG" 2>&1 || true
  docker logs "$API_CONTAINER" >"$API_LOG" 2>&1 || true
  remove_container "$DASHBOARD_CONTAINER"
  remove_container "$API_CONTAINER"
  prune_build_cache
}
trap cleanup EXIT INT TERM

prune_build_cache() {
  echo '==> pruning the build cache'
  docker builder prune -f --all 2>&1 | tail -1
  df -h / | awk 'NR==2{print "  disk: "$4" free"}'
}

fail() {
  echo "FAIL: $*" >&2
  FAILED=1
}

die() {
  fail "$@"
  exit 1
}

free_port() {
  bun -e 'const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } }); console.log(s.port); s.stop(true);'
}

wait_ready() {
  local name="$1" url="$2" timeout="$3" container="$4" waited=0
  until curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; do
    if [[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" != 'true' ]]; then
      docker logs "$container" 2>&1 | tail -40 >&2
      die "$name exited before it became ready"
    fi
    sleep "$READY_POLL_INTERVAL_SECONDS"
    waited=$((waited + READY_POLL_INTERVAL_SECONDS))
    if ((waited >= timeout)); then
      docker logs "$container" 2>&1 | tail -40 >&2
      die "$name never became ready at $url within ${timeout}s"
    fi
  done
  echo "  $name ready at $url (${waited}s)"
}

# --- assertions --------------------------------------------------------------

assert_ssr_route() {
  local path="$1" status bytes

  status=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
    --max-time "$SSR_REQUEST_TIMEOUT_SECONDS" "http://localhost:$DASHBOARD_PORT$path" || echo '000')
  bytes=$(wc -c <"$BODY_FILE" 2>/dev/null | tr -d ' ')
  bytes=${bytes:-0}

  if [[ "$status" != '200' ]]; then
    head -60 "$BODY_FILE" >&2 2>/dev/null
    fail "$path returned HTTP $status (expected 200)"
    return 1
  fi
  if ! grep -q '<html' "$BODY_FILE"; then
    head -40 "$BODY_FILE" >&2
    fail "$path returned 200 but no <html> — SSR did not render"
    return 1
  fi
  if ((bytes < MIN_SSR_BODY_BYTES)); then
    cat "$BODY_FILE" >&2
    fail "$path rendered only ${bytes} bytes — suspiciously empty for an SSR page"
    return 1
  fi

  echo "  $path OK (HTTP 200, ${bytes} bytes)"
}

assert_no_server_errors() {
  local name="$1"
  local container="$2"
  local log="$RUN_DIR/$name-check.log"
  docker logs "$container" >"$log" 2>&1 || true
  if grep -qE "$RESOLUTION_ERROR_PATTERN" "$log"; then
    grep -nE "$RESOLUTION_ERROR_PATTERN" "$log" | head -20 >&2
    fail "$name logged a module/runtime resolution error"
    return 1
  fi
  echo "  $name log clean"
}

# --- run ---------------------------------------------------------------------

mkdir -p "$RUN_DIR"
command -v docker >/dev/null || die 'docker is not available'

remove_container "$API_CONTAINER"
remove_container "$DASHBOARD_CONTAINER"

echo '==> building the api image'
if ! docker build -f apps/api/Dockerfile -t "$API_IMAGE" \
  --build-arg "DATABASE_URL=$DUMMY_DATABASE_URL" . >"$API_BUILD_LOG" 2>&1; then
  tail -40 "$API_BUILD_LOG" >&2
  die "the api image did not build — see $API_BUILD_LOG"
fi
echo "  built $API_IMAGE"
prune_build_cache

echo '==> building the dashboard image'
if ! docker build -f apps/start/Dockerfile -t "$DASHBOARD_IMAGE" . >"$DASHBOARD_BUILD_LOG" 2>&1; then
  tail -40 "$DASHBOARD_BUILD_LOG" >&2
  die "the dashboard image did not build — see $DASHBOARD_BUILD_LOG"
fi
echo "  built $DASHBOARD_IMAGE"

# .env supplies what the block below does not name. Sourced FIRST so the
# isolated test databases and the freshly-picked ports override it.
set -a
# shellcheck disable=SC1091
[[ -f .env ]] && source .env
set +a

API_PORT="$(free_port)"
DASHBOARD_PORT="$(free_port)"
[[ -n "$API_PORT" && -n "$DASHBOARD_PORT" ]] || die 'could not pick free ports'

echo "==> starting the api image (ROLE=api) on :$API_PORT"
docker run -d --name "$API_CONTAINER" --network host \
  -e NODE_ENV=production \
  -e ROLE=api \
  -e API_PORT="$API_PORT" \
  -e SELF_HOSTED=true \
  -e ALLOW_REGISTRATION=true \
  -e ALLOW_INVITATION=true \
  -e BATCH_SIZE=5000 \
  -e BATCH_INTERVAL=10000 \
  -e REDIS_URL='redis://localhost:6379' \
  -e CLICKHOUSE_URL='http://localhost:8123/openpanel_test' \
  -e DATABASE_URL='postgresql://postgres:postgres@localhost:5432/openpanel_test?schema=public' \
  -e DATABASE_URL_DIRECT='postgresql://postgres:postgres@localhost:5432/openpanel_test?schema=public' \
  -e DASHBOARD_URL="http://localhost:$DASHBOARD_PORT" \
  -e API_URL="http://localhost:$API_PORT" \
  -e ENCRYPTION_KEY="${ENCRYPTION_KEY:-}" \
  -e COOKIE_SECRET="${COOKIE_SECRET:-p13-images-gate-cookie-secret-not-a-real-secret}" \
  -e EMAIL_SENDER='p13-images-gate@example.com' \
  -e RESEND_API_KEY='re_p13_images_gate_key' \
  -e KAFKA_BROKERS='127.0.0.1:19092' \
  -e KAFKA_EVENTS_TOPIC_PARTITIONS=24 \
  "$API_IMAGE" >/dev/null || die 'could not start the api container'
wait_ready api "http://localhost:$API_PORT/healthz/ready" \
  "$API_READY_TIMEOUT_SECONDS" "$API_CONTAINER"

echo "==> starting the dashboard image on :$DASHBOARD_PORT"
docker run -d --name "$DASHBOARD_CONTAINER" --network host \
  -e NODE_ENV=production \
  -e SELF_HOSTED=true \
  -e PORT="$DASHBOARD_PORT" \
  -e DASHBOARD_URL="http://localhost:$DASHBOARD_PORT" \
  -e API_URL="http://localhost:$API_PORT" \
  "$DASHBOARD_IMAGE" >/dev/null || die 'could not start the dashboard container'
wait_ready dashboard "http://localhost:$DASHBOARD_PORT/api/healthcheck" \
  "$DASHBOARD_READY_TIMEOUT_SECONDS" "$DASHBOARD_CONTAINER"

echo '==> SSR rendering'
assert_ssr_route '/login'

echo '==> container logs'
assert_no_server_errors dashboard "$DASHBOARD_CONTAINER"
assert_no_server_errors api "$API_CONTAINER"

echo '==> image sizes (docker image inspect .Size — COMPRESSED on this box'\''s containerd snapshotter)'
printf '  %-34s %s bytes\n' "$API_IMAGE" "$(docker image inspect --format '{{.Size}}' "$API_IMAGE")"
printf '  %-34s %s bytes\n' "$DASHBOARD_IMAGE" "$(docker image inspect --format '{{.Size}}' "$DASHBOARD_IMAGE")"

if ((FAILED != 0)); then
  echo "p13-images: FAILED (logs in $RUN_DIR)" >&2
  exit 1
fi

echo 'p13-images: PASSED (both images built; api /healthz/ready 200; dashboard /login server-rendered; logs clean)'
