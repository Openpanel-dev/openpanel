# Session E2E

Two harnesses over a shared foundation (`lib.ts`), both driving the **real stack**
over HTTP and asserting state in **both ClickHouse and Redis**:

- `session-e2e.ts` (`e2e:sessions`) — **correctness**: the full lifecycle for one
  session per scenario (open/extend/close via reaper + boundary, replay, identify),
  including Redis cleanup.
- `session-stress.ts` (`e2e:sessions:stress`) — **volume + drain**: ramps out many
  sessions, then drives reaper + buffer flushes until *everything* has drained
  (every `session_end` emitted, Redis cleaned, session buffer empty) and reconciles
  the ClickHouse counts. Exits only when nothing is left open.

## What it covers

| Scenario | Asserts |
|----------|---------|
| Single session → reaper close | session blob + wallclock + projects-set in Redis; one `session_start` + N events in CH; after the reaper closes it: one `session_end`, a collapsed `sessions` row, and Redis fully cleaned (blob + wallclock gone, idempotency claim present). |
| Boundary split | a >idle-window gap opens a NEW session id and emits a `session_end` for the first + a `session_start` for the second. |
| Replay | a replay chunk lands in `session_replay_chunks` under the echoed session id. |
| Identify | `session:profile:{pid}:{profileId}` pointer written; events carry the identified `profile_id`. |

## Running

Sessions idle out after 30 min by default. Shrink that and start the stack with
the **same** value the harness uses, then run the harness:

```bash
# 1. Start the stack with a short idle window (Docker must be up: pnpm dock:up)
SESSION_TIMEOUT_MS=4000 pnpm dev

# 2. In another terminal, run the harness with the SAME timeout
SESSION_TIMEOUT_MS=4000 pnpm --filter @openpanel/api e2e:sessions

# …or the stress + drain test (500 sessions by default)
SESSION_TIMEOUT_MS=4000 pnpm --filter @openpanel/api e2e:sessions:stress
```

Stress tunables (env): `E2E_SESSIONS` (500), `E2E_CONCURRENCY` (25),
`E2E_EVENTS_PER_SESSION` (3), `E2E_DRAIN_TIMEOUT_MS` (120000).

It exits non-zero if any check fails and prints a summary. Total run is ~30–60s
with a 4s window (each close waits roughly one idle window).

The harness triggers the reaper on demand via the worker's `/debug/cron`
endpoint, so it never waits for the 5-minute reaper cron.

### Notes
- Uses a dedicated, isolated project (`e2e-sessions`) and a throwaway client
  (`ignoreCorsAndSecret`), created/upserted automatically under org `openpanel-dev`.
- Each run uses fresh device IPs, so reruns don't collide with prior state.
- Overridable: `E2E_API_URL` (default `:3333`), `E2E_WORKER_URL` (default `:9999`).
- The harness and the stack **must share the same `SESSION_TIMEOUT_MS`** — the
  harness derives its idle waits from it.
