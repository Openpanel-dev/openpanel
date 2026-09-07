#!/usr/bin/env bash
#
# P13 drift gate (ADR-014) — does the INSTALLED tree still match what pnpm
# resolved?
#
#   --report   every drifted direct dependency, per workspace package, plus a
#              TOTAL line. Always exits 0.
#   --assert   exits 1 if anything drifted, printing the offenders; exits 0
#              when the installed tree matches the snapshot exactly.
#
# The reference is tooling/gates/p13-lock-snapshot.json, generated from
# pnpm-lock.yaml by tooling/scripts/write-p13-lock-snapshot.ts. It is a
# separate committed file because M13-002 deletes pnpm-lock.yaml: after that
# commit the snapshot is the only record of what pnpm had resolved, and it is
# what makes "the installer swap moved nothing" a checkable claim rather than
# an assertion. ADR-014's stop rule is exactly this question.
#
# The installed version of <dep> for workspace package <pkg> is read from
#   <pkg>/node_modules/<dep>/package.json     (the isolated layout pnpm and
#                                              `bun install --linker=isolated`
#                                              both produce)
# falling back to
#   node_modules/<dep>/package.json           (a hoisted layout, which
#                                              ADR-014 amendment 1 allows only
#                                              with a recorded reason)
# so the gate reads both layouts unchanged. A dependency present in neither is
# reported as `missing` and counts as drift — an undeclared/unlinked
# dependency is the phantom-dependency failure the isolated layout exists to
# surface.
#
# Workspace links are compared too, at the linked package's own version. A
# resolver silently preferring the REGISTRY copy of a workspace package over
# the local source is a documented hazard on this tree (apps/start depends on
# @openpanel/web@1.0.5 from npm while packages/sdks/web is 1.4.1-local), and it
# shows up here as a version mismatch rather than as a mystery at runtime.
#
# Output is deterministic — no timestamps, no paths outside the repo — so two
# runs diff cleanly.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

readonly SNAPSHOT='tooling/gates/p13-lock-snapshot.json'
readonly IMPORTER_COLUMN_WIDTH=26
readonly DEPENDENCY_COLUMN_WIDTH=34
readonly VERSION_COLUMN_WIDTH=16
readonly TABLE_RULE_WIDTH=92

usage() {
  echo "usage: $(basename "$0") --report | --assert" >&2
}

# Emits "<importer>\t<dependency>\t<expected>\t<installed>" for every direct
# dependency whose installed version differs from the snapshot. `missing` in
# the installed column means the package is not present in either layout.
scan() {
  bun -e '
    import { readFileSync } from "node:fs";
    import { join } from "node:path";

    const snapshot = JSON.parse(readFileSync(process.argv[1], "utf8"));

    const installedVersion = (importer, name) => {
      const roots = importer === "." ? ["."] : [importer, "."];
      for (const root of roots) {
        try {
          const manifest = JSON.parse(
            readFileSync(join(root, "node_modules", name, "package.json"), "utf8")
          );
          if (manifest.version) return manifest.version;
        } catch {}
      }
      return null;
    };

    const rows = [];
    for (const importer of Object.keys(snapshot).sort()) {
      for (const name of Object.keys(snapshot[importer]).sort()) {
        const expected = snapshot[importer][name];
        const installed = installedVersion(importer, name);
        if (installed !== expected) {
          rows.push([importer, name, expected, installed ?? "missing"].join("\t"));
        }
      }
    }
    if (rows.length) process.stdout.write(rows.join("\n") + "\n");
  ' "$SNAPSHOT"
}

# The number of (importer, dependency) pairs the snapshot covers — printed so
# a TOTAL of 0 is readable as "0 of N drifted" rather than "nothing ran".
snapshot_size() {
  bun -e '
    import { readFileSync } from "node:fs";
    const snapshot = JSON.parse(readFileSync(process.argv[1], "utf8"));
    let total = 0;
    for (const deps of Object.values(snapshot)) total += Object.keys(deps).length;
    console.log(`${Object.keys(snapshot).length} ${total}`);
  ' "$SNAPSHOT"
}

table_rule() {
  printf '%*s\n' "$TABLE_RULE_WIDTH" '' | tr ' ' '-'
}

print_report() {
  local drift importers pairs drifted=0
  drift="$(scan)"
  read -r importers pairs <<<"$(snapshot_size)"
  [[ -n "$drift" ]] && drifted=$(printf '%s\n' "$drift" | wc -l | tr -d ' ')

  printf '%-*s%-*s%-*s%s\n' \
    "$IMPORTER_COLUMN_WIDTH" "workspace package" \
    "$DEPENDENCY_COLUMN_WIDTH" "dependency" \
    "$VERSION_COLUMN_WIDTH" "snapshot" "installed"
  table_rule

  if [[ -n "$drift" ]]; then
    printf '%s\n' "$drift" | awk -F'\t' \
      -v i="$IMPORTER_COLUMN_WIDTH" -v d="$DEPENDENCY_COLUMN_WIDTH" -v v="$VERSION_COLUMN_WIDTH" \
      '{ printf "%-*s%-*s%-*s%s\n", i, $1, d, $2, v, $3, $4 }'
  fi

  table_rule
  printf 'TOTAL: %s drifted of %s direct dependencies across %s workspace packages\n' \
    "$drifted" "$pairs" "$importers"
}

assert_clean() {
  local drift
  drift="$(scan)"

  if [[ -n "$drift" ]]; then
    echo "FAIL: the installed tree does not match $SNAPSHOT."
    printf '%s\n' "$drift" |
      awk -F'\t' '{ printf "  %s: %s expected %s, installed %s\n", $1, $2, $3, $4 }'
    echo
    print_report
    return 1
  fi

  echo "OK: every direct dependency matches $SNAPSHOT."
  return 0
}

[[ -f "$SNAPSHOT" ]] || {
  echo "FAIL: $SNAPSHOT is missing — regenerate it with tooling/scripts/write-p13-lock-snapshot.ts" >&2
  exit 1
}

case "${1-}" in
  --report) print_report ;;
  --assert) assert_clean || exit 1 ;;
  *) usage; exit 2 ;;
esac
