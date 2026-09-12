#!/usr/bin/env bash
# Drops ONLY the scratch databases the drill created, and removes the `.sql`
# dumps the migrations write next to themselves (untracked build artifacts).
set -euo pipefail

SCRATCH_DB="${SCRATCH_DB:-openpanel_m16_004}"
PG_ADMIN_URL="${PG_ADMIN_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
CH_ADMIN_URL="${CH_ADMIN_URL:-http://127.0.0.1:8123}"

case "$SCRATCH_DB" in
  openpanel|openpanel_test|postgres)
    echo "refusing to drop '$SCRATCH_DB'" >&2
    exit 1
    ;;
esac

PG_ADMIN_URL="$PG_ADMIN_URL" bun -e "
const sql = new Bun.SQL(process.env.PG_ADMIN_URL);
await sql.unsafe(\`DROP DATABASE IF EXISTS \"\${process.argv[1]}\"\`);
await sql.end();
" "$SCRATCH_DB"
curl -sS --fail-with-body "$CH_ADMIN_URL/" --data-binary "DROP DATABASE IF EXISTS $SCRATCH_DB"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
rm -f "$REPO_ROOT"/packages/db/src/code-migrations/*.sql

echo "dropped scratch databases named $SCRATCH_DB and removed the .sql dumps"
