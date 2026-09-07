#!/usr/bin/env bash
#
# P12 grep gates — ADR-013 decision 21: sqlstring = 0, clix = 0, no builder.
#
#   --report   per-file counts + a TOTAL line; always exits 0.
#   --assert   exits 1 while anything is left; exits 0 only when all three
#              totals are 0 AND the three definer files are gone.
#
# Columns
#   sqlstring    every mention of the `sqlstring` identifier: `import`,
#                `require`, `sqlstring.escape(...)` calls, and the
#                `"sqlstring"` / `"@types/sqlstring"` package.json entries.
#   clix         `clix(`, `clix as`, `createCachedClix`, `clixCached`, and any
#                import/require/export whose specifier ends in `query-builder`.
#   sql-builder  `createSqlBuilder`, and any import/require/export whose
#                specifier ends in `sql-builder`.
#
# Scanned: packages/*/src/**, packages/*/index.ts, apps/*/src/**, and every
# workspace package.json — source and manifests only (.ts .tsx .mts .cts .js
# .jsx .mjs .cjs .json), which keeps generated binaries and the `*.proof.md`
# result-set records out of a count that is supposed to reach zero. Never
# node_modules/, dist/, .git/, or the three files that DEFINE what the gate is
# counting (they are the deletion target, not a violation) —
# packages/db/src/clickhouse/query-builder.ts, its .test.ts, and
# packages/db/src/sql-builder.ts.
#
# COMMENT-ONLY MENTIONS DO NOT COUNT. Each line is passed through a small lexer
# that removes `/* ... */` (across lines) and `// ...` to end of line before the
# patterns are applied, so `// clix is dead` or a JSDoc paragraph naming
# `createSqlBuilder` scores 0. Two deliberate limits, both stated so the number
# is not read as more than it is: `://` is never treated as a comment (URLs
# survive), and the lexer does not track string literals, so a `//` inside a
# string truncates the rest of that line. Neither can turn a comment into a hit;
# both could in principle hide one, which is why --assert also requires the
# three definer files to be absent rather than trusting the count alone. JSON
# has no comments, so package.json is never passed through the lexer — an
# exports-map entry like "./modules/*.constants" would otherwise open a block
# comment that swallows the dependency list.
#
# A count is matching LINES, not occurrences: one line with two
# `sqlstring.escape(...)` calls scores 1. The gate's target is 0, so the
# distinction only affects how big the number looks on the way down.
#
# Output is deterministic — no sha, no timestamp — so two runs diff cleanly.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

readonly DEFINER_FILES=(
  'packages/db/src/clickhouse/query-builder.ts'
  'packages/db/src/clickhouse/query-builder.test.ts'
  'packages/db/src/sql-builder.ts'
)

readonly SCANNED_EXTENSIONS='\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$'

readonly COLUMN_WIDTH=12
readonly TABLE_RULE_WIDTH=76

usage() {
  echo "usage: $(basename "$0") --report | --assert" >&2
}

# packages/*/src, packages/*/index.ts, apps/*/src, every workspace package.json.
collect_files() {
  {
    find packages apps -type d \( -name node_modules -o -name dist -o -name .git \) -prune \
      -o -type f -path '*/src/*' -print || true
    find packages -mindepth 2 -maxdepth 3 -type f -name index.ts -print || true
    # docker/data holds the local Postgres/ClickHouse volumes and is unreadable.
    find . -type d \( -name node_modules -o -name dist -o -name .git -o -path './docker/data' \) -prune \
      -o -type f -name package.json -print || true
  } 2>/dev/null |
    sed 's|^\./||' |
    grep -E "$SCANNED_EXTENSIONS" |
    grep -v -e '/node_modules/' -e '^node_modules/' \
      -e '/dist/' -e '^dist/' -e '/\.git/' -e '^\.git/' |
    grep -v -x -F -e "${DEFINER_FILES[0]}" -e "${DEFINER_FILES[1]}" -e "${DEFINER_FILES[2]}" |
    sort -u
}

