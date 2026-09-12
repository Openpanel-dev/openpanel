#!/usr/bin/env bash
# Fresh-install migration drill (M16-004).
#
# Runs the shipped container start command's migration half — 153 Prisma
# migrations then the 24 code-migrations — against scratch databases, twice,
# and prints what each step did.
#
#   bash docs/migrations-fresh-install/fresh-install-drill.sh rewrite
#   bash docs/migrations-fresh-install/fresh-install-drill.sh guard
#
# `rewrite` is the real drill: ch-scratch-proxy.ts maps the `openpanel`
# database name the migrations hardcode onto the scratch database, so the run
# sees a genuinely empty install. `guard` reproduces M15-203's setup, where
# only CLICKHOUSE_URL pointed at a scratch database.
#
# Teardown is `fresh-install-teardown.sh`. Nothing here touches the `openpanel`
# or `openpanel_test` databases; the proxy refuses any request that would.
set -euo pipefail

MODE="${1:-rewrite}"
SCRATCH_DB="${SCRATCH_DB:-openpanel_m16_004}"
PROXY_PORT="${PROXY_PORT:-8199}"
PROXY_LOG="${PROXY_LOG:-/tmp/ch-scratch-proxy-${MODE}.log}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PG_BASE_URL="${PG_BASE_URL:-postgresql://postgres:postgres@localhost:5432}"
PG_ADMIN_URL="$PG_BASE_URL/postgres"
CH_ADMIN_URL="${CH_ADMIN_URL:-http://127.0.0.1:8123}"

case "$SCRATCH_DB" in
  openpanel|openpanel_test|postgres)
    echo "refusing to use '$SCRATCH_DB' as a scratch database" >&2
    exit 1
    ;;
esac

pg_query() { PG_QUERY_URL="$1" bun -e "
const sql = new Bun.SQL(process.env.PG_QUERY_URL);
const rows = await sql.unsafe(process.argv[1]);
if (Array.isArray(rows) && rows.length) console.log(JSON.stringify(rows));
await sql.end();
" "$2"; }

# The maintenance connection (creates/drops databases) and the scratch database
# itself are different connections — reporting through the wrong one reports the
# dev database's state.
pg_admin() { pg_query "$PG_ADMIN_URL" "$1"; }
pg_scratch() { pg_query "$PG_BASE_URL/$SCRATCH_DB" "$1"; }

ch_admin() { curl -sS --fail-with-body "$CH_ADMIN_URL/" --data-binary "$1"; }

banner() { printf '\n========== %s ==========\n' "$1"; }

banner "0. scratch databases"
pg_admin "DROP DATABASE IF EXISTS \"$SCRATCH_DB\""
pg_admin "CREATE DATABASE \"$SCRATCH_DB\""
ch_admin "DROP DATABASE IF EXISTS $SCRATCH_DB"
ch_admin "CREATE DATABASE $SCRATCH_DB"
echo "postgres: $SCRATCH_DB created"
echo "clickhouse: $SCRATCH_DB created, tables: $(ch_admin "SELECT count() FROM system.tables WHERE database='$SCRATCH_DB'")"

banner "0b. protected databases before the run"
ch_admin "SELECT database, count() FROM system.tables WHERE database IN ('openpanel','openpanel_test') GROUP BY database ORDER BY database FORMAT TSV"

if curl -sS "http://127.0.0.1:$PROXY_PORT/" --data-binary "SELECT 1" >/dev/null 2>&1; then
  echo "port $PROXY_PORT already answers — a stale proxy would silently serve this run" >&2
  exit 1
fi

if [ "$MODE" = "rewrite" ]; then
  PROXY_MODE=rewrite SCRATCH_DATABASE="$SCRATCH_DB" PROXY_PORT="$PROXY_PORT" PROXY_LOG="$PROXY_LOG" \
    bun "$REPO_ROOT/docs/migrations-fresh-install/ch-scratch-proxy.ts" &
else
  PROXY_MODE=guard PROXY_PORT="$PROXY_PORT" PROXY_LOG="$PROXY_LOG" \
    bun "$REPO_ROOT/docs/migrations-fresh-install/ch-scratch-proxy.ts" &
fi
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT
until curl -sS "http://127.0.0.1:$PROXY_PORT/?query=SELECT%201" >/dev/null 2>&1; do sleep 0.2; done

export DATABASE_URL="$PG_BASE_URL/$SCRATCH_DB?schema=public"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export CLICKHOUSE_URL="http://127.0.0.1:$PROXY_PORT/$SCRATCH_DB"
export SELF_HOSTED=true

run_once() {
  banner "$1 — prisma migrate deploy"
  local started=$SECONDS
  (cd "$REPO_ROOT/packages/db" && bunx prisma@6.14.0 migrate deploy) || return 1
  echo "[timing] $1 prisma migrate deploy: $((SECONDS - started))s"

  banner "$1 — code migrations"
  started=$SECONDS
  (cd "$REPO_ROOT/packages/core" && bun scripts/migrate-code.ts) || return 1
  echo "[timing] $1 code migrations: $((SECONDS - started))s"
}

FIRST_RESULT=ok
run_once "RUN 1" || FIRST_RESULT=failed

banner "state after run 1 ($FIRST_RESULT)"
pg_scratch "SELECT count(*)::int AS applied FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL" || true
pg_scratch "SELECT count(*)::int AS code_migrations FROM \"__code_migrations\"" || true
ch_admin "SELECT count() FROM system.tables WHERE database='$SCRATCH_DB'"

SECOND_RESULT=ok
run_once "RUN 2 (idempotency)" || SECOND_RESULT=failed

banner "state after run 2 ($SECOND_RESULT)"
pg_scratch "SELECT count(*)::int AS applied FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL" || true
pg_scratch "SELECT count(*)::int AS code_migrations FROM \"__code_migrations\"" || true
ch_admin "SELECT count() FROM system.tables WHERE database='$SCRATCH_DB'"

banner "protected databases after the run"
ch_admin "SELECT database, count() FROM system.tables WHERE database IN ('openpanel','openpanel_test') GROUP BY database ORDER BY database FORMAT TSV"

banner "verdict"
echo "mode=$MODE run1=$FIRST_RESULT run2=$SECOND_RESULT proxy log: $PROXY_LOG"
