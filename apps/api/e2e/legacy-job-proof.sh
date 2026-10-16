#!/usr/bin/env bash
# M9-001 acceptance proof (playbook rule 1: a runtime claim gets a runnable
# proof). Loads the repo .env for REDIS_URL, then runs the proof under Bun.
#
#   bash apps/api/e2e/legacy-job-proof.sh
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

exec bun run apps/api/e2e/legacy-job-proof.ts
