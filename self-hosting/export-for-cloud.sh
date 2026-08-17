#!/usr/bin/env bash
#
# Export OpenPanel ClickHouse data to gzipped JSONL, ready to be re-inserted
# into another OpenPanel instance (e.g. OpenPanel Cloud).
#
# Run it on the self-hosted server:
#
#   chmod +x export-for-cloud.sh
#   ./export-for-cloud.sh
#
# It finds the ClickHouse container by itself. If that fails — Coolify, Dokploy,
# Portainer and friends all rename containers — point it at one explicitly:
#
#   ./export-for-cloud.sh --list                 # show every candidate
#   ./export-for-cloud.sh --container a1b2c3d4   # container ID or name
#
# Every flag has an env-var equivalent; the flag wins.
#
#   --container <id|name>   CH_CONTAINER    Docker container running ClickHouse
#   --out <dir>             OUT_DIR         Output directory (default ./op-export)
#   --project-id <a,b>      PROJECT_ID      Only these projects (default: all)
#   --from "2026-05-01"     FROM            Only rows with created_at >= this
#   --to "2026-08-16 12:00" TO              Only rows with created_at <  this
#   --tables "events ..."   TABLES          Subset of tables to export
#   --rows-per-file 100000  ROWS_PER_FILE   Max rows per .jsonl.gz file
#   --db openpanel          CH_DB           ClickHouse database
#   --list                                  List candidate containers and exit
#   --help
#
#   CH_USER= / CH_PASSWORD= / CH_HOST=      ClickHouse credentials (rarely needed)
#   GZIP=0                                  Write plain .jsonl instead of .jsonl.gz
#
# TABLES defaults to the four tables that actually need migrating: events,
# sessions, profiles, groups. Everything else in ClickHouse is derived (all the
# _mv views, cohort_members, cohort_metadata), staging (events_imports),
# re-syncable (gsc_*), host-local (self_hosting, events_bots), or dead
# (profile_aliases). Session replays are opt-in and rarely worth it:
#
#   --tables "events sessions profiles groups session_replay_chunks"
#
# Typical migration flow:
#   1. Full export:   ./export-for-cloud.sh
#   2. Ship it:       tar czf op-export.tar.gz op-export && scp ...
#   3. Cut the SDK over to cloud, note the exact time.
#   4. Delta export:  ./export-for-cloud.sh --from "<cutover time>" --out ./op-export-delta
#
set -euo pipefail

CH_DB="${CH_DB:-openpanel}"
OUT_DIR="${OUT_DIR:-./op-export}"
ROWS_PER_FILE="${ROWS_PER_FILE:-100000}"
PROJECT_ID="${PROJECT_ID:-}"
FROM="${FROM:-}"
TO="${TO:-}"
GZIP="${GZIP:-1}"
TABLES="${TABLES:-events sessions profiles groups}"
CH_CONTAINER="${CH_CONTAINER:-}"
LIST_ONLY=0

die() {
  echo "❌ $*" >&2
  exit 1
}

# If ClickHouse dies half way through a file we must not leave a truncated
# .jsonl.gz behind — the importer reads the directory, not the manifest, and
# would import it as if it were complete.
CURRENT_FILE=""
cleanup_partial() {
  local code=$?
  if [[ $code -ne 0 && -n "$CURRENT_FILE" && -f "$CURRENT_FILE" ]]; then
    rm -f "$CURRENT_FILE"
    echo "🧹 Removed partial file: $CURRENT_FILE" >&2
  fi
  exit $code
}
trap cleanup_partial EXIT

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//; $d'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --container) CH_CONTAINER="${2:-}"; shift 2 ;;
    --out | --out-dir) OUT_DIR="${2:-}"; shift 2 ;;
    --project-id) PROJECT_ID="${2:-}"; shift 2 ;;
    --from) FROM="${2:-}"; shift 2 ;;
    --to) TO="${2:-}"; shift 2 ;;
    --tables) TABLES="${2:-}"; shift 2 ;;
    --rows-per-file) ROWS_PER_FILE="${2:-}"; shift 2 ;;
    --db) CH_DB="${2:-}"; shift 2 ;;
    --list | --list-containers) LIST_ONLY=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# ---------------------------------------------------------------------------
