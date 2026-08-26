#!/usr/bin/env bash
#
# Boots the three app images against real Postgres/Redis/ClickHouse and asserts
# they actually serve traffic.
#
# Why this exists: main-8e60 built green, pushed green, and every dashboard
# route returned 500 (`r.createEffectfulFunction is not a function`) because a
# dependency re-resolve inside the build stage bundled two incompatible copies
# of seroval. Nothing in CI ever started the image, so the first person to find
# out was a self-hoster. The container's own healthcheck could not have caught
# it either — see the note in docker-compose.yml.
set -euo pipefail

cd "$(dirname "$0")"

for var in OP_API_IMAGE OP_DASHBOARD_IMAGE OP_WORKER_IMAGE; do
  if [ -z "${!var:-}" ]; then
    echo "::error::$var is not set"
    exit 1
  fi
done

DASHBOARD="http://localhost:3000"
API="http://localhost:3333"
WORKER="http://localhost:9999"

fail() {
  echo "::error::$*"
  echo "--- container status ---"
  docker compose ps || true
  for svc in op-api op-worker op-dashboard; do
    echo "--- $svc logs ---"
    docker compose logs --no-color --tail=200 "$svc" || true
  done
  exit 1
}

# Waits for a URL to return 2xx. Health-gated startup already covers most of
# this, but the dashboard has no dependency edge that guarantees it is listening
# the instant op-api reports healthy.
wait_for() {
  local name="$1" url="$2" tries=60
  echo "waiting for $name at $url"
  for _ in $(seq $tries); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then
      echo "  $name is up"
      return 0
    fi
    sleep 5
  done
  fail "$name never became reachable at $url"
}

# The real assertion. Renders a route through SSR and requires a genuine HTML
# document back. A 500 here is the seroval class of bug; a 200 with a stub body
# would mean SSR silently degraded.
assert_ssr_route() {
  local path="$1" body status
  echo "asserting SSR route $path"

  status=$(curl -sS -o /tmp/ssr-body -w '%{http_code}' --max-time 30 "$DASHBOARD$path" || echo "000")
  body=$(cat /tmp/ssr-body 2>/dev/null || true)

  if [ "$status" != "200" ]; then
    echo "--- response body (first 60 lines) ---"
    echo "$body" | head -60
    fail "$path returned HTTP $status (expected 200)"
  fi

  case "$body" in
    *"<html"*) ;;
    *) echo "$body" | head -40; fail "$path returned 200 but no <html> — SSR did not render" ;;
  esac

  if [ "${#body}" -lt 1000 ]; then
    echo "$body"
    fail "$path rendered only ${#body} bytes — suspiciously empty for an SSR page"
  fi

  echo "  $path OK (HTTP 200, ${#body} bytes)"
}

# An SSR failure that gets swallowed into a 200 would still show up here.
assert_no_server_errors() {
  local svc="$1" logs
  logs=$(docker compose logs --no-color "$svc" 2>/dev/null || true)

  # These are the shapes a broken bundle or a missing dependency takes.
  if echo "$logs" | grep -qE "is not a function|Cannot find (module|package)|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED"; then
    echo "--- matching lines ---"
    echo "$logs" | grep -nE "is not a function|Cannot find (module|package)|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED" | head -20
    fail "$svc logged a module/runtime resolution error"
  fi
  echo "  $svc logs clean"
}

echo "==> starting stack"
docker compose up -d --wait --wait-timeout 420 || fail "stack never became healthy"

echo "==> service reachability"
wait_for "api" "$API/healthcheck"
wait_for "worker" "$WORKER/healthcheck"
wait_for "dashboard" "$DASHBOARD/api/healthcheck"

echo "==> SSR rendering (the check that would have caught main-8e60)"
assert_ssr_route "/login"

echo "==> server logs"
assert_no_server_errors op-api
assert_no_server_errors op-worker
assert_no_server_errors op-dashboard

echo "==> smoke passed"