# Emits "<file>\t<line-number>\t<column>\t<stripped line>" for every matching
# line, once per column it matches. One awk pass over every file.
scan() {
  collect_files | tr '\n' '\0' | xargs -0 -r awk '
    FNR == 1 { inblock = 0; is_json = (FILENAME ~ /\.json$/) }

    {
      line = is_json ? $0 : strip($0)
      if (line ~ /(^|[^A-Za-z0-9_$])sqlstring([^A-Za-z0-9_$]|$)/)
        emit("sqlstring", line)
      if (line ~ /(^|[^A-Za-z0-9_$])clix\(/ ||
          line ~ /(^|[^A-Za-z0-9_$])clix[[:space:]]+as[[:space:]]/ ||
          line ~ /createCachedClix/ ||
          line ~ /clixCached/ ||
          line ~ /(from|import|require)[[:space:]]*\(?[[:space:]]*["'"'"'][^"'"'"']*query-builder["'"'"']/)
        emit("clix", line)
      if (line ~ /createSqlBuilder/ ||
          line ~ /(from|import|require)[[:space:]]*\(?[[:space:]]*["'"'"'][^"'"'"']*sql-builder["'"'"']/)
        emit("sql-builder", line)
    }

    function emit(column, text) {
      sub(/^[[:space:]]+/, "", text)
      sub(/[[:space:]]+$/, "", text)
      printf "%s\t%d\t%s\t%s\n", FILENAME, FNR, column, text
    }

    # Removes block and line comments. See the header for its two known limits.
    function strip(line,   out, i, n, one, two, prev) {
      out = ""; i = 1; n = length(line)
      while (i <= n) {
        one = substr(line, i, 1); two = substr(line, i, 2)
        if (inblock) {
          if (two == "*/") { inblock = 0; i += 2 } else { i += 1 }
          continue
        }
        if (two == "/*") { inblock = 1; i += 2; continue }
        if (two == "//") {
          prev = (i > 1) ? substr(line, i - 1, 1) : ""
          if (prev != ":") break
          out = out two; i += 2; continue
        }
        out = out one; i += 1
      }
      return out
    }
  '
}

print_report() {
  scan | awk -v w="$COLUMN_WIDTH" -v rule="$TABLE_RULE_WIDTH" '
    { count[$1 "\t" $3]++; files[$1] = 1; total[$3]++ }
    END {
      printf "%*s%*s%*s  %s\n", w, "sqlstring", w, "clix", w, "sql-builder", "file"
      for (i = 0; i < rule; i++) printf "-"
      printf "\n"
      n = 0
      for (f in files) ordered[++n] = f
      asort_paths(ordered, n)
      for (i = 1; i <= n; i++) {
        f = ordered[i]
        printf "%*d%*d%*d  %s\n", w, count[f "\tsqlstring"] + 0, \
          w, count[f "\tclix"] + 0, w, count[f "\tsql-builder"] + 0, f
      }
      for (i = 0; i < rule; i++) printf "-"
      printf "\n"
      printf "%*d%*d%*d  %s\n", w, total["sqlstring"] + 0, w, total["clix"] + 0, \
        w, total["sql-builder"] + 0, "TOTAL"
    }
    function asort_paths(a, len,   i, j, tmp) {
      for (i = 2; i <= len; i++) {
        tmp = a[i]; j = i - 1
        while (j > 0 && a[j] > tmp) { a[j + 1] = a[j]; j-- }
        a[j + 1] = tmp
      }
    }
  '
}

assert_clean() {
  local violations=0
  local hits
  hits="$(scan)"

  if [[ -n "$hits" ]]; then
    echo "FAIL: builder / sqlstring references remain (ADR-013 decision 21 wants 0)."
    echo "$hits" | sort | awk -F'\t' '{ printf "  [%s] %s:%s: %s\n", $3, $1, $2, $4 }'
    violations=1
  fi

  for definer in "${DEFINER_FILES[@]}"; do
    if [[ -e "$definer" ]]; then
      echo "FAIL: definer file still exists: $definer"
      violations=1
    fi
  done

  if [[ "$violations" -ne 0 ]]; then
    echo
    print_report
    return 1
  fi

  echo "OK: sqlstring = 0, clix = 0, sql-builder = 0; all three definer files are gone."
  return 0
}

case "${1-}" in
  --report) print_report ;;
  --assert) assert_clean || exit 1 ;;
  *) usage; exit 2 ;;
esac