# Locate a clickhouse-client we can talk to
#
# Container names are not portable: docker compose gives you
# `self-hosting-op-ch-1`, Coolify/Dokploy give you `op-ch-<random>-<random>`,
# and a host can easily run more than one ClickHouse. So we never guess by
# name alone — a candidate only counts if it actually holds the OpenPanel
# `events` table, and if several do we stop and make the user choose.
# ---------------------------------------------------------------------------
CH_AUTH=()
if [[ -n "${CH_HOST:-}" ]]; then CH_AUTH+=(--host="$CH_HOST"); fi
if [[ -n "${CH_USER:-}" ]]; then CH_AUTH+=(--user="$CH_USER"); fi
if [[ -n "${CH_PASSWORD:-}" ]]; then CH_AUTH+=(--password="$CH_PASSWORD"); fi
# Prints "1" when the container holds "$CH_DB.events", "0" otherwise.
# `${arr[@]+...}` keeps the empty-array case working on bash 3.2 under `set -u`.
probe_container() {
  docker exec "$1" clickhouse-client ${CH_AUTH[@]+"${CH_AUTH[@]}"} \
    --query "SELECT count() FROM system.tables WHERE database = '$CH_DB' AND name = 'events'" \
    </dev/null 2>/dev/null || echo 0
}

docker_ps() { docker ps --format '{{.ID}}\t{{.Names}}\t{{.Image}}' 2>/dev/null || true; }

# Anything that smells like ClickHouse by image or by name, in that order.
name_matched_containers() {
  docker_ps | awk -F'\t' 'tolower($3) ~ /clickhouse/ || tolower($2) ~ /clickhouse|op-ch/ { print }'
}

list_candidates() {
  local rows
  rows="$(docker_ps)"
  if [[ -z "$rows" ]]; then
    die "No running docker containers (is docker running, and do you need sudo?)."
  fi
  echo "🐳 Running containers, and whether they hold '$CH_DB.events':"
  echo
  printf '   %-14s %-42s %s\n' 'CONTAINER ID' 'NAME' 'OPENPANEL DATA'
  while IFS=$'\t' read -r cid cname cimage <&3; do
    if [[ -z "$cid" ]]; then continue; fi
    if [[ "$(probe_container "$cid")" == "1" ]]; then
      printf '   %-14s %-42s ✅ yes\n' "$cid" "$cname"
    else
      printf '   %-14s %-42s –\n' "$cid" "$cname"
    fi
  done 3<<<"$rows"
  echo
  echo "   Then run: $0 --container <CONTAINER ID>"
  return 0
}

if [[ "$LIST_ONLY" == "1" ]]; then
  list_candidates
  exit 0
fi

CH=()
if [[ -n "$CH_CONTAINER" ]]; then
  docker inspect "$CH_CONTAINER" >/dev/null 2>&1 ||
    die "No such container: '$CH_CONTAINER'. Run '$0 --list' to see what is available."
  if [[ "$(probe_container "$CH_CONTAINER")" != "1" ]]; then
    die "Container '$CH_CONTAINER' does not have a '$CH_DB.events' table. Wrong container, or wrong --db?"
  fi
  CH=(docker exec -i "$CH_CONTAINER" clickhouse-client)
