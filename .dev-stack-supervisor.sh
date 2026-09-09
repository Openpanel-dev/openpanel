#!/usr/bin/env bash
# Operator-run: keeps the api/worker dev stack up for the M15 wave's e2e gates.
# The stack currently exits on an unhandled rejection when http.metrics.ts
# observes a NaN duration (a 404 can trigger it), so a bare `bun run dev` dies
# and every task with an e2e gate then fails at preflight.
cd /home/deploy/openpanel/apps/api || exit 1
while true; do
  API_PORT=3333 bun run dev >> /tmp/api-dev.log 2>&1
  echo "[$(date -u +%FT%TZ)] dev stack exited, restarting in 3s" >> /tmp/api-dev.log
  sleep 3
done