else
  # Probe every plausible container, then fall back to probing all of them —
  # a rebranded or retagged image should not stop the export.
  matches=()
  for scope in name_matched_containers docker_ps; do
    while IFS=$'\t' read -r cid cname cimage <&3; do
      [[ -z "$cid" ]] && continue
      if [[ "$(probe_container "$cid")" == "1" ]]; then
        matches+=("$cid|$cname")
      fi
    done 3<<<"$($scope)"
    if [[ ${#matches[@]} -gt 0 ]]; then break; fi
  done

  if [[ ${#matches[@]} -eq 1 ]]; then
    CH_CONTAINER="${matches[0]%%|*}"
    echo "🐳 ClickHouse container: ${matches[0]#*|} ($CH_CONTAINER)"
    CH=(docker exec -i "$CH_CONTAINER" clickhouse-client)
  elif [[ ${#matches[@]} -gt 1 ]]; then
    echo "❌ Found ${#matches[@]} containers with a '$CH_DB.events' table:" >&2
    for match in "${matches[@]}"; do
      printf '   %-14s %s\n' "${match%%|*}" "${match#*|}" >&2
    done
    die "Pick one: $0 --container <CONTAINER ID>"
  elif command -v clickhouse-client >/dev/null 2>&1; then
    echo "🖥️  Using clickhouse-client from PATH"
    CH=(clickhouse-client)
  else
    echo "❌ Could not find a ClickHouse container holding '$CH_DB.events'." >&2
    echo >&2
    list_candidates >&2 || true
    die "Set the container explicitly with --container <id>."
  fi
fi

CH+=(--database="$CH_DB" --max_execution_time=0)
if [[ -n "${CH_HOST:-}" ]]; then CH+=(--host="$CH_HOST"); fi
if [[ -n "${CH_USER:-}" ]]; then CH+=(--user="$CH_USER"); fi
if [[ -n "${CH_PASSWORD:-}" ]]; then CH+=(--password="$CH_PASSWORD"); fi

# stdin is closed on purpose: `docker exec -i` would otherwise swallow the
# day-list we are reading from in the export loop below.
chq() { "${CH[@]}" --query="$1" </dev/null; }

chq "SELECT 1" >/dev/null || die "Could not query ClickHouse database '$CH_DB'."

# ---------------------------------------------------------------------------
# Per-table export rules
#
# sessions / profiles / groups are Replacing- or CollapsingMergeTree, so they
# need FINAL (+ a sign/deleted filter) to get one current row per entity.
# `country` is a LowCardinality(FixedString(2)) which JSON-encodes empty values
# as "  " — we normalise it to "" so the JSONL stays clean.
# ---------------------------------------------------------------------------
COUNTRY_FIX="* EXCEPT (country), replaceAll(toString(country), '\\0', '') AS country"

tbl_select() {
  case "$1" in
    events | sessions) echo "$COUNTRY_FIX" ;;
    *) echo "*" ;;
  esac
}

tbl_from() {
  case "$1" in
    sessions | profiles | groups) echo "$1 FINAL" ;;
    *) echo "$1" ;;
  esac
}

tbl_extra() {
  case "$1" in
    sessions) echo "AND sign > 0" ;;
    groups) echo "AND deleted = 0" ;;
    *) echo "" ;;
  esac
}

# Deterministic tiebreaker so LIMIT/OFFSET paging never skips or repeats a row.
tbl_order() {
  case "$1" in
    session_replay_chunks) echo "started_at, session_id, chunk_index" ;;
    *) echo "created_at, id" ;;
  esac
}

# Column used to slice the export into daily windows. Every exportable table
# keys on a DateTime64(3), so the bounds below are always toDateTime64.
tbl_date() {
  case "$1" in
    session_replay_chunks) echo "started_at" ;;
    *) echo "created_at" ;;
  esac
}

# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
project_filter="1"
if [[ -n "$PROJECT_ID" ]]; then
  project_filter="project_id IN ('${PROJECT_ID//,/','}')"
fi

build_range_filter() {
  local col="$1" out=""
  if [[ -n "$FROM" ]]; then out="$out AND $col >= toDateTime64('$FROM', 3)"; fi
  if [[ -n "$TO" ]]; then out="$out AND $col < toDateTime64('$TO', 3)"; fi
  echo "$out"
}

mkdir -p "$OUT_DIR"
MANIFEST="$OUT_DIR/manifest.jsonl"
: >"$MANIFEST"

ch_version="$(chq "SELECT version()")"
echo "📦 ClickHouse $ch_version — exporting to $OUT_DIR"
echo "   projects: ${PROJECT_ID:-<all>}   range: ${FROM:-<start>} .. ${TO:-<now>}"
echo

declare -a summary_tables=()
declare -a summary_rows=()
declare -a summary_files=()

for table in $TABLES; do
  exists="$(chq "SELECT count() FROM system.tables WHERE database = '$CH_DB' AND name = '$table'")"
  if [[ "$exists" == "0" ]]; then
    echo "⏭️  $table — table does not exist, skipping"
    continue
  fi

  select_expr="$(tbl_select "$table")"
  from_expr="$(tbl_from "$table")"
  extra="$(tbl_extra "$table")"
  order_expr="$(tbl_order "$table")"
  date_col="$(tbl_date "$table")"
  where="WHERE $project_filter $extra$(build_range_filter "$date_col")"

  table_dir="$OUT_DIR/$table"
  mkdir -p "$table_dir"

  echo "▶️  $table"

  table_rows=0
  table_files=0

  # One pass to learn how many rows live on each day, then page through the
  # days. Day-sized windows keep OFFSET tiny, so paging stays cheap.
  while IFS=$'\t' read -r day next_day day_rows <&3; do
    [[ -z "$day" ]] && continue

    offset=0
    part=0
    day_written=0
    while ((offset < day_rows)); do
      file="$table_dir/${table}-${day}-$(printf '%04d' "$part").jsonl"

      sql="SELECT $select_expr
           FROM $from_expr
           $where
             AND $date_col >= toDateTime64('$day', 3)
             AND $date_col <  toDateTime64('$next_day', 3)
           ORDER BY $order_expr
           LIMIT $ROWS_PER_FILE OFFSET $offset
           FORMAT JSONEachRow"

      if [[ "$GZIP" == "1" ]]; then file="$file.gz"; fi
      CURRENT_FILE="$file"
      if [[ "$GZIP" == "1" ]]; then
        chq "$sql" | gzip -c >"$file"
        written="$(gzip -dc "$file" | wc -l | tr -d ' ')"
      else
        chq "$sql" >"$file"
        written="$(wc -l <"$file" | tr -d ' ')"
      fi
      CURRENT_FILE=""

      # Count what actually landed rather than what the counting pass predicted.
      # On a live system the two differ: rows written between the two queries
      # still make it into the file, and a stale estimate would make the
      # verifier cry wolf.
      printf '{"table":"%s","file":"%s","day":"%s","rows":%s}\n' \
        "$table" "$(basename "$file")" "$day" "$written" >>"$MANIFEST"

      day_written=$((day_written + written))
      offset=$((offset + ROWS_PER_FILE))
      part=$((part + 1))
      table_files=$((table_files + 1))
    done

    table_rows=$((table_rows + day_written))
    printf '   %s  %8s rows\n' "$day" "$day_written"
  done 3< <(chq "SELECT toDate($date_col) AS d, toDate($date_col) + 1 AS d_next, count() AS c
                 FROM $from_expr
                 $where
                 GROUP BY d
                 HAVING c > 0
                 ORDER BY d")

  echo "   ✅ $table: $table_rows rows in $table_files file(s)"
  echo

  summary_tables+=("$table")
  summary_rows+=("$table_rows")
  summary_files+=("$table_files")
done

# ---------------------------------------------------------------------------
# Metadata — lets the import side sanity-check counts and remap project ids
# ---------------------------------------------------------------------------
project_ids="$(chq "SELECT groupUniqArray(project_id) FROM events WHERE $project_filter" 2>/dev/null | tr -d '\n' || true)"

{
  echo '{'
  printf '  "exported_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "clickhouse_version": "%s",\n' "$ch_version"
  printf '  "database": "%s",\n' "$CH_DB"
  printf '  "project_id_filter": "%s",\n' "$PROJECT_ID"
  printf '  "from": "%s",\n' "$FROM"
  printf '  "to": "%s",\n' "$TO"
  printf '  "project_ids_in_events": "%s",\n' "$project_ids"
  echo '  "tables": {'
  for i in "${!summary_tables[@]}"; do
    sep=","
    if ((i == ${#summary_tables[@]} - 1)); then sep=""; fi
    printf '    "%s": { "rows": %s, "files": %s }%s\n' \
      "${summary_tables[$i]}" "${summary_rows[$i]}" "${summary_files[$i]}" "$sep"
  done
  echo '  }'
  echo '}'
} >"$OUT_DIR/_meta.json"

echo "🎉 Done."
echo
echo "   Projects found: $project_ids"
for i in "${!summary_tables[@]}"; do
  printf '   %-16s %10s rows\n' "${summary_tables[$i]}" "${summary_rows[$i]}"
done
echo
echo "   Output:   $OUT_DIR ($(du -sh "$OUT_DIR" | cut -f1))"
echo "   Manifest: $MANIFEST"
echo
echo "   Ship it with:"
echo "     tar czf op-export.tar.gz -C \"$(dirname "$OUT_DIR")\" \"$(basename "$OUT_DIR")\""
